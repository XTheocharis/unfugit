# LCM Schema & Database Layer Audit

## Volt (TypeScript/PostgreSQL) -> Crush (Go/SQLite) Port

**Auditor**: Claude Opus 4.6
**Date**: 2026-02-18
**Scope**: Migrations, table structures, constraints, indexes, foreign keys, FTS5 configuration, type mappings

---

## Summary Table

| ID | Severity | Category | Title | Status |
|----|----------|----------|-------|--------|
| DB-1 | **Critical** | Foreign Key | `lcm_summary_messages.message_id` ON DELETE changed from RESTRICT to CASCADE | Semantic change |
| DB-2 | **Critical** | Foreign Key | `lcm_context_items.message_id` ON DELETE changed from RESTRICT to CASCADE | Semantic change |
| DB-3 | **High** | Missing Table | `conversations` table not ported -- sessions table reused | Design decision -- needs verification |
| DB-4 | **High** | Missing Table | `message_parts` table entirely omitted | Feature gap |
| DB-5 | **High** | Missing Table | `agentic_map_runs` / `agentic_map_items` tables omitted | Feature gap |
| DB-6 | **High** | Missing Table | `llm_map_runs` / `llm_map_items` tables omitted | Feature gap |
| DB-7 | **High** | Column Omission | `large_files` missing `exploration_summary` and `explorer_used` columns | Feature gap |
| DB-8 | **High** | Column Omission | `large_files` missing `content` and `binary_content` legacy columns | Intentional simplification -- verify |
| DB-9 | **High** | Type Mapping | `large_files.token_count` is INTEGER in Crush, BIGINT in Volt | Truncation risk for huge files |
| DB-10 | **Medium** | Missing Index | `lcm_large_files` missing `original_path` index | Query performance |
| DB-11 | **Medium** | Missing Index | `lcm_context_items` missing `summary_id` and `message_id` individual indexes | Query performance |
| DB-12 | **Medium** | FTS5 | No FTS5 on messages -- Volt has full-text search on both messages and summaries | Feature gap |
| DB-13 | **Medium** | FTS5 | FTS5 tokenizer not explicitly specified -- defaults to `unicode61` instead of Volt's `english` stemming | Behavioral difference |
| DB-14 | **Medium** | Timestamp | Crush uses seconds (`strftime('%s','now')`), Volt uses `timestamptz`/`now()` | Acceptable -- but inconsistent with existing Crush tables |
| DB-15 | **Medium** | Column Omission | `conversations.ctx_cutoff_threshold` not stored in Crush schema | Config computed at runtime |
| DB-16 | **Medium** | Column Omission | `conversations.model_name` / `model_ctx_max_tokens` not stored | Config computed at runtime |
| DB-17 | **Low** | Column Omission | `summaries.created_at` not returned by `LCMGetSummaryByID` query | Data available but not exposed |
| DB-18 | **Low** | Column Mapping | `file_ids` stored as TEXT in Crush vs `jsonb` in Volt | Functionally equivalent for SQLite |
| DB-19 | **Low** | Goose Format | Migration uses single StatementBegin/End block for entire Up section | Valid but less granular rollback |
| DB-20 | **Low** | Hash Input | `GenerateFileIDFromPath` uses pipe separator and `mtime.Unix()` in Crush vs colon separator and `mtime.getTime()` (ms) in Volt | Different IDs for same file |
| DB-21 | **Medium** | Query Semantics | `LCMGetMessagesToSummarize` uses row LIMIT, Volt uses token-budget window | Behavioral difference |
| DB-22 | **Medium** | Query Semantics | `LCMExpandSummaryToMessages` is non-recursive in Crush, recursive in Volt | Only expands one level |
| DB-23 | **Low** | Missing Query | No `searchMessages` equivalent in Crush | Feature gap |
| DB-24 | **Low** | Missing Query | No `regexSearchMessages` equivalent in Crush | Feature gap |
| DB-25 | **Low** | Missing Query | No `getCoveringSummary` equivalent in Crush | Feature gap |
| DB-26 | **Low** | Missing Query | No `getChildSummaryIds` equivalent in Crush | Feature gap |
| DB-27 | **Low** | Missing Query | No `getAncestorConversationIds` equivalent in Crush | Feature gap |
| DB-28 | **Info** | Naming | Crush tables prefixed with `lcm_`; Volt tables are unprefixed | Intentional -- avoids conflicts |
| DB-29 | **Info** | Primary Key | Volt `messages.message_id` is auto-increment BIGINT; Crush `messages.id` is TEXT (UUID) | Pre-existing Crush design |
| DB-30 | **Medium** | Timestamp Inconsistency | Existing Crush `sessions`/`messages` use millisecond timestamps; LCM tables use second timestamps | Internal inconsistency |

