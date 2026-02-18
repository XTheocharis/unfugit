# Plan: Complete LCM Feature Parity with Volt

## Overview

Bring Crush's LCM module to full feature parity with Volt's reference implementation. This covers 8 workstreams across schema, queries, compaction logic, explorers, map/reduce infrastructure, token management, and wiring.

### Errata from Verification

The following errors/omissions were found during plan verification and are addressed inline:

| ID | Issue | Resolution |
|----|-------|------------|
| E1 | SQL uses truncating division `LENGTH()/4` but Go uses ceiling `(n+3)/4` | Fix all SQL to use `(LENGTH(COALESCE(m.parts,''))+3)/4`; update 2 existing queries |
| E2 | Token-budget windowed query returns 0 rows when first message exceeds budget | Add `OR position = (SELECT MIN(position) FROM msgs)` fallback |
| E3 | `generateCondensedID` not mentioned in content+timestamp change | Update both `generateSummaryID` and `generateCondensedID` |
| E4 | `ComputeTokenBudget` signature change breaks 8+ test call sites | Enumerate all call sites explicitly |
| E5 | New messages won't get `token_count` after migration adds the column | Add SQLite `AFTER INSERT` trigger |
| E6 | `LargeFile` struct missing exploration fields | Add `ExplorationSummary`/`ExplorerUsed` to both `types.go` and `models.go` |
| E7 | LLM Summary Explorer needs `LLMClient` but registry constructor doesn't accept one | Use `Register()` method for LLM explorer separately |
| E8 | `ExplorerUsed` not set in `ExplorationResult` by individual explorers | Set it in `ExplorerRegistry.Explore()` after dispatch |
| E9 | `FormatLargeFileForContext` missing hint line (IT-15) | Add Volt's external storage hint |
| E10 | LCM coordinator is in `integration.go` (not `lcm.go` which doesn't exist) | All Phase 7 references corrected to `integration.go` |
| E11 | `LCMGetMessageByID` query doesn't return `token_count` column | Update query and row struct after adding column |
| E12 | `GetMessagesByIDs`/`ExpandSummaryToMessages` always re-estimate tokens | Prefer pre-computed `token_count` when available |
| E13 | `Message` struct in `models.go` missing `TokenCount` field | Add the field |
| E14 | `Explorer.CanExplore(mimeType)` has no path/extension — code explorers can't distinguish `.go` from `.py` when MIME is generic | Change to `CanExplore(path string, mimeType string) bool` |
| E15 | `NewLCM(db *sql.DB, queries *db.Queries, ...)` — param `db` shadows imported `db` package | Rename to `sqlDB *sql.DB` |
| E16 | `LCMGetLargeFile` query and `store.GetLargeFile` don't return new exploration columns | Update query SELECT and Scan |
| E17 | Exploration cache SQL stores only summary+explorer, but `ExplorationResult` needs `FileIDs`/`TokenCount` | Derive via `extractFileIDs()`/`EstimateTokenCount()` on cache read |
| E18 | `LlmMapRunConfig` type referenced in Phase 7.1 is never defined | Define in Phase 6.2 |
| E19 | `SearchMessages`/`SearchMessagesRegex` raw SQL missing `m.token_count` | Add to SELECT in Go SQL strings |
| E20 | `querier.go` Querier interface missing 7 methods from commit 7129b82 + no plan to update for new queries | Update interface for all new methods |

---

## Phase 1: Schema & Migration (DB layer)

**File:** `crush/internal/db/migrations/20260221000000_lcm_feature_parity.sql`

### 1.1 Add `exploration_summary` and `explorer_used` columns to `lcm_large_files` (DB-7)

```sql
-- +goose Up
-- +goose StatementBegin

ALTER TABLE lcm_large_files ADD COLUMN exploration_summary TEXT;
ALTER TABLE lcm_large_files ADD COLUMN explorer_used TEXT;
```

**File:** `crush/internal/db/models.go` — add fields to `LcmLargeFile` struct:
```go
type LcmLargeFile struct {
    // ... existing fields ...
    ExplorationSummary sql.NullString `json:"exploration_summary"`
    ExplorerUsed       sql.NullString `json:"explorer_used"`
}
```

**File:** `crush/internal/lcm/types.go` — add fields to `LargeFile` struct **(E6)**:
```go
type LargeFile struct {
    // ... existing fields ...
    ExplorationSummary string
    ExplorerUsed       string
}
```

### 1.2 Add `token_count` column to `messages` table (SQ-1, DB-31)

Same migration:
```sql
ALTER TABLE messages ADD COLUMN token_count INTEGER;
```

Backfill using **ceiling division** to match Go's `EstimateTokenCount` **(E1)**:
```sql
UPDATE messages SET token_count = (LENGTH(COALESCE(parts,'')) + 3) / 4;
```

Auto-populate for future inserts **(E5)**:
```sql
CREATE TRIGGER messages_compute_token_count AFTER INSERT ON messages
WHEN NEW.token_count IS NULL
BEGIN
    UPDATE messages SET token_count = (LENGTH(COALESCE(NEW.parts,'')) + 3) / 4
    WHERE id = NEW.id;
END;
```

**File:** `crush/internal/db/models.go` — add `TokenCount` field to `Message` struct **(E13)**:
```go
type Message struct {
    // ... existing fields ...
    TokenCount sql.NullInt64 `json:"token_count"`
}
```

### 1.3 Create `message_parts` table (DB-4)

Same migration:
```sql
CREATE TABLE IF NOT EXISTS message_parts (
    part_id         TEXT PRIMARY KEY,
    message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    session_id      TEXT NOT NULL,
    part_type       TEXT NOT NULL,
    ordinal         INTEGER NOT NULL,
    text_content    TEXT,
    is_ignored      INTEGER,
    is_synthetic    INTEGER,
    tool_call_id    TEXT,
    tool_name       TEXT,
    tool_status     TEXT,
    tool_input      TEXT,  -- JSON
    tool_output     TEXT,
    tool_error      TEXT,
    tool_title      TEXT,
    patch_hash      TEXT,
    patch_files     TEXT,  -- JSON array
    file_mime       TEXT,
    file_name       TEXT,
    file_url        TEXT,
    subtask_prompt  TEXT,
    subtask_desc    TEXT,
    subtask_agent   TEXT,
    step_reason     TEXT,
    step_cost       REAL,
    step_tokens_in  INTEGER,
    step_tokens_out INTEGER,
    snapshot_hash   TEXT,
    compaction_auto INTEGER,
    metadata        TEXT,  -- JSON
    UNIQUE(message_id, ordinal)
);
CREATE INDEX IF NOT EXISTS message_parts_message_idx ON message_parts(message_id);
CREATE INDEX IF NOT EXISTS message_parts_type_idx ON message_parts(part_type);
```

**File:** `crush/internal/db/models.go` — add `MessagePart` struct.

### 1.4 Create agentic map tables (DB-5)

Same migration:
```sql
CREATE TABLE IF NOT EXISTS agentic_map_runs (
    map_id            TEXT PRIMARY KEY,
    run_started_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    status            TEXT NOT NULL DEFAULT 'PENDING',
    input_path        TEXT,
    input_lcm_id      TEXT,
    output_path       TEXT,
    output_lcm_id     TEXT,
    prompt            TEXT,
    output_schema     TEXT,  -- JSON
    read_only         INTEGER NOT NULL DEFAULT 0,
    concurrency       INTEGER NOT NULL DEFAULT 1,
    timeout_seconds   INTEGER NOT NULL DEFAULT 300,
    max_attempts      INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS agentic_map_items (
    map_id        TEXT NOT NULL REFERENCES agentic_map_runs(map_id) ON DELETE CASCADE,
    item_index    INTEGER NOT NULL,
    item          TEXT NOT NULL,  -- JSON
    status        TEXT NOT NULL DEFAULT 'PENDING',
    attempts_used INTEGER NOT NULL DEFAULT 0,
    started_at    INTEGER,
    finished_at   INTEGER,
    result        TEXT,  -- JSON
    error         TEXT,
    PRIMARY KEY (map_id, item_index)
);
CREATE INDEX IF NOT EXISTS agentic_map_items_status_idx ON agentic_map_items(map_id, status, item_index);
```

**File:** `crush/internal/db/models.go` — add `AgenticMapRun` and `AgenticMapItem` structs.

### 1.5 Create LLM map tables (DB-6)

Same migration:
```sql
CREATE TABLE IF NOT EXISTS llm_map_runs (
    map_id                      TEXT PRIMARY KEY,
    run_started_at              INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    status                      TEXT NOT NULL DEFAULT 'PENDING',
    input_path                  TEXT,
    input_lcm_id                TEXT,
    output_path                 TEXT,
    output_lcm_id               TEXT,
    prompt                      TEXT,
    output_schema               TEXT,  -- JSON
    model                       TEXT,
    concurrency                 INTEGER NOT NULL DEFAULT 1,
    timeout_seconds             INTEGER NOT NULL DEFAULT 300,
    max_attempts                INTEGER NOT NULL DEFAULT 3,
    resolved_provider           TEXT,
    resolved_model              TEXT,
    resolved_request_overrides  TEXT   -- JSON
);

CREATE TABLE IF NOT EXISTS llm_map_items (
    map_id        TEXT NOT NULL REFERENCES llm_map_runs(map_id) ON DELETE CASCADE,
    item_index    INTEGER NOT NULL,
    item          TEXT NOT NULL,  -- JSON
    status        TEXT NOT NULL DEFAULT 'PENDING',
    attempts_used INTEGER NOT NULL DEFAULT 0,
    started_at    INTEGER,
    finished_at   INTEGER,
    result        TEXT,  -- JSON
    error         TEXT,
    PRIMARY KEY (map_id, item_index)
);
CREATE INDEX IF NOT EXISTS llm_map_items_status_idx ON llm_map_items(map_id, status, item_index);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS llm_map_items;
DROP TABLE IF EXISTS llm_map_runs;
DROP TABLE IF EXISTS agentic_map_items;
DROP TABLE IF EXISTS agentic_map_runs;
DROP TABLE IF EXISTS message_parts;
DROP TRIGGER IF EXISTS messages_compute_token_count;
-- SQLite doesn't support DROP COLUMN, so we can't easily reverse ALTER TABLEs.
-- The token_count and exploration columns remain but are ignored if unused.
-- +goose StatementEnd
```

---

## Phase 2: SQL Queries & Generated Code

### 2.1 Fix existing SQL to use ceiling division + pre-computed tokens (E1, E12)

**File:** `crush/internal/db/sql/lcm.sql`

Update `LCMGetCurrentContext` — replace the message token estimation (line 10):
```sql
-- OLD: WHEN ci.item_type = 'message' THEN LENGTH(COALESCE(m.parts, '')) / 4
-- NEW (single final form — prefers pre-computed, falls back to ceiling division):
WHEN ci.item_type = 'message' THEN COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4)
```

Update `LCMGetContextTokenCount` — same single replacement in the SUM/CASE (line 23):
```sql
-- OLD: WHEN ci.item_type = 'message' THEN LENGTH(COALESCE(m.parts, '')) / 4
-- NEW:
WHEN ci.item_type = 'message' THEN COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4)
```

**File:** `crush/internal/db/lcm.sql.go` — update the SQL string constants to match.

### 2.1b Update LCMGetLargeFile to return new columns (E16)

**File:** `crush/internal/db/sql/lcm.sql` — change:
```sql
-- name: LCMGetLargeFile :one
SELECT file_id, session_id, original_path, mime_type, token_count, created_at,
       exploration_summary, explorer_used
FROM lcm_large_files WHERE file_id = ?;
```

**File:** `crush/internal/db/lcm.sql.go` — update `LcmLargeFile` scan to include `ExplorationSummary` and `ExplorerUsed`.

**File:** `crush/internal/lcm/store.go` — update `GetLargeFile` (line 351) to populate new fields:
```go
return &LargeFile{
    // ... existing fields ...
    ExplorationSummary: row.ExplorationSummary.String,
    ExplorerUsed:       row.ExplorerUsed.String,
}, nil
```

### 2.2 Update LCMGetMessageByID to return token_count (E11)

**File:** `crush/internal/db/sql/lcm.sql` — change query:
```sql
-- name: LCMGetMessageByID :one
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at, m.token_count
FROM messages m
WHERE m.id = ?;
```

**File:** `crush/internal/db/lcm.sql.go` — update `LCMGetMessageByIDRow`:
```go
type LCMGetMessageByIDRow struct {
    ID         string        `json:"id"`
    SessionID  string        `json:"session_id"`
    Role       string        `json:"role"`
    Content    string        `json:"content"`
    CreatedAt  int64         `json:"created_at"`
    TokenCount sql.NullInt64 `json:"token_count"`
}
```

Update the Scan call to include `&i.TokenCount`.

### 2.3 Update LCMExpandSummaryToMessages to return token_count

**File:** `crush/internal/db/sql/lcm.sql`:
```sql
-- name: LCMExpandSummaryToMessages :many
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at, m.token_count
FROM lcm_summary_messages sm
JOIN messages m ON m.id = sm.message_id
WHERE sm.summary_id = ?
ORDER BY sm.ord;
```

**File:** `crush/internal/db/lcm.sql.go` — update row struct and Scan.

### 2.4 Add new LCM queries

**File:** `crush/internal/db/sql/lcm.sql` — add:

Token-budget windowed query (SQ-8 parity) with **zero-row fallback (E2)**:
```sql
-- name: LCMGetMessagesToSummarizeByTokenBudget :many
WITH msgs AS (
    SELECT ci.position, ci.message_id,
           COALESCE(m.token_count, (LENGTH(COALESCE(m.parts,''))+3)/4) AS tk,
           SUM(COALESCE(m.token_count, (LENGTH(COALESCE(m.parts,''))+3)/4))
             OVER (ORDER BY ci.position) AS running_tokens
    FROM lcm_context_items ci
    JOIN messages m ON m.id = ci.message_id
    WHERE ci.session_id = ? AND ci.item_type = 'message'
    ORDER BY ci.position
)
SELECT position, message_id FROM msgs
WHERE running_tokens <= ?
   OR position = (SELECT MIN(position) FROM msgs)
ORDER BY position;
```

Large file exploration queries:
```sql
-- name: LCMUpdateLargeFileExploration :exec
UPDATE lcm_large_files
SET exploration_summary = ?, explorer_used = ?
WHERE file_id = ?;

-- name: LCMGetLargeFileExploration :one
SELECT file_id, exploration_summary, explorer_used
FROM lcm_large_files
WHERE file_id = ? AND exploration_summary IS NOT NULL;
```

### 2.5 Add SQL queries for new tables

**File:** `crush/internal/db/sql/message_parts.sql` — CRUD for message_parts:
- `InsertMessagePart`
- `GetMessagePartsByMessageID`
- `GetMessagePartsByType`
- `DeleteMessagePartsByMessageID`

**File:** `crush/internal/db/sql/map.sql` — CRUD for agentic_map and llm_map:
- `CreateAgenticMapRun` / `GetAgenticMapRun` / `UpdateAgenticMapRunStatus`
- `CreateAgenticMapItem` / `GetAgenticMapItem` / `UpdateAgenticMapItemStatus` / `GetAgenticMapItemsByStatus`
- Same for llm_map variants

### 2.6 Hand-write sqlc-generated Go code

**New files:**
- `crush/internal/db/message_parts.sql.go` — generated code for message_parts queries
- `crush/internal/db/map.sql.go` — generated code for map queries

**Modified files:**
- `crush/internal/db/lcm.sql.go` — extend with new LCM queries (token-budget windowed, exploration cache)
- `crush/internal/db/db.go` — add new prepared statements to `Queries` struct, `Prepare()`, `Close()`, `WithTx()`

Current `db.go` has 49 prepared statements. New additions:
- `lCMGetMessagesToSummarizeByTokenBudgetStmt`
- `lCMUpdateLargeFileExplorationStmt`
- `lCMGetLargeFileExplorationStmt`
- All message_parts CRUD stmts (~4)
- All agentic_map CRUD stmts (~7)
- All llm_map CRUD stmts (~7)
Total: ~67 statements after changes.

### 2.7 Update Querier interface (E20)

**File:** `crush/internal/db/querier.go`

**Pre-existing gap:** The Querier interface is missing 7 methods added in commit 7129b82 that already exist on `*Queries`:
- `LCMGetChildSummaryIDs`
- `LCMGetCoveringSummaryForMessages`
- `LCMGetAllSummaries`
- `LCMDeleteSummary`
- `LCMGetSessionConfig`
- `LCMUpsertSessionConfig`
- `LCMGetSummaryMessageSessionIDs`

Add these plus all new methods from this plan:
- `LCMGetMessagesToSummarizeByTokenBudget`
- `LCMUpdateLargeFileExploration`
- `LCMGetLargeFileExploration`
- All message_parts CRUD methods (~4)
- All agentic_map CRUD methods (~7)
- All llm_map CRUD methods (~7)

The compile-time check `var _ Querier = (*Queries)(nil)` validates the interface is complete.

---

## Phase 3: Token Management Parity (SQ-1, IT-1, IT-2, IT-3)

### 3.1 Use pre-computed `token_count` when available (E12)

**File:** `crush/internal/lcm/store.go`

Update `GetMessagesByIDs` (line 145):
```go
func (s *SQLiteStore) GetMessagesByIDs(ctx context.Context, ids []string) ([]LCMMessage, error) {
    messages := make([]LCMMessage, 0, len(ids))
    for _, id := range ids {
        row, err := s.q.LCMGetMessageByID(ctx, id)
        if err != nil {
            return nil, fmt.Errorf("failed to get message %s: %w", id, err)
        }
        tc := EstimateTokenCount(row.Content)
        if row.TokenCount.Valid {
            tc = int(row.TokenCount.Int64)
        }
        messages = append(messages, LCMMessage{
            ID:         row.ID,
            SessionID:  row.SessionID,
            CreatedAt:  row.CreatedAt,
            Role:       row.Role,
            Content:    row.Content,
            TokenCount: tc,
        })
    }
    return messages, nil
}
```

Similarly update `ExpandSummaryToMessages` (line 303) to prefer pre-computed token counts.

**Also update raw SQL in store.go (E19):** `SearchMessages` (line 457) and `SearchMessagesRegex` (line 492) use raw SQL strings (not sqlc) for FTS5 queries. Both need:
1. Add `m.token_count` to the SELECT clause in the raw SQL string
2. Use `COALESCE(m.token_count, EstimateTokenCount(...))` pattern when constructing `LCMMessage`

### 3.2 Token-budget windowed message selection (SQ-8 full parity)

**File:** `crush/internal/lcm/types.go` — add to Store interface:
```go
GetMessagesToSummarizeByTokenBudget(ctx context.Context, sessionID string, tokenBudget int) ([]ContextEntry, error)
```

**File:** `crush/internal/lcm/store.go` — implement method using the new windowed SQL query.

**File:** `crush/internal/lcm/compactor.go`

Update `summarizeMessagesOnce` to use token-budget windowed selection as the primary strategy, falling back to the current row-limit approach:
```go
func (c *Compactor) summarizeMessagesOnce(
    ctx context.Context,
    sessionID string,
    budget TokenBudget,
) error {
    // Primary: token-budget windowed selection
    tokenLimit := budget.SoftThreshold / 2 // summarize up to half the soft threshold
    messagesToSummarize, err := c.store.GetMessagesToSummarizeByTokenBudget(ctx, sessionID, tokenLimit)
    if err != nil || len(messagesToSummarize) < MinMessagesToSummarize {
        // Fallback: row-limit approach
        const maxMessagesPerRound = 50
        messagesToSummarize, err = c.store.GetMessagesToSummarize(ctx, sessionID, maxMessagesPerRound)
        if err != nil {
            return err
        }
    }
    // ... rest unchanged ...
}
```

### 3.3 Model-aware reserve computation (SC-5)

**File:** `crush/internal/lcm/config.go`

Update `ComputeTokenBudget` to accept an optional model output limit:
```go
func ComputeTokenBudget(
    contextWindow int,
    systemPromptToks int,
    toolToks int,
    softThresholdOverride *int,
    modelOutputLimit *int,  // NEW
) TokenBudget {
    overhead := systemPromptToks + toolToks
    reserve := min(20_000, contextWindow/4)
    if modelOutputLimit != nil && *modelOutputLimit < reserve {
        reserve = *modelOutputLimit
    }
    // ... rest unchanged ...
}
```

### 3.4 Update all ComputeTokenBudget call sites (E4)

**Exhaustive list of call sites to update** (add `, nil` as the 5th argument):

| File | Line | Context |
|------|------|---------|
| `lcm_test.go` | 66 | `TestComputeTokenBudget` |
| `lcm_test.go` | 82 | `TestComputeTokenBudgetSmall` |
| `lcm_test.go` | 95 | `TestCompactionTargetBelowSoftThreshold` |
| `lcm_test.go` | 698 | `TestCompactContext_Convergence` |
| `lcm_test.go` | 716 | `TestCompactContext_NoProgress` |
| `lcm_test.go` | 737 | `TestScheduleCompaction_DuplicateRejected` |
| `lcm_test.go` | 763 | `TestScheduleCompaction_EventBusPublishes` |
| `lcm_test.go` | 877 | `TestCompactContext_ReplacesPositions` |

Plus the new `NewLCM` constructor in Phase 7 (which directly calls it).

---

## Phase 4: Compaction Logic Parity

### 4.1 Condense ALL summaries in context, not just 5 (SC-21)

**File:** `crush/internal/lcm/compactor.go`

Change `condenseSummariesOnce` (line 117):
```go
func (c *Compactor) condenseSummariesOnce(ctx context.Context, sessionID string) error {
    // Get ALL summaries in context (Volt condenses all at once)
    summaryCount, err := c.store.CountSummariesInContext(ctx, sessionID)
    if err != nil {
        return err
    }
    if summaryCount < 1 {
        return fmt.Errorf("no summaries available to condense")
    }
    summariesToCondense, err := c.store.GetOldestSummariesInContext(ctx, sessionID, summaryCount)
    // ... rest unchanged
}
```

### 4.2 Summary ID generation from content+timestamp (SC-2, E3)

**File:** `crush/internal/lcm/summarizer.go`

Change `generateSummaryID` (line 278) to hash the summary **output** content + timestamp:
```go
func generateSummaryID(content string) string {
    h := sha256.New()
    fmt.Fprintf(h, "%s%d", content, time.Now().UnixMilli())
    hash := hex.EncodeToString(h.Sum(nil))
    return SummaryIDPrefix + hash[:SummaryIDLength]
}
```

Change `generateCondensedID` (line 287) to use the **same** pattern **(E3)**:
```go
func generateCondensedID(content string) string {
    h := sha256.New()
    fmt.Fprintf(h, "%s%d", content, time.Now().UnixMilli())
    hash := hex.EncodeToString(h.Sum(nil))
    return SummaryIDPrefix + hash[:SummaryIDLength]
}
```

**Update all call sites** in `summarizeNormal`, `summarizeAggressive`, `summarizeFallback`, `condenseNormal`, `condenseAggressive`, `condenseFallback` to pass the generated content string to the ID function instead of the messages/summaries list. Specifically:

| Method | Old call | New call |
|--------|----------|----------|
| `summarizeNormal` (line 87) | `generateSummaryID(messages)` | `generateSummaryID(content)` |
| `summarizeAggressive` (line 112) | `generateSummaryID(messages)` | `generateSummaryID(content)` |
| `summarizeFallback` (line 141) | `generateSummaryID(originalMessages)` | `generateSummaryID(finalContent)` |
| `condenseNormal` (line 195) | `generateCondensedID(summaries)` | `generateCondensedID(content)` |
| `condenseAggressive` (line 221) | `generateCondensedID(summaries)` | `generateCondensedID(content)` |
| `condenseFallback` (line 252) | `generateCondensedID(originalSummaries)` | `generateCondensedID(finalContent)` |

### 4.3 GetContextTokenCount with full overhead calculation (SQ-21)

**File:** `crush/internal/lcm/store.go`

Replace the `perSummaryOverhead = 10` estimate (line 94) with an actual parent-aware calculation:
```go
func (s *SQLiteStore) GetContextTokenCount(ctx context.Context, sessionID string) (int, error) {
    result, err := s.q.LCMGetContextTokenCount(ctx, sessionID)
    if err != nil {
        return 0, err
    }
    var rawTotal int
    switch v := result.(type) {
    case int64:
        rawTotal = int(v)
    case float64:
        rawTotal = int(v)
    }

    // Compute actual formatting overhead per-summary using parent IDs
    entries, err := s.q.LCMGetCurrentContext(ctx, sessionID)
    if err != nil {
        return rawTotal, nil // Fall back to raw total on error
    }
    for _, entry := range entries {
        if entry.ItemType == "summary" && entry.SummaryID.Valid {
            parents, err := s.q.LCMGetSummaryParentIDs(ctx, entry.SummaryID.String)
            if err != nil {
                continue
            }
            rawTotal += GetSummaryFormattingOverhead(entry.SummaryID.String, parents)
        }
    }
    return rawTotal, nil
}
```

---

## Phase 5: Explorer System (30+ explorers)

### 5.1 Explorer infrastructure updates

**File:** `crush/internal/lcm/explorer.go`

**Change Explorer interface to include path in CanExplore (E14)**:
```go
type Explorer interface {
    Name() string
    CanExplore(path string, mimeType string) bool  // E14: path added for extension-based dispatch
    Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error)
}
```

**Update TextExplorer.CanExplore** (line 79) to accept the new signature:
```go
func (TextExplorer) CanExplore(path string, mimeType string) bool {
    return strings.HasPrefix(mimeType, "text/") ||
        mimeType == "application/json" ||
        // ... rest unchanged ...
        mimeType == ""
}
```

Update `ExplorationResult` to include `ExplorerUsed` **(E8)**:
```go
type ExplorationResult struct {
    Summary      string
    FileIDs      []string
    TokenCount   int
    ExplorerUsed string  // NEW: which explorer produced this
}
```

Update `ExplorerRegistry.Explore` to pass path to `CanExplore` and set `ExplorerUsed` **(E8, E14)**:
```go
func (r *ExplorerRegistry) Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
    for _, e := range r.explorers {
        if e.CanExplore(path, mimeType) {  // E14: path passed
            result, err := e.Explore(ctx, path, mimeType, maxTokens)
            if err != nil {
                return nil, err
            }
            if result != nil {
                result.ExplorerUsed = e.Name()
            }
            return result, nil
        }
    }
    return nil, nil
}
```

### 5.2 Add exploration caching

**File:** `crush/internal/lcm/explorer.go`

Add `ExploreWithCache` method:
```go
func (r *ExplorerRegistry) ExploreWithCache(
    ctx context.Context,
    store Store,
    fileID string,
    path string,
    mimeType string,
    maxTokens int,
) (*ExplorationResult, error) {
    // Check cache first
    cached, err := store.GetLargeFileExploration(ctx, fileID)
    if err == nil && cached != nil {
        return cached, nil
    }
    // Explore
    result, err := r.Explore(ctx, path, mimeType, maxTokens)
    if err != nil || result == nil {
        return result, err
    }
    // Cache result
    _ = store.SetLargeFileExploration(ctx, fileID, result)
    return result, nil
}
```

**File:** `crush/internal/lcm/types.go` — add Store methods:
```go
GetLargeFileExploration(ctx context.Context, fileID string) (*ExplorationResult, error)
SetLargeFileExploration(ctx context.Context, fileID string, result *ExplorationResult) error
```

**File:** `crush/internal/lcm/store.go` — implement both methods using the new SQL queries from Phase 2.4.

**Cache reconstruction note (E17):** The SQL only stores `exploration_summary` and `explorer_used`. When reading from cache, derive the remaining fields:
```go
func (s *SQLiteStore) GetLargeFileExploration(ctx context.Context, fileID string) (*ExplorationResult, error) {
    row, err := s.q.LCMGetLargeFileExploration(ctx, fileID)
    if err != nil {
        return nil, err
    }
    return &ExplorationResult{
        Summary:      row.ExplorationSummary,
        ExplorerUsed: row.ExplorerUsed,
        FileIDs:      extractFileIDs(row.ExplorationSummary),   // E17: derive
        TokenCount:   EstimateTokenCount(row.ExplorationSummary), // E17: derive
    }, nil
}
```

### 5.3 Implement language-specific explorers

**File:** `crush/internal/lcm/explorer_code.go` (NEW)

Common code explorer base that extracts imports, function/method signatures, class/struct definitions, and key comments. Implements explorers for:
- Go, Python, Rust, TypeScript/JavaScript, Java, C/C++, C#, Ruby, Swift, Objective-C, CUDA, Tcl

Approach: Line-based pattern matching (not AST parsing) — extract `func`, `class`, `def`, `import`, `struct`, `interface`, `trait`, `impl`, `module`, etc. with surrounding context.

Each explorer implements **(E14 — uses path for extension matching)**:
```go
type GoExplorer struct{}
func (GoExplorer) Name() string { return "go" }
func (GoExplorer) CanExplore(path string, mimeType string) bool {
    return mimeType == "text/x-go" || filepath.Ext(path) == ".go"
}
func (GoExplorer) Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
    // Read file, extract function signatures, struct defs, imports
    // Return structured summary within maxTokens
}
```

### 5.4 Implement data format explorers

**File:** `crush/internal/lcm/explorer_data.go` (NEW)

- **JSON Explorer**: Parse top-level structure, key names, array lengths, nested depth
- **CSV Explorer**: Read header row + first N data rows, column count
- **YAML Explorer**: Top-level keys, structure depth (uses `gopkg.in/yaml.v3` from go.mod)
- **TOML Explorer**: Section headers, key-value pairs
- **INI Explorer**: Section headers, key-value pairs
- **XML Explorer**: Root element, child element names, attribute names
- **HTML Explorer**: Title, headings, meta tags, link targets

### 5.5 Implement binary/media explorers

**File:** `crush/internal/lcm/explorer_binary.go` (NEW)

- **SQLite Explorer**: Open DB, read `sqlite_master`, extract table schemas, sample rows
- **PDF Explorer**: Page count, metadata (magic bytes + page count heuristic from `%%EOF` markers)
- **Image Explorer**: Dimensions, format from magic bytes, EXIF if available (uses `disintegration/imaging` from go.mod)
- **Executable Explorer**: Magic bytes detection, ELF/Mach-O/PE header parsing
- **Log Explorer**: Line count, timestamp detection, error/warning counts

### 5.6 Implement text-format explorers

**File:** `crush/internal/lcm/explorer_text.go` (NEW)

- **Markdown Explorer**: Headings hierarchy, code block languages, link targets
- **LaTeX Explorer**: `\section`, `\subsection`, `\usepackage`, `\begin{document}`
- **CSS Explorer**: Selector count, `@media` queries, `@import` directives

### 5.7 Fallback and LLM-based explorers

**File:** `crush/internal/lcm/explorer_fallback.go` (NEW)

- **Fallback Explorer**: Generic hex dump + magic byte identification for unknown types
- **LLM Summary Explorer**: Uses `LLMClient` to generate a rich summary of file content when available and below token limit. Falls back to text truncation. Created separately and registered via `Register()` **(E7)**.

### 5.8 Register all explorers

**File:** `crush/internal/lcm/explorer.go`

Update `NewExplorerRegistry` to register all **deterministic** explorers. The LLM explorer requires an `LLMClient` and is registered separately **(E7)**:
```go
func NewExplorerRegistry() *ExplorerRegistry {
    return &ExplorerRegistry{
        explorers: []Explorer{
            // Code explorers (in priority order)
            &GoExplorer{}, &PythonExplorer{}, &RustExplorer{},
            &TypeScriptExplorer{}, &JavaScriptExplorer{}, &JavaExplorer{},
            &CExplorer{}, &CppExplorer{}, &CSharpExplorer{},
            &RubyExplorer{}, &SwiftExplorer{}, &ObjectiveCExplorer{},
            &CUDAExplorer{}, &TclExplorer{},
            // Data format explorers
            &JSONExplorer{}, &CSVExplorer{}, &YAMLExplorer{},
            &TOMLExplorer{}, &INIExplorer{}, &XMLExplorer{}, &HTMLExplorer{},
            // Binary/media explorers
            &SQLiteExplorer{}, &PDFExplorer{}, &ImageExplorer{},
            &ExecutableExplorer{}, &LogExplorer{},
            // Text format explorers
            &MarkdownExplorer{}, &LaTeXExplorer{}, &CSSExplorer{},
            // Catch-all (must be last before fallback)
            &TextExplorer{}, // existing, handles text/*
            &FallbackExplorer{}, // last resort for completely unknown types
        },
    }
}

// RegisterLLMExplorer adds an LLM-based explorer when an LLMClient is available.
func (r *ExplorerRegistry) RegisterLLMExplorer(client LLMClient, model string) {
    // Insert before TextExplorer (second-to-last) so it takes priority
    // over plain text truncation for supported types
    llmExplorer := &LLMSummaryExplorer{client: client, model: model}
    r.Register(llmExplorer)
}
```

---

## Phase 6: Map/Reduce Infrastructure

### 6.1 Agentic map manager

**File:** `crush/internal/lcm/agenticmap.go` (NEW)

```go
type AgenticMapManager struct {
    store Store
}

type MapRunConfig struct {
    InputPath      string
    Prompt         string
    OutputSchema   string // JSON schema
    ReadOnly       bool
    Concurrency    int
    TimeoutSeconds int
    MaxAttempts    int
}

func NewAgenticMapManager(store Store) *AgenticMapManager

func (m *AgenticMapManager) CreateRun(ctx context.Context, config MapRunConfig) (string, error)
func (m *AgenticMapManager) GetRun(ctx context.Context, mapID string) (*AgenticMapRun, error)
func (m *AgenticMapManager) ProcessItems(ctx context.Context, mapID string) error
func (m *AgenticMapManager) GetResults(ctx context.Context, mapID string) ([]AgenticMapItem, error)
```

### 6.2 LLM map manager

**File:** `crush/internal/lcm/llmmap.go` (NEW)

Same pattern as agentic map but with LLM-specific parameters **(E18)**:
```go
type LlmMapManager struct {
    store  Store
    client LLMClient
}

type LlmMapRunConfig struct {
    InputPath      string
    Prompt         string
    OutputSchema   string // JSON schema
    Model          string
    Concurrency    int
    TimeoutSeconds int
    MaxAttempts    int
}

func NewLlmMapManager(store Store, client LLMClient) *LlmMapManager
func (m *LlmMapManager) CreateRun(ctx context.Context, config LlmMapRunConfig) (string, error)
func (m *LlmMapManager) GetRun(ctx context.Context, mapID string) (*LlmMapRun, error)
func (m *LlmMapManager) ProcessItems(ctx context.Context, mapID string) error
func (m *LlmMapManager) GetResults(ctx context.Context, mapID string) ([]LlmMapItem, error)
```

### 6.3 Store methods for map operations

**File:** `crush/internal/lcm/types.go` — extend Store interface:
```go
// Agentic map
CreateAgenticMapRun(ctx context.Context, run *AgenticMapRun) error
GetAgenticMapRun(ctx context.Context, mapID string) (*AgenticMapRun, error)
UpdateAgenticMapRunStatus(ctx context.Context, mapID, status string) error
CreateAgenticMapItem(ctx context.Context, item *AgenticMapItem) error
UpdateAgenticMapItem(ctx context.Context, item *AgenticMapItem) error
GetAgenticMapItemsByStatus(ctx context.Context, mapID, status string) ([]AgenticMapItem, error)
// LLM map
CreateLlmMapRun(ctx context.Context, run *LlmMapRun) error
GetLlmMapRun(ctx context.Context, mapID string) (*LlmMapRun, error)
UpdateLlmMapRunStatus(ctx context.Context, mapID, status string) error
CreateLlmMapItem(ctx context.Context, item *LlmMapItem) error
UpdateLlmMapItem(ctx context.Context, item *LlmMapItem) error
GetLlmMapItemsByStatus(ctx context.Context, mapID, status string) ([]LlmMapItem, error)
```

**File:** `crush/internal/lcm/store.go` — implement all map Store methods.

---

## Phase 7: Integration & Wiring

### 7.1 Update LCM coordinator

**File:** `crush/internal/lcm/integration.go` **(E10 — not lcm.go which doesn't exist)**

Add exploration and map capabilities to the existing `LCM` struct:
```go
type LCM struct {
    Store              Store
    Summarizer         Summarizer
    CompactionManager  *CompactionManager
    ExplorerRegistry   *ExplorerRegistry     // NEW
    AgenticMapManager  *AgenticMapManager    // NEW
    LlmMapManager      *LlmMapManager       // NEW
    DefaultBudgetFunc  func(sessionID string) (TokenBudget, error)
}

// New methods:
func (l *LCM) ExploreFile(ctx context.Context, sessionID, fileID string) (*ExplorationResult, error)
func (l *LCM) SearchMessages(ctx context.Context, sessionID, query string, limit int) ([]LCMMessage, error)
func (l *LCM) SearchMessagesRegex(ctx context.Context, sessionID, pattern string, limit int) ([]LCMMessage, error)
func (l *LCM) CreateAgenticMapRun(ctx context.Context, config MapRunConfig) (string, error)
func (l *LCM) CreateLlmMapRun(ctx context.Context, config LlmMapRunConfig) (string, error)
```

### 7.2 Constructor function

**File:** `crush/internal/lcm/integration.go`

**(E15: parameter renamed from `db` to `sqlDB` to avoid shadowing the imported `db` package)**
```go
func NewLCM(sqlDB *sql.DB, queries *db.Queries, llmClient LLMClient, model string, prompts Prompts) *LCM {
    store := NewSQLiteStore(queries, sqlDB)
    summarizer := NewEscalationSummarizer(llmClient, model, prompts)
    eventBus := NewChannelEventBus(100)
    manager := NewCompactionManager(eventBus)
    registry := NewExplorerRegistry()
    if llmClient != nil {
        registry.RegisterLLMExplorer(llmClient, model) // E7: inject LLMClient via Register
    }
    agenticMap := NewAgenticMapManager(store)
    llmMap := NewLlmMapManager(store, llmClient)

    return &LCM{
        Store:             store,
        Summarizer:        summarizer,
        CompactionManager: manager,
        ExplorerRegistry:  registry,
        AgenticMapManager: agenticMap,
        LlmMapManager:     llmMap,
        DefaultBudgetFunc: func(sessionID string) (TokenBudget, error) {
            config, err := store.GetSessionConfig(context.Background(), sessionID)
            if err != nil {
                return ComputeTokenBudget(128_000, 0, 0, nil, nil), nil
            }
            return ComputeTokenBudget(int(config.ModelCtxMaxTokens), 0, 0, config.CtxCutoffThreshold, nil), nil
        },
    }
}
```

### 7.3 Fix FormatLargeFileForContext hint line (E9)

**File:** `crush/internal/lcm/format.go`

Update `FormatLargeFileForContext` (line 143) to include Volt's external storage hint:
```go
func FormatLargeFileForContext(f *LargeFile) string {
    return fmt.Sprintf("[Large File Stored: %s]\n[Path: %s]\n[Type: %s]\n[Tokens: %d]\n(File content stored externally - use file ID to retrieve)",
        f.FileID, f.OriginalPath, f.MimeType, f.TokenCount)
}
```

---

## Phase 8: Tests

### 8.1 New test coverage

**File:** `crush/internal/lcm/lcm_test.go` — extend with:

- Token-budget windowed selection tests (including zero-row fallback case for E2)
- Model-aware reserve computation tests (with modelOutputLimit)
- Content-based summary ID generation tests (verify `generateSummaryID` uses content+timestamp)
- Content-based condensed ID generation tests (verify `generateCondensedID` uses content+timestamp — E3)
- Condense-all-summaries tests
- Full overhead GetContextTokenCount tests (with parent summaries)
- Explorer tests for each new explorer type (code, data, binary, text)
- Map run lifecycle tests (create, process, complete)
- ExploreWithCache hit/miss tests
- LCM constructor and wiring test
- FormatLargeFileForContext hint line test (E9)
- Pre-computed token_count preference test (E12)

### 8.2 Update mock store

**File:** `crush/internal/lcm/lcm_test.go`

Extend `mockStore` with all new Store interface methods:
- `GetMessagesToSummarizeByTokenBudget`
- `GetLargeFileExploration` / `SetLargeFileExploration`
- All 12 map CRUD methods
- Update `GetMessagesByIDs` to return messages with pre-computed `TokenCount`

### 8.3 Update export_test.go

**File:** `crush/internal/lcm/export_test.go`

Add any new unexported functions that tests need access to.

---

## Execution Order

1. **Phase 1** (Schema) — creates all tables and columns, adds trigger
2. **Phase 2** (SQL + generated code) — fixes existing queries, adds new ones
3. **Phase 3** (Token management) — pre-computed tokens, budget windowing, model-aware reserve
4. **Phase 4** (Compaction logic) — condense-all, content-based IDs, full overhead
5. **Phase 5** (Explorers) — all 30+ explorers with caching
6. **Phase 6** (Map/Reduce) — agentic and LLM map managers
7. **Phase 7** (Integration) — constructor, coordinator methods, format fix
8. **Phase 8** (Tests) — comprehensive coverage for everything above

## Files Modified (existing)

- `crush/internal/db/migrations/20260221000000_lcm_feature_parity.sql` (NEW)
- `crush/internal/db/sql/lcm.sql` (MODIFY — fix ceiling division, add windowed query, exploration cache, update LCMGetLargeFile)
- `crush/internal/db/sql/message_parts.sql` (NEW)
- `crush/internal/db/sql/map.sql` (NEW)
- `crush/internal/db/lcm.sql.go` (MODIFY — update existing queries, add new ones)
- `crush/internal/db/message_parts.sql.go` (NEW)
- `crush/internal/db/map.sql.go` (NEW)
- `crush/internal/db/db.go` (MODIFY — ~18 new prepared statements)
- `crush/internal/db/models.go` (MODIFY — add fields to LcmLargeFile, Message; add MessagePart, map structs)
- `crush/internal/db/querier.go` (MODIFY — add 7 missing methods from 7129b82 + all new query methods; E20)
- `crush/internal/lcm/config.go` (MODIFY — ComputeTokenBudget signature)
- `crush/internal/lcm/compactor.go` (MODIFY — condense-all, token-budget windowed selection)
- `crush/internal/lcm/summarizer.go` (MODIFY — generateSummaryID and generateCondensedID to hash content+timestamp)
- `crush/internal/lcm/store.go` (MODIFY — pre-computed tokens, overhead calc, exploration cache, map methods)
- `crush/internal/lcm/types.go` (MODIFY — LargeFile fields, Store interface expansion)
- `crush/internal/lcm/explorer.go` (MODIFY — ExplorationResult.ExplorerUsed, caching, registry expansion)
- `crush/internal/lcm/integration.go` (MODIFY — LCM struct expansion, NewLCM constructor, new methods)
- `crush/internal/lcm/format.go` (MODIFY — FormatLargeFileForContext hint line)
- `crush/internal/lcm/explorer_code.go` (NEW — 14 code explorers)
- `crush/internal/lcm/explorer_data.go` (NEW — 7 data format explorers)
- `crush/internal/lcm/explorer_binary.go` (NEW — 5 binary/media explorers)
- `crush/internal/lcm/explorer_text.go` (NEW — 3 text format explorers)
- `crush/internal/lcm/explorer_fallback.go` (NEW — fallback + LLM summary explorer)
- `crush/internal/lcm/agenticmap.go` (NEW)
- `crush/internal/lcm/llmmap.go` (NEW)
- `crush/internal/lcm/lcm_test.go` (MODIFY — new tests, mock expansion, call site updates)
- `crush/internal/lcm/export_test.go` (MODIFY)