---

## Detailed Findings

---

### DB-1: `lcm_summary_messages.message_id` ON DELETE CASCADE vs Volt's RESTRICT

**Severity**: Critical
**Category**: Foreign Key Semantics

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 433):
```sql
message_id bigint NOT NULL REFERENCES messages(message_id) ON DELETE RESTRICT,
```

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, line 21):
```sql
message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
```

**Analysis**: Volt uses `ON DELETE RESTRICT` for `summary_messages.message_id` to **prevent deletion of messages that are referenced by summaries**. This is a deliberate data integrity safeguard -- messages that have been summarized must not be deleted because the summary lineage would be broken. Crush changes this to `CASCADE`, which means deleting a message would silently remove its summary linkage, potentially orphaning summaries or breaking the DAG structure.

**Recommendation**: Change to `ON DELETE RESTRICT` to match Volt's semantics. If a message must be deletable, the summary linkage should be explicitly cleaned up first.

---

### DB-2: `lcm_context_items.message_id` ON DELETE CASCADE vs Volt's RESTRICT

**Severity**: Critical
**Category**: Foreign Key Semantics

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 467):
```sql
FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE RESTRICT,
```

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, line 54):
```sql
FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
```

**Analysis**: Volt uses `RESTRICT` on `context_items.message_id` to prevent deletion of messages that are currently in the active context window. This ensures context integrity. Crush uses `CASCADE`, meaning deleting a message from the `messages` table would silently remove it from the context window without the LCM system being aware, potentially causing position gaps or context corruption.

**Recommendation**: Change to `ON DELETE RESTRICT`. The `lcm_context_items.summary_id` correctly uses `ON DELETE RESTRICT` (matching Volt), so this should be consistent.

---

### DB-3: `conversations` Table Not Ported -- `sessions` Table Reused

**Severity**: High
**Category**: Missing Table

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 365-372):
```sql
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title                text,
    model_name           text NOT NULL,
    model_ctx_max_tokens integer NOT NULL,
    ctx_cutoff_threshold numeric(5,4) NOT NULL DEFAULT 0.6000,
    created_at           timestamptz NOT NULL DEFAULT now()
);
```
Plus `parent_conversation_id` (line 376).

**Crush**: No `conversations` table. All LCM tables reference `sessions(id)` directly.

**Analysis**: This is an intentional design decision to reuse Crush's existing `sessions` table rather than creating a parallel `conversations` table. This is valid for single-tenant SQLite usage where there is a 1:1 mapping between sessions and conversations. However, this means:

1. **`model_name`** and **`model_ctx_max_tokens`** are not persisted per-session in the database. These appear to be computed at runtime in Crush (see `config.go`).
2. **`ctx_cutoff_threshold`** (the compaction trigger percentage) is not stored per-session. It uses a global constant `DefaultCtxCutoffPercent = 60` (config.go line 7).
3. **`parent_conversation_id`** is available on the `sessions` table as `parent_session_id`, so hierarchical relationships are preserved.

**Recommendation**: Document this mapping explicitly. Verify that runtime computation of model params is acceptable and that no per-conversation configuration variance is needed.

---

### DB-4: `message_parts` Table Entirely Omitted

**Severity**: High
**Category**: Missing Table

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 521-572):
```sql
CREATE TABLE IF NOT EXISTS message_parts (
    part_id         text PRIMARY KEY,
    message_id      bigint NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    session_id      text NOT NULL,
    part_type       message_part_type NOT NULL,
    ordinal         integer NOT NULL,
    -- ... 25+ columns for different part types
);
```

**Crush**: Not present. No equivalent table, no migration, no queries.

**Analysis**: Crush's existing `messages` table already stores parts as JSON in the `parts TEXT` column. This means Crush does not need a separate `message_parts` table for structured part storage since it already has its own format. However, this means LCM-level features that rely on querying individual parts (e.g., finding all tool uses, filtering by part type) are not possible in Crush.

**Recommendation**: This is acceptable if Crush does not need part-level querying. Document as an intentional scope reduction.

---

### DB-5: `agentic_map_runs` / `agentic_map_items` Tables Omitted

**Severity**: High
**Category**: Missing Table

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 588-619):
```sql
CREATE TABLE IF NOT EXISTS agentic_map_runs (...);
CREATE TABLE IF NOT EXISTS agentic_map_items (...);
```

**Crush**: Not present.

**Analysis**: These tables support the "agentic map" feature (parallel map over JSONL items). If Crush does not implement this feature, the omission is correct. If this feature is planned, these tables will need to be added in a future migration.

**Recommendation**: Confirm whether agentic map is in scope for Crush. If not, document as intentionally out of scope.

---

### DB-6: `llm_map_runs` / `llm_map_items` Tables Omitted

**Severity**: High
**Category**: Missing Table

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 621-661):
```sql
CREATE TABLE IF NOT EXISTS llm_map_runs (...);
CREATE TABLE IF NOT EXISTS llm_map_items (...);
```

**Crush**: Not present.

**Analysis**: Same as DB-5. These tables support the non-agentic LLM map feature.

**Recommendation**: Same as DB-5.

---

### DB-7: `large_files` Missing `exploration_summary` and `explorer_used` Columns

**Severity**: High
**Category**: Column Omission

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 577-585):
```sql
ALTER TABLE large_files ADD COLUMN exploration_summary text;
ALTER TABLE large_files ADD COLUMN explorer_used text;
```

These columns are used by the file exploration system (`/tmp/volt/packages/voltcode/src/session/lcm/explore/`) to cache analysis results.

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`): Neither column exists.

Confirmed by grep: No references to `exploration_summary` or `explorer_used` anywhere in `/tmp/crush`.

**Analysis**: The file exploration feature (which analyzes large files using language-specific explorers and caches the results) appears to not be ported to Crush yet. Without these columns, every access to a large file would require re-exploration.

**Recommendation**: Add `exploration_summary TEXT` and `explorer_used TEXT` columns to `lcm_large_files` if the exploration feature is planned.

---

### DB-8: `large_files` Missing `content` and `binary_content` Legacy Columns

**Severity**: High
**Category**: Column Omission

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 482-483):
```sql
content         text,           -- Legacy: kept for backwards compatibility
binary_content  bytea,          -- Legacy: kept for backwards compatibility
```

**Crush**: Neither column exists. Only `original_path` is stored.

**Analysis**: This appears to be an intentional simplification. Volt kept these columns for backwards compatibility with older records that stored file content inline. Since Crush is a fresh implementation, there is no legacy data to support. The path-only approach is consistent with Volt's newer `insertLargeFileFromPath` pattern.

**Recommendation**: Acceptable. Document that Crush only supports path-based large file storage.

---

### DB-9: `large_files.token_count` INTEGER vs BIGINT

**Severity**: High
**Category**: Type Mapping

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 484):
```sql
token_count     bigint NOT NULL, -- BIGINT to support files with billions of tokens
```
The comment explicitly notes BIGINT is needed for "files with billions of tokens."

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, line 67):
```sql
token_count   INTEGER NOT NULL,
```

**Analysis**: SQLite's `INTEGER` type is up to 8 bytes (64-bit signed integer), which is effectively equivalent to PostgreSQL's `BIGINT`. However, the Go model (`/tmp/crush/internal/db/models.go`, line 34) maps this as `int64`, and the insert param type (`/tmp/crush/internal/db/lcm.sql.go`, line 401) is also `int64`. So while the schema declaration says "INTEGER", SQLite will store it as a 64-bit value if needed.

**Recommendation**: This is technically fine for SQLite (INTEGER affinity handles any size up to 64-bit). However, for clarity and intent documentation, consider using `BIGINT` in the schema definition even though SQLite treats them equivalently.

---

### DB-10: Missing `original_path` Index on `lcm_large_files`

**Severity**: Medium
**Category**: Missing Index

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 510):
```sql
CREATE INDEX IF NOT EXISTS large_files_path_idx ON large_files(original_path);
```

**Crush**: No equivalent index exists. Only `idx_lcm_large_files_session` on `session_id`.

**Analysis**: Volt indexes `original_path` for efficient lookups when checking if a file at a given path has already been stored. Without this index, path-based deduplication queries would require a full table scan.

**Recommendation**: Add:
```sql
CREATE INDEX IF NOT EXISTS idx_lcm_large_files_path ON lcm_large_files(original_path);
```

---

### DB-11: Missing Individual Indexes on `lcm_context_items` for `summary_id` and `message_id`

**Severity**: Medium
**Category**: Missing Index

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 472-473):
```sql
CREATE INDEX IF NOT EXISTS ctx_items_summary_idx ON context_items(summary_id);
CREATE INDEX IF NOT EXISTS ctx_items_message_idx ON context_items(message_id);
```

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, lines 58-59):
```sql
CREATE INDEX IF NOT EXISTS idx_lcm_context_items_pos
    ON lcm_context_items(session_id, position);
```

Only the composite `(session_id, position)` index exists. No individual indexes on `summary_id` or `message_id`.

**Analysis**: The individual indexes on `summary_id` and `message_id` support queries like "find which context items reference this summary/message" -- needed for operations like `getCoveringSummary` in Volt. Even without those specific queries currently implemented in Crush, these indexes support foreign key constraint enforcement and future query patterns.

**Recommendation**: Add:
```sql
CREATE INDEX IF NOT EXISTS idx_lcm_context_items_summary ON lcm_context_items(summary_id);
CREATE INDEX IF NOT EXISTS idx_lcm_context_items_message ON lcm_context_items(message_id);
```

---

### DB-12: No FTS5 on Messages

**Severity**: Medium
**Category**: FTS5

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 396-402):
```sql
ALTER TABLE messages
    ADD COLUMN content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS messages_tsv_gin_idx ON messages USING GIN (content_tsv);
```

**Crush**: No FTS5 on messages. FTS5 is only set up for `lcm_summaries`.

**Analysis**: Volt supports full-text search on both messages and summaries via `searchMessages()` and `searchSummaries()`. Crush only implements `SearchSummaries()`. Message search is not available.

**Recommendation**: If message search is needed, add an `lcm_messages_fts` virtual table with triggers on the `messages` table, similar to the `lcm_summaries_fts` setup. Note that this would require careful consideration since the `messages` table is pre-existing and not LCM-specific.

---

### DB-13: FTS5 Tokenizer Not Specified -- No English Stemming

**Severity**: Medium
**Category**: FTS5

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 399):
```sql
to_tsvector('english', content)
```
Uses the `english` text search configuration, which includes stemming (e.g., "running" matches "run").

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, lines 75-79):
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS lcm_summaries_fts USING fts5(
    content,
    content=lcm_summaries,
    content_rowid=rowid
);
```
No tokenizer specified, so FTS5 defaults to `unicode61`.

**Analysis**: The `unicode61` tokenizer performs Unicode-aware tokenization but does **not** perform stemming. This means searching for "running" will not match summaries containing only "run". To get stemming behavior similar to Volt's `english` configuration, the `porter` tokenizer should be used.

**Recommendation**: Change to:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS lcm_summaries_fts USING fts5(
    content,
    content=lcm_summaries,
    content_rowid=rowid,
    tokenize='porter unicode61'
);
```
The `porter unicode61` tokenizer chain applies Unicode tokenization then Porter stemming.

---

### DB-14: Timestamp Handling -- Seconds vs Milliseconds

**Severity**: Medium
**Category**: Timestamp

**Volt**: Uses PostgreSQL `timestamptz NOT NULL DEFAULT now()` which stores full-precision timestamps with timezone.

**Crush LCM tables** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, lines 12, 68):
```sql
created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
```
Stores Unix timestamps in **seconds**.

**Existing Crush tables** (`/tmp/crush/internal/db/migrations/20250424200609_initial.sql`, lines 12-13):
```sql
updated_at INTEGER NOT NULL,  -- Unix timestamp in milliseconds
created_at INTEGER NOT NULL   -- Unix timestamp in milliseconds
```
Comments indicate these store **milliseconds**.

**Analysis**: See also DB-30. The existing Crush tables (sessions, messages, files) document timestamps as milliseconds, while the new LCM tables use `strftime('%s','now')` which returns seconds. This creates an internal inconsistency within Crush itself.

Note: On closer inspection, the existing sessions trigger uses `strftime('%s', 'now')` (line 19-21) which also returns seconds, suggesting the "milliseconds" comments in the initial migration may be inaccurate, or that the application layer handles the conversion. Either way, consistency should be verified.

**Recommendation**: Verify whether existing Crush tables actually use seconds or milliseconds at the application layer. The LCM tables should use the same convention.

---

### DB-15: `conversations.ctx_cutoff_threshold` Not Stored

**Severity**: Medium
**Category**: Column Omission

**Volt**: `ctx_cutoff_threshold numeric(5,4) NOT NULL DEFAULT 0.6000` -- per-conversation configurable threshold.

**Crush**: Uses a compile-time constant `DefaultCtxCutoffPercent = 60` in `/tmp/crush/internal/lcm/config.go` (line 7).

**Analysis**: In Volt, each conversation can have a different compaction threshold. In Crush, all sessions share the same threshold. This is a simplification that may be acceptable for initial release.

**Recommendation**: Acceptable for MVP. Consider adding per-session configuration if needed later.

---

### DB-16: `conversations.model_name` / `model_ctx_max_tokens` Not Stored

**Severity**: Medium
**Category**: Column Omission

**Volt**: Stores `model_name TEXT NOT NULL` and `model_ctx_max_tokens INTEGER NOT NULL` per conversation.

**Crush**: These values are passed at runtime to `ComputeTokenBudget()` in `/tmp/crush/internal/lcm/config.go`.

**Analysis**: Since Crush computes token budgets at call time rather than persisting them, this is acceptable. However, it means there is no audit trail of which model was used for a given session's LCM operations.

**Recommendation**: Acceptable for initial implementation.

---

### DB-17: `summaries.created_at` Not Returned by `LCMGetSummaryByID`

**Severity**: Low
**Category**: Query Omission

**Crush** (`/tmp/crush/internal/db/sql/lcm.sql`, lines 74-76):
```sql
-- name: LCMGetSummaryByID :one
SELECT summary_id, session_id, kind, content, token_count, file_ids
FROM lcm_summaries WHERE summary_id = ?;
```

The `created_at` column exists in the table but is not selected.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 1339):
```sql
SELECT summary_id, conversation_id, kind, content, token_count, file_ids, created_at
FROM summaries WHERE summary_id = ...
```

**Analysis**: Volt always returns `created_at` for summaries. Crush's `Summary` type in `types.go` does not include a `CreatedAt` field either, so this is consistent within Crush, but represents a data gap if summary age is needed for features like time-based retrieval or display.

**Recommendation**: Add `created_at` to the SELECT and to the `Summary` struct if time-based features are planned.

---

### DB-18: `file_ids` Stored as TEXT vs jsonb

**Severity**: Low
**Category**: Type Mapping

**Volt**: `file_ids jsonb NOT NULL DEFAULT '[]'`

**Crush**: `file_ids TEXT NOT NULL DEFAULT '[]'`

**Analysis**: SQLite does not have a native JSON type. Storing JSON as TEXT is the standard SQLite pattern. The Go code correctly marshals/unmarshals JSON to/from this TEXT column. Functionally equivalent.

**Recommendation**: No action needed.

---

### DB-19: Goose Migration Format -- Single StatementBegin/End Block

**Severity**: Low
**Category**: Goose Format

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`):
The entire Up migration is wrapped in a single `-- +goose StatementBegin` / `-- +goose StatementEnd` block (lines 2-97).

**Analysis**: This is valid Goose syntax. Goose requires `StatementBegin/End` when a statement contains semicolons that should not be treated as statement separators (e.g., trigger definitions with `BEGIN...END`). Since this migration contains triggers, the wrapping is necessary and correct.

The Down migration (lines 100-110) also correctly uses `StatementBegin/End` and drops objects in reverse dependency order.

**Recommendation**: No action needed. The format is correct.

---

### DB-20: `GenerateFileIDFromPath` Hash Input Differences

**Severity**: Low
**Category**: Hash Input

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 1644):
```typescript
hash.update(`${conversationId}:${filePath}:${fileSize}:${mtime.getTime()}`)
// mtime.getTime() returns milliseconds since epoch
```

**Crush** (`/tmp/crush/internal/lcm/largefile.go`, lines 76-78):
```go
fmt.Fprintf(h, "%s|%s|%d|%d", sessionID, filePath, fileSize, mtime.Unix())
// mtime.Unix() returns seconds since epoch
// Uses pipe (|) separator instead of colon (:)
```

**Analysis**: Two differences:
1. Separator character: `|` (Crush) vs `:` (Volt)
2. Mtime precision: seconds (Crush) vs milliseconds (Volt)

Additionally, Volt uses numeric `conversationId` while Crush uses string `sessionID`, which is unavoidable given the different ID types.

These differences mean the same file will produce different file IDs in Volt vs Crush. This is acceptable since there is no cross-system file ID compatibility requirement.

**Recommendation**: No action needed unless cross-system compatibility is required.

---

### DB-21: `LCMGetMessagesToSummarize` Uses Row LIMIT Instead of Token Budget

**Severity**: Medium
**Category**: Query Semantics

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1043-1080):
```sql
WITH msgs AS (
    SELECT ..., SUM(m.token_count) OVER (ORDER BY ci.position) AS running_tokens
    FROM context_items ci JOIN messages m ON ...
    WHERE ci.item_type = 'message'::context_item_type
)
SELECT position, message_id FROM msgs WHERE running_tokens <= ${tokenBudget}
```
Uses a window function to select messages within a **token budget**.

**Crush** (`/tmp/crush/internal/db/sql/lcm.sql`, lines 47-52):
```sql
SELECT ci.position, ci.item_type, ci.message_id, ci.summary_id
FROM lcm_context_items ci
WHERE ci.session_id = ? AND ci.item_type = 'message'
ORDER BY ci.position LIMIT ?
```
Uses a simple **row count LIMIT**.

**Analysis**: The Volt approach ensures that the summarized batch fits within a token budget, preventing the summarizer from receiving too much text. The Crush approach selects a fixed number of messages regardless of their token counts. A single very large message could exceed the summarizer's capacity. The Crush compactor (`compactor.go`) may handle this at the application layer, but the query itself does not enforce a token budget.

**Recommendation**: Verify that the compactor's application-level logic adequately handles token budgets. If not, consider implementing token-budget-aware selection.

---

### DB-22: `LCMExpandSummaryToMessages` Is Non-Recursive

**Severity**: Medium
**Category**: Query Semantics

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1375-1399):
```sql
WITH RECURSIVE walk(summary_id) AS (
    SELECT ${summaryId}::text
    UNION
    SELECT sp.parent_summary_id
    FROM summary_parents sp
    JOIN walk w ON sp.summary_id = w.summary_id
),
leaf_messages AS (
    SELECT DISTINCT sm.message_id
    FROM walk w
    JOIN summary_messages sm ON sm.summary_id = w.summary_id
)
SELECT DISTINCT m.* FROM leaf_messages lm JOIN messages m ...
```
Recursively walks the summary DAG to find all leaf messages.

**Crush** (`/tmp/crush/internal/db/sql/lcm.sql`, lines 87-92):
```sql
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at
FROM lcm_summary_messages sm
JOIN messages m ON m.id = sm.message_id
WHERE sm.summary_id = ?
ORDER BY sm.ord
```
Only expands one level -- direct `summary_messages` links only.

**Analysis**: For a condensed summary, Volt recursively walks through all parent summaries down to leaf summaries to find the original messages. Crush only returns messages directly linked to the given summary. For condensed summaries, this would return **zero results** because condensed summaries link to parent summaries (via `summary_parents`), not directly to messages (via `summary_messages`).

**Recommendation**: Either implement recursive expansion using a `WITH RECURSIVE` CTE in SQLite (which supports it), or handle recursion in the application layer.

---

### DB-23: No `searchMessages` Equivalent in Crush

**Severity**: Low
**Category**: Missing Query

**Volt** has `searchMessages()` (line 1404) using FTS on `content_tsv`.

**Crush**: Not implemented. No FTS on messages, no search query.

**Recommendation**: Add if message search is needed for the retrieval feature.

---

### DB-24: No `regexSearchMessages` Equivalent in Crush

**Severity**: Low
**Category**: Missing Query

**Volt** has `regexSearchMessages()` (line 1546) using PostgreSQL's `~` regex operator.

**Crush**: Not implemented. SQLite does not have a built-in regex operator (requires extension).

**Recommendation**: If needed, implement using SQLite's `LIKE` operator or load the regex extension.

---

### DB-25: No `getCoveringSummary` Equivalent in Crush

**Severity**: Low
**Category**: Missing Query

**Volt** has `getCoveringSummary()` (line 1530) which finds the leaf summary containing a given message.

**Crush**: Not implemented.

**Recommendation**: Add if needed for retrieval or context navigation.

---

### DB-26: No `getChildSummaryIds` Equivalent in Crush

**Severity**: Low
**Category**: Missing Query

**Volt** has `getChildSummaryIds()` (line 1513) which finds summaries condensed from a given summary.

**Crush**: Not implemented.

**Recommendation**: Add if needed for DAG traversal.

---

### DB-27: No `getAncestorConversationIds` Equivalent in Crush

**Severity**: Low
**Category**: Missing Query

**Volt** has `getAncestorConversationIds()` (line 700) using recursive CTE to walk the parent chain.

**Crush**: Not implemented. Multi-conversation file/summary lookup is not available.

**Recommendation**: Add if hierarchical session file sharing is needed.

---

### DB-28: Table Naming Convention -- `lcm_` Prefix

**Severity**: Info
**Category**: Naming

**Volt**: Tables are unprefixed (`conversations`, `messages`, `summaries`, `context_items`, etc.)

**Crush**: New LCM tables use the `lcm_` prefix (`lcm_summaries`, `lcm_context_items`, `lcm_summary_messages`, `lcm_summary_parents`, `lcm_large_files`).

**Analysis**: This is an intentional and correct design decision. Since Crush already has `sessions` and `messages` tables, the `lcm_` prefix avoids name conflicts. The existing `sessions` and `messages` tables serve as the Crush equivalents of Volt's `conversations` and `messages` tables respectively.

**Recommendation**: No action needed. Good practice.

---

### DB-29: Primary Key Type Differences

**Severity**: Info
**Category**: Primary Key

**Volt**:
- `conversations.conversation_id`: `bigint GENERATED ALWAYS AS IDENTITY` (auto-increment)
- `messages.message_id`: `bigint GENERATED ALWAYS AS IDENTITY` (auto-increment)
- `messages.seq`: separate sequence number

**Crush**:
- `sessions.id`: `TEXT` (UUID)
- `messages.id`: `TEXT` (UUID)
- No `seq` column on messages

**Analysis**: This is a pre-existing difference in Crush's data model. Crush uses UUID strings for primary keys, while Volt uses auto-incrementing integers. The LCM migration correctly uses `TEXT` types for all foreign keys referencing these tables. The absence of a `seq` column in Crush means message ordering relies on other mechanisms (e.g., `created_at` or insertion order in `lcm_summary_messages.ord`).

**Recommendation**: No action needed. This is inherent to the platform difference.

---

### DB-30: Internal Timestamp Unit Inconsistency Within Crush

**Severity**: Medium
**Category**: Timestamp Inconsistency

**Existing Crush tables** (`/tmp/crush/internal/db/migrations/20250424200609_initial.sql`):
- Lines 12-13: `updated_at INTEGER NOT NULL, -- Unix timestamp in milliseconds` / `created_at INTEGER NOT NULL -- Unix timestamp in milliseconds`
- But trigger on line 19-21: `UPDATE sessions SET updated_at = strftime('%s', 'now')` -- which returns **seconds**

**New LCM tables** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`):
- Line 12: `created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))` -- seconds

**Analysis**: There is a contradiction in the existing Crush schema between the column comments (claiming milliseconds) and the trigger implementation (using seconds). The LCM tables follow the trigger convention (seconds). If the application layer inserts millisecond values for `sessions.created_at` and `messages.created_at`, but the LCM tables use seconds, there would be a 1000x magnitude difference between timestamps in different tables.

**Recommendation**: Audit the application layer to determine the actual convention. Ensure LCM tables use the same unit.

---

## Tables Comparison Matrix

| Volt Table | Crush Equivalent | Ported? | Notes |
|---|---|---|---|
| `conversations` | `sessions` (pre-existing) | Reused | Missing model_name, ctx columns |
| `messages` | `messages` (pre-existing) | Reused | Different structure (parts as JSON vs content + message_parts) |
| `summaries` | `lcm_summaries` | Yes | Equivalent |
| `summary_messages` | `lcm_summary_messages` | Yes | FK behavior differs (DB-1) |
| `summary_parents` | `lcm_summary_parents` | Yes | Equivalent |
| `context_items` | `lcm_context_items` | Yes | FK behavior differs (DB-2) |
| `large_files` | `lcm_large_files` | Partial | Missing columns (DB-7, DB-8) |
| `message_parts` | -- | No | DB-4 |
| `agentic_map_runs` | -- | No | DB-5 |
| `agentic_map_items` | -- | No | DB-5 |
| `llm_map_runs` | -- | No | DB-6 |
| `llm_map_items` | -- | No | DB-6 |

## Indexes Comparison Matrix

| Volt Index | Crush Equivalent | Present? | Notes |
|---|---|---|---|
| `conversations_parent_idx` | N/A (sessions table) | N/A | Sessions already has parent_session_id |
| `messages_conv_seq_idx` | N/A (pre-existing) | N/A | No seq column in Crush |
| `messages_tsv_gin_idx` | -- | No | DB-12 |
| `summaries_conv_created_idx` | `idx_lcm_summaries_session` | Yes | Equivalent |
| `summaries_tsv_gin_idx` | FTS5 virtual table | Yes | Different mechanism |
| `summary_messages_message_idx` | `idx_lcm_summary_messages_msg` | Yes | Equivalent |
| `summary_parents_parent_idx` | `idx_lcm_summary_parents_parent` | Yes | Equivalent |
| `ctx_items_conv_pos_idx` | `idx_lcm_context_items_pos` | Yes | Equivalent |
| `ctx_items_summary_idx` | -- | No | DB-11 |
| `ctx_items_message_idx` | -- | No | DB-11 |
| `large_files_conv_idx` | `idx_lcm_large_files_session` | Yes | Equivalent |
| `large_files_path_idx` | -- | No | DB-10 |
| `message_parts_message_idx` | -- | No | Table not ported (DB-4) |
| `message_parts_type_idx` | -- | No | Table not ported (DB-4) |

## Foreign Key ON DELETE Behavior Comparison

| Relationship | Volt | Crush | Match? |
|---|---|---|---|
| summaries -> conversations/sessions | CASCADE | CASCADE | Yes |
| summary_messages.summary_id -> summaries | CASCADE | CASCADE | Yes |
| summary_messages.message_id -> messages | **RESTRICT** | **CASCADE** | **No (DB-1)** |
| summary_parents.summary_id -> summaries | CASCADE | CASCADE | Yes |
| summary_parents.parent_summary_id -> summaries | RESTRICT | RESTRICT | Yes |
| context_items -> conversations/sessions | CASCADE | CASCADE | Yes |
| context_items.message_id -> messages | **RESTRICT** | **CASCADE** | **No (DB-2)** |
| context_items.summary_id -> summaries | RESTRICT | RESTRICT | Yes |
| large_files -> conversations/sessions | CASCADE | CASCADE | Yes |

## CHECK Constraints Comparison

| Constraint | Volt | Crush | Match? |
|---|---|---|---|
| `kind IN ('leaf','condensed')` | Enum type `summary_kind` | `CHECK(kind IN ('leaf','condensed'))` | Yes (equivalent) |
| `item_type IN ('message','summary')` | Enum type `context_item_type` | `CHECK(item_type IN ('message','summary'))` | Yes (equivalent) |
| Context item exactly-one-ref CHECK | Yes (line 462-466) | Yes (lines 50-53) | Yes |
| `role` enum | Enum type `message_role` | Pre-existing TEXT column | N/A (pre-existing) |
| `part_type` enum | Enum type `message_part_type` | N/A (table not ported) | N/A |

## Goose Migration Format Verification

| Check | Result |
|---|---|
| `-- +goose Up` marker present | Yes (line 1) |
| `-- +goose StatementBegin` present for Up | Yes (line 2) |
| `-- +goose StatementEnd` present for Up | Yes (line 97) |
| `-- +goose Down` marker present | Yes (line 99) |
| `-- +goose StatementBegin` present for Down | Yes (line 100) |
| `-- +goose StatementEnd` present for Down | Yes (line 110) |
| Down drops objects in correct dependency order | Yes (triggers -> FTS -> tables in reverse creation order) |
| `CREATE TABLE IF NOT EXISTS` used | Yes (all tables) |
| `CREATE INDEX IF NOT EXISTS` used | Yes (all indexes) |
| `CREATE TRIGGER IF NOT EXISTS` used | Yes (all triggers) |
| No conflicts with existing migration sequence | Yes (timestamp `20260218000000` is after latest `20260127000000`) |

---

## Conclusion

The Crush schema port is **structurally sound** for the core LCM functionality (summarization DAG, context window management, large file references, and FTS on summaries). The major concerns are:

1. **Critical**: Two foreign key behaviors changed from RESTRICT to CASCADE (DB-1, DB-2), which could silently corrupt the summary DAG if messages are deleted externally. These should be fixed before production use.

2. **High**: Several Volt tables and columns are omitted (DB-4 through DB-9). Most appear to be intentional scope reductions, but `exploration_summary`/`explorer_used` (DB-7) will be needed if the file exploration feature is ported.

3. **Medium**: The FTS5 tokenizer should be configured with Porter stemming (DB-13) to match Volt's English language search behavior. Missing indexes (DB-10, DB-11) should be added. The `ExpandSummaryToMessages` query needs recursive support (DB-22).

4. **Low**: Various missing queries (DB-23 through DB-27) represent features that may not yet be needed in Crush but should be documented as future work.
