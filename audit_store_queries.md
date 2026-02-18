# LCM Store & Query Layer Audit: Volt (TS/PostgreSQL) vs Crush (Go/SQLite)

## Summary Table

| ID    | Severity | Category                 | Summary                                                                                     |
|-------|----------|--------------------------|---------------------------------------------------------------------------------------------|
| SQ-1  | HIGH     | Token Count Computation  | Crush re-estimates message tokens at query time via `LENGTH()/4` on raw JSON parts; Volt stores and reads a pre-computed `token_count` column |
| SQ-2  | HIGH     | Missing Operations       | Crush Store interface omits 12+ Volt DB operations (searchMessages, regexSearch, etc.); searchSummaries IS present |
| SQ-3  | HIGH     | Expand Summary Logic     | Crush `LCMExpandSummaryToMessages` is non-recursive (leaf only); Volt uses recursive CTE to walk DAG |
| SQ-4  | MEDIUM   | `interface{}` Return     | `LCMGetContextTokenCount` returns `interface{}`; type assertion silently returns 0 on unexpected type |
| SQ-5  | MEDIUM   | Batch Query N+1          | `GetMessagesByIDs` and `GetSummariesByIDs` issue N individual queries instead of batch       |
| SQ-6  | MEDIUM   | FK Constraint Mismatch   | `summary_messages.message_id` uses `ON DELETE CASCADE` in Crush vs `ON DELETE RESTRICT` in Volt |
| SQ-7  | MEDIUM   | FK Constraint Mismatch   | `context_items.message_id` uses `ON DELETE CASCADE` in Crush vs `ON DELETE RESTRICT` in Volt  |
| SQ-8  | MEDIUM   | GetMessagesToSummarize   | Crush uses a simple row LIMIT; Volt uses running-token-sum window function with fallback      |
| SQ-9  | MEDIUM   | Transaction Isolation    | `ReplacePositionsWithSummary` uses default isolation (no explicit locking); concurrent appends can race |
| SQ-10 | MEDIUM   | Missing Store Method     | `GetLargeFile` has a sqlc query but no Store interface method, so callers cannot retrieve large file metadata |
| SQ-11 | MEDIUM   | File ID Hash Divergence  | Hash input format differs: Volt uses `:` separator + `mtime.getTime()` (ms); Crush uses `|` separator + `mtime.Unix()` (s) |
| SQ-12 | LOW      | `interface{}` Return     | `LCMGetCurrentContext` token_count is `interface{}`; assertion only handles `int64`, not other numeric types |
| SQ-13 | LOW      | `int64` to `int` Narrow  | Multiple narrowing conversions (`int64` -> `int`) without overflow guard                      |
| SQ-14 | LOW      | Summary TokenCount Type  | `Summary.TokenCount` is `int64` in Go but `LCMMessage.TokenCount` is `int`; risk of silent truncation when mixed |
| SQ-15 | LOW      | Null Byte Escaping       | Volt escapes `\0` bytes for PostgreSQL text columns; Crush has no equivalent (SQLite allows NUL bytes but may corrupt FTS) |
| SQ-16 | LOW      | InsertLeafSummary Txn    | Crush `InsertLeafSummary` is not transactional; Volt wraps insert + linkage in a single transaction |
| SQ-17 | LOW      | JSON File IDs Default    | On JSON parse failure, Crush silently sets `FileIDs = nil` instead of `[]string{}`; Volt defaults to `[]` |
| SQ-18 | INFO     | SearchSummaries FTS5     | Crush FTS5 JOIN uses `s.rowid = fts.rowid`; correct for content-sync FTS5 tables              |
| SQ-19 | INFO     | Naming Convention        | Volt uses `conversation_id` (numeric); Crush uses `session_id` (string) -- intentional design divergence |
| SQ-20 | INFO     | AppendMessage Atomicity  | Volt `appendMessage` atomically inserts message + context item in a txn with row-locking; Crush separates message creation from context append |
| SQ-21 | MEDIUM   | Token Count Overhead     | Crush `GetContextTokenCount` SQL omits summary formatting overhead (`[Summary ID: ...]`); Volt includes it, causing compaction to trigger late in Crush |
| SQ-22 | LOW      | Estimator Divergence     | Volt uses JS `content.length/4` (UTF-16 code units); Crush uses Go `len([]rune)/4` (Unicode code points); no practical impact for ASCII-only formatting strings |

---

## Detailed Findings

### SQ-1: Token Count Computation Divergence [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 886-950):
Messages have a stored `token_count` column populated at insert time. `getCurrentContext` and `getContextTokenCount` read this pre-computed value directly:
```sql
COALESCE(m.token_count, s.token_count) AS token_count
```

**Crush** (`/tmp/crush/internal/db/sql/lcm.sql`, lines 1-18, 20-31):
Messages do NOT have a stored `token_count` column. Instead, Crush re-estimates tokens at query time:
```sql
CASE
    WHEN ci.item_type = 'message' THEN LENGTH(COALESCE(m.parts, '')) / 4
    ELSE COALESCE(s.token_count, 0)
END AS token_count
```

**Impact**: Unlike PostgreSQL's `LENGTH()` which can vary by type, SQLite's `LENGTH()` on TEXT values returns the number of **characters** (Unicode code points), not bytes. This means the SQL-level `LENGTH(m.parts)/4` and the Go-level `len([]rune(content))/4` (in `EstimateTokenCount` at `/tmp/crush/internal/lcm/config.go` lines 47-51) are actually **consistent with each other** for valid UTF-8 text -- both count Unicode code points.

However, the core divergence from Volt remains significant: Volt stores a pre-computed `token_count` column at insert time (populated via `Token.estimate()`), while Crush re-estimates at query time. The pre-computed value may use a more sophisticated tokenizer, leading to different results. Additionally, the Crush SQL estimate operates on the raw `m.parts` column (which is JSON-serialized message parts, including JSON syntax characters like `[`, `{`, `"`, etc.), not the plain text content. This inflates the estimate relative to the actual text content.

Furthermore, `GetMessagesByIDs` in `/tmp/crush/internal/lcm/store.go` line 133 calls `EstimateTokenCount(row.Content)` -- since `row.Content` is aliased from `m.parts`, both paths estimate from the same raw JSON string. The estimates are internally consistent within Crush, but diverge from Volt's pre-computed values.

---

### SQ-2: Missing Store Operations [HIGH]

The Crush `Store` interface (`/tmp/crush/internal/lcm/types.go`, lines 97-114) omits many operations that Volt's DB layer provides:

| Volt Operation | Volt Location (db.ts line) | Present in Crush? |
|---|---|---|
| `createConversation` | 675 | No (handled by session layer) |
| `getConversation` | 1444 | No |
| `appendMessage` (msg + ctx item, atomic) | 720 | No (separated) |
| `getMessage` | 1457 | Partial (via `GetMessagesByIDs`) |
| `getMessages` (all for conversation) | 1470 | No |
| `getMessageCount` | 1085 | No |
| `searchMessages` (FTS) | 1404 | No |
| `searchSummaries` (FTS, via tsvector) | 1424 | Yes (FTS5 via `SearchSummaries` on Store) |
| `regexSearchMessages` | 1546 | No |
| `getSummaryById` (with ancestor scoping) | 1333 | Partial (no ancestor scoping) |
| `getSummaryMessageIds` | 1484 | No |
| `getChildSummaryIds` | 1513 | No |
| `getCoveringSummary` | 1530 | No |
| `getAncestorConversationIds` | 700 | No |
| `replaceContextWithSummary` (range-based) | 1158 | No (only position-based exists) |
| `insertLargeFile` (inline content) | 1685 | No |
| `insertLargeTextContent` | 1717 | No |
| `insertLargeBinaryFile` | 1821 | No |
| `getLargeFile` | 1854 | No Store method (sqlc query exists) |
| `getLargeFileContent` | 1897 | Standalone function, not on Store |
| `getLargeFilesByConversation` | 1979 | No |
| `largeFileExists` | 1997 | No |
| `updateLargeFileExploration` | 1799 | No |
| `insertMessageParts` | 809 | No |
| `getMessageParts` | 845 | No |
| `getMessagePartsForMessages` | 859 | No |

Some of these are intentionally out-of-scope (message parts, agentic map, etc.) given Crush's different architecture, but others like `searchMessages`, `getSummaryMessageIds`, `getChildSummaryIds`, and `getCoveringSummary` are retrieval operations that Volt's context/retrieval layer depends on.

---

### SQ-3: ExpandSummaryToMessages is Non-Recursive [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1368-1399):
Uses a recursive CTE to walk the entire summary DAG (summary -> parent summaries -> leaf summaries -> messages):
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
SELECT DISTINCT m.conversation_id, m.seq, m.role, m.content, m.created_at
FROM leaf_messages lm
JOIN messages m ON m.message_id = lm.message_id
ORDER BY m.seq
```

**Crush** (`/tmp/crush/internal/db/sql/lcm.sql`, lines 87-92):
Only queries a single level of `lcm_summary_messages` -- no recursion:
```sql
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at
FROM lcm_summary_messages sm
JOIN messages m ON m.id = sm.message_id
WHERE sm.summary_id = ?
ORDER BY sm.ord
```

**Crush workaround** (`/tmp/crush/internal/lcm/retrieval.go`, lines 9-54):
Crush compensates with Go-level recursion in `ExpandSummary()` / `expandSummaryWithVisited()`. This function checks if a summary has direct messages; if not, it recursively fetches parent IDs and expands each. This is functionally equivalent but issues N+1 queries per DAG node instead of a single recursive CTE. For deep DAGs, this could cause significant query amplification.

**Note**: The sqlc-level `LCMExpandSummaryToMessages` query is misleadingly named since it only expands one leaf level, not the full DAG. Callers using the Store interface method directly (without the `ExpandSummary` wrapper) will get incomplete results for condensed summaries.

---

### SQ-4: `interface{}` Return Type for Token Count [MEDIUM]

**File**: `/tmp/crush/internal/lcm/store.go`, lines 60-70; `/tmp/crush/internal/db/lcm.sql.go`, lines 121-126

`LCMGetContextTokenCount` returns `(interface{}, error)` because sqlc cannot determine the concrete type of `COALESCE(SUM(CASE...))`. The Store layer asserts:
```go
if v, ok := result.(int64); ok {
    return int(v), nil
}
return 0, nil
```

**Risk**: If SQLite returns a different numeric type (e.g., `float64` for division results, or `nil` despite COALESCE), the assertion silently falls through and returns 0. This would cause the compaction manager to believe the context is empty, skipping needed compaction. The COALESCE(... , 0) should prevent `nil`, but the `LENGTH()/4` integer division in SQLite produces an integer, so `float64` is unlikely here -- but the silent fallback to 0 without error logging is still a concern.

**Recommendation**: Add a fallback for `float64` and log a warning on unexpected types.

---

### SQ-5: Batch Query N+1 Pattern [MEDIUM]

**File**: `/tmp/crush/internal/lcm/store.go`, lines 119-137 (`GetMessagesByIDs`), 198-219 (`GetSummariesByIDs`)

Both methods loop over individual IDs issuing one query per ID:
```go
for _, id := range ids {
    row, err := s.q.LCMGetMessageByID(ctx, id)
    ...
}
```

**Volt** uses `ANY(${messageIds})` for batch lookups (e.g., `getMessagePartsForMessages` at db.ts line 862).

The code comment explains this is because "sqlc doesn't support sqlc.slice for SQLite," which is accurate. However, for large batches (e.g., 50+ messages during summarization), this N+1 pattern introduces significant latency. A raw SQL approach with `IN (?, ?, ...)` (dynamically built) would be more performant.

---

### SQ-6: FK Constraint Mismatch on summary_messages.message_id [MEDIUM]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 433):
```sql
message_id bigint NOT NULL REFERENCES messages(message_id) ON DELETE RESTRICT
```

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, line 21):
```sql
message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE
```

**Impact**: In Volt, deleting a message that is referenced by a summary is blocked (RESTRICT), preserving summary integrity. In Crush, deleting such a message cascades and silently removes the linkage, leaving the summary with missing message links. This could cause `ExpandSummaryToMessages` to return incomplete results or empty results without error.

---

### SQ-7: FK Constraint Mismatch on context_items.message_id [MEDIUM]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 467):
```sql
FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE RESTRICT
```

**Crush** (`/tmp/crush/internal/db/migrations/20260218000000_create_lcm_tables.sql`, line 54):
```sql
FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
```

**Impact**: Same concern as SQ-6. In Volt, deleting a message that is part of the active context window is blocked. In Crush, it cascades, which silently removes context items. This could cause context gaps or position numbering issues.

---

### SQ-8: GetMessagesToSummarize Uses Row Limit Instead of Token Budget [MEDIUM]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1043-1080):
Uses a window function to compute a running token sum and selects messages up to a token budget:
```sql
WITH msgs AS (
    SELECT ci.position, ci.message_id, m.token_count,
           SUM(m.token_count) OVER (ORDER BY ci.position) AS running_tokens
    FROM context_items ci
    JOIN messages m ON m.message_id = ci.message_id
    WHERE ci.conversation_id = ${conversationId} AND ci.item_type = 'message'
)
SELECT position, message_id FROM msgs
WHERE running_tokens <= ${tokenBudget}
```
Additionally, Volt has a fallback: if the oldest message alone exceeds the budget, it still returns that one message to ensure progress.

**Crush** (`/tmp/crush/internal/db/sql/lcm.sql`, lines 47-52):
Simply uses `LIMIT ?`:
```sql
SELECT ci.position, ci.item_type, ci.message_id, ci.summary_id
FROM lcm_context_items ci
WHERE ci.session_id = ? AND ci.item_type = 'message'
ORDER BY ci.position
LIMIT ?
```

**Impact**: The Crush compactor passes `budget.SoftThreshold` as the row limit (`/tmp/crush/internal/lcm/compactor.go`, line 74), which is a token count (e.g., 76800), not a row count. This would return ALL messages (since most sessions have far fewer than 76800 messages), defeating the purpose of limiting the summarization input. The query should either use a running token sum (like Volt) or the caller should pass a reasonable row limit.

Additionally, Crush lacks the fallback for when the oldest message exceeds the budget.

---

### SQ-9: Transaction Isolation in ReplacePositionsWithSummary [MEDIUM]

**File**: `/tmp/crush/internal/lcm/replace.go`, lines 12-129

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1234-1325):
Uses PostgreSQL transactions. The `appendMessage` function (line 728) explicitly locks the conversation row with `FOR UPDATE` to serialize concurrent appends.

**Crush** (`/tmp/crush/internal/lcm/replace.go`, line 23):
```go
tx, err := db.BeginTx(ctx, nil)
```
Uses default transaction options (`nil`). SQLite's default isolation is `DEFERRED`, meaning the transaction acquires no locks until the first write. Between reading the current items (line 41) and deleting/reinserting (line 71+), a concurrent `AppendContextItem` could insert a new item that gets lost during the delete-all/rebuild.

However, SQLite in WAL mode with `IMMEDIATE` or `EXCLUSIVE` transactions would prevent this. The risk depends on how the SQLite connection is configured. Since the code uses `nil` options (DEFERRED), there is a theoretical race window.

**Recommendation**: Use `&sql.TxOptions{Isolation: sql.LevelSerializable}` or begin with `BEGIN IMMEDIATE` to prevent concurrent writes during the read-modify-write cycle.

---

### SQ-10: GetLargeFile Missing from Store Interface [MEDIUM]

**File**: `/tmp/crush/internal/lcm/types.go`, lines 97-114; `/tmp/crush/internal/db/sql/lcm.sql`, lines 102-104

The sqlc query `LCMGetLargeFile` exists and is generated (`/tmp/crush/internal/db/lcm.sql.go`, lines 191-208), and the `Querier` interface includes it (`/tmp/crush/internal/db/querier.go`, line 40). However, the `Store` interface in `/tmp/crush/internal/lcm/types.go` does NOT expose a `GetLargeFile` method.

**Impact**: Any code that needs to retrieve large file metadata (e.g., for exploration summaries, existence checks, or retrieving `original_path` to read content) must bypass the Store abstraction and access the sqlc Queries directly, breaking the layered architecture.

---

### SQ-11: File ID Hash Input Divergence [MEDIUM]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1637-1646):
```typescript
hash.update(`${conversationId}:${filePath}:${fileSize}:${mtime.getTime()}`)
// mtime.getTime() returns milliseconds since epoch
```

**Crush** (`/tmp/crush/internal/lcm/largefile.go`, lines 75-80):
```go
fmt.Fprintf(h, "%s|%s|%d|%d", sessionID, filePath, fileSize, mtime.Unix())
// mtime.Unix() returns seconds since epoch
```

**Differences**:
1. **Separator**: Volt uses `:`, Crush uses `|`
2. **Time precision**: Volt uses milliseconds (`mtime.getTime()`), Crush uses seconds (`mtime.Unix()`)
3. **ID type**: Volt uses numeric `conversationId`, Crush uses string `sessionID`

These are all expected given the different architectures, but it means the same file on disk will produce different `file_id` values between Volt and Crush. This is fine for independent deployments but would be problematic for any data migration scenario.

---

### SQ-12: `interface{}` Type Assertion in GetCurrentContext [LOW]

**File**: `/tmp/crush/internal/lcm/store.go`, lines 41-44

```go
tokenCount := 0
if tc, ok := row.TokenCount.(int64); ok {
    tokenCount = int(tc)
}
```

Only `int64` is handled. SQLite may return `float64` for certain computed expressions (though integer division should yield integers here). The fallback silently defaults to 0, which would cause the context entry to appear as having zero tokens, potentially confusing token budget calculations.

---

### SQ-13: int64-to-int Narrowing Without Overflow Guard [LOW]

**Files**: `/tmp/crush/internal/lcm/store.go` (lines 43, 47, 141, 254)

Multiple locations perform `int(row.Position)`, `int(tc)`, `int(count)` etc., converting `int64` to `int`. On 64-bit systems this is safe, but on 32-bit systems, values exceeding ~2 billion would silently wrap. Given these are token counts and position indices, values are unlikely to reach this range, but the pattern is worth noting.

---

### SQ-14: TokenCount Type Inconsistency Between Summary and LCMMessage [LOW]

**File**: `/tmp/crush/internal/lcm/types.go`, lines 15-32

`LCMMessage.TokenCount` is `int` (line 22) while `Summary.TokenCount` is `int64` (line 30). When summaries and messages are compared or summed in the compaction loop, the implicit widening from `int` to `int64` is safe, but passing `Summary.TokenCount` to APIs expecting `int` could truncate. The `ContextEntry.TokenCount` is `int` (line 43), so when a summary's token count is placed into a ContextEntry, it undergoes `int64` -> `int` narrowing.

---

### SQ-15: Missing Null Byte Escaping [LOW]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 20-21):
```typescript
const escNull = (s: string) => s.replaceAll("\0", "\\x00")
```
All text content inserted into PostgreSQL is sanitized to escape NUL bytes, which PostgreSQL text columns reject.

**Crush**: No equivalent escaping exists. SQLite's TEXT type can store NUL bytes, but they may cause issues with:
1. FTS5 indexing (NUL bytes in content could corrupt the FTS index)
2. Go's `string` type (Go strings can contain NUL bytes, but many C-based SQLite drivers use C strings internally where NUL terminates)

---

### SQ-16: InsertLeafSummary / InsertCondensedSummary Not Transactional [LOW]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1098-1121 for `insertLeafSummary`, lines 1126-1153 for `insertCondensedSummary`):
Both functions wrap the summary insert and linkage insert in a single transaction:
```typescript
// insertLeafSummary:
await conn.begin(async (tx) => {
    await tx`INSERT INTO summaries ...`
    await tx`INSERT INTO summary_messages ${tx(values)}`
})
// insertCondensedSummary:
await conn.begin(async (tx) => {
    await tx`INSERT INTO summaries ...`
    await tx`INSERT INTO summary_parents ${tx(values)}`
})
```

**Crush** (`/tmp/crush/internal/lcm/store.go`, lines 144-169 for `InsertLeafSummary`, lines 171-196 for `InsertCondensedSummary`):
Both methods use sequential non-transactional calls:
```go
// InsertLeafSummary:
if err := s.q.LCMInsertSummary(ctx, ...); err != nil { return err }
for i, msgID := range messageIDs {
    if err := s.q.LCMInsertSummaryMessage(ctx, ...); err != nil { return err }
}

// InsertCondensedSummary follows the same pattern:
if err := s.q.LCMInsertSummary(ctx, ...); err != nil { return err }
for i, parentID := range parentIDs {
    if err := s.q.LCMInsertSummaryParent(ctx, ...); err != nil { return err }
}
```

**Impact**: If the process crashes after inserting the summary but before completing all message/parent links, the summary will exist with incomplete linkage. For condensed summaries, this means the DAG would have missing parent edges, potentially breaking recursive expansion. The `ON CONFLICT DO NOTHING` on the summary insert provides idempotency for retries, but the linkage inserts (which also have `ON CONFLICT DO NOTHING`) could be partially applied. The comment in `/tmp/crush/internal/lcm/compactor.go` lines 98-99 acknowledges this: "crash between them leaves a dangling summary but ON CONFLICT DO NOTHING handles re-execution cleanly."

---

### SQ-17: JSON FileIDs Failure Defaults to nil Instead of Empty Slice [LOW]

**File**: `/tmp/crush/internal/lcm/store.go`, lines 206-208

```go
if err := json.Unmarshal([]byte(row.FileIds), &fileIDs); err != nil {
    fileIDs = nil
}
```

Volt defaults `file_ids` to `[]` (empty array) at the schema level (`DEFAULT '[]'`) and in the Zod schema (`z.array(z.string()).default([])`). Crush's error handling sets `fileIDs = nil`, which means downstream code checking `len(summary.FileIDs)` works correctly (nil slice has length 0), but code checking `summary.FileIDs == nil` vs `len(summary.FileIDs) == 0` may behave differently.

---

### SQ-18: SearchSummaries FTS5 JOIN Correctness [INFO]

**File**: `/tmp/crush/internal/lcm/store.go`, lines 307-339

The FTS5 search uses:
```sql
FROM lcm_summaries_fts fts
JOIN lcm_summaries s ON s.rowid = fts.rowid
WHERE lcm_summaries_fts MATCH ?
AND s.session_id = ?
```

This is correct for a content-sync FTS5 table (defined with `content=lcm_summaries, content_rowid=rowid` in the migration). The JOIN on `rowid` is the proper way to link FTS results back to the main table.

The query sanitization (`strings.ReplaceAll(query, "\"", " ")` then wrapping in quotes) is a reasonable approach to prevent FTS5 syntax injection, though it means quoted-phrase searches are not possible. Volt uses PostgreSQL's `plainto_tsquery()` which provides similar protection.

---

### SQ-19: Naming Convention Divergence [INFO]

Volt uses numeric `conversation_id` (PostgreSQL `bigint GENERATED ALWAYS AS IDENTITY`) as the primary entity grouping key. Crush uses string `session_id` (references `sessions(id)`) which maps to Crush's existing session abstraction. This is an intentional architectural difference, not a bug. The Crush `session_id` corresponds to Volt's `conversation_id` conceptually, though the types and namespaces differ.

---

### SQ-20: AppendMessage Atomicity [INFO]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 720-769):
`appendMessage` is a single atomic operation that:
1. Locks the conversation row (`FOR UPDATE`)
2. Computes next sequence number
3. Inserts the message
4. Computes next context position
5. Inserts the context item
All in one transaction.

**Crush**: Message creation and context item appending are separate operations:
- Message creation is handled by the message service (`/tmp/crush/internal/message/message.go`)
- Context appending is done via `Store.AppendContextItem` (`/tmp/crush/internal/lcm/store.go`, lines 76-90)

The `LCMAppendContextItem` SQL (`/tmp/crush/internal/db/sql/lcm.sql`, lines 33-37) uses a subquery `COALESCE(MAX(ci.position), -1) + 1` to auto-compute the next position, which is atomic within the single INSERT statement. However, the message creation and context append are not wrapped in a single transaction, so a crash between them could leave a message without a corresponding context entry.

---

### SQ-21: GetContextTokenCount Omits Summary Formatting Overhead [MEDIUM]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1003-1037):
`getContextTokenCount` iterates over context entries and adds formatting overhead for summary items (the `[Summary ID: ...]` and `[Parent Summaries: ...]` headers):
```typescript
for (const row of rows) {
    total += row.token_count
    if (row.item_type === "summary" && row.summary_id) {
        const parents = row.summary_kind === "condensed" ? await getSummaryParentIds(row.summary_id) : []
        total += getSummaryFormattingOverhead(row.summary_id, parents)
    }
}
```

**Crush** (`/tmp/crush/internal/db/sql/lcm.sql`, lines 20-31):
`LCMGetContextTokenCount` computes the total purely in SQL without any formatting overhead:
```sql
SELECT COALESCE(SUM(
    CASE
        WHEN ci.item_type = 'message' THEN LENGTH(COALESCE(m.parts, '')) / 4
        WHEN ci.item_type = 'summary' THEN s.token_count
        ELSE 0
    END
), 0) AS total_tokens
```

Crush's `GetFormattedContext` function (`/tmp/crush/internal/lcm/context.go`, lines 9-35) correctly adds formatting overhead to individual entries via `GetSummaryFormattingOverhead`, but `GetContextTokenCount` (used by the compactor to decide when to compact) does NOT include this overhead.

**Impact**: The compactor uses `GetContextTokenCount` to compare against `budget.SoftThreshold`. By omitting the formatting overhead, Crush systematically underestimates the actual context size by roughly `N * (overhead_per_summary)` tokens, where N is the number of summaries in context. This causes compaction to trigger later than intended, potentially allowing context to grow past the soft threshold before compaction kicks in. For conversations with several summaries, this could mean the actual context sent to the LLM exceeds the intended limit.

---

### SQ-22: Summary Formatting Overhead Uses Different Token Estimators [LOW]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 984-994):
`getSummaryFormattingOverhead` uses `LargeFileThreshold.estimateTokenCount(formattingText)`, which computes `Math.ceil(content.length / 4)` where `content.length` is JavaScript string length (UTF-16 code units).

**Crush** (`/tmp/crush/internal/lcm/context.go`, lines 50-58):
`GetSummaryFormattingOverhead` uses `EstimateTokenCount(strings.Join(lines, "\n"))`, which computes `len([]rune(content)) / CharsPerToken` (Unicode code points).

For ASCII-only formatting strings (like `[Summary ID: sum_xxx]`), these produce the same results. For summary IDs and parent IDs (which are hex strings), they are always equivalent. This is a cosmetic inconsistency with no practical impact.

---

## Cross-Cutting Observations

### Architecture Differences (Not Bugs)

1. **Database engine**: Volt uses PostgreSQL with JSONB, tsvector, arrays, enums, and recursive CTEs. Crush uses SQLite with FTS5, TEXT columns, and CHECK constraints. These are fundamental platform differences that necessitate many of the query divergences.

2. **Multi-tenancy**: Volt has a multi-tenant schema-per-user model with `search_path` management. Crush is single-tenant (session-scoped). This is an intentional simplification.

3. **Message structure**: Volt stores separate `messages` rows with a `content` TEXT column and a `token_count` integer. Crush reuses an existing `messages` table with a `parts` TEXT column (likely JSON-serialized message parts) and no `token_count` column, requiring runtime estimation.

4. **Message parts**: Volt has an entire `message_parts` table with 30+ columns for structured message storage. Crush does not implement this.

### Most Critical Issues to Address

1. **SQ-8**: The `GetMessagesToSummarize` row-limit bug is likely causing every compaction to attempt summarizing ALL messages at once (since `budget.SoftThreshold` as a row count is astronomically high). This would cause summarization failures or extremely slow LLM calls.

2. **SQ-1**: The token count divergence between Crush (runtime estimation on raw JSON parts via `LENGTH()/4`) and Volt (pre-computed `token_count` column) means context size calculations will differ. The Crush estimate includes JSON syntax overhead (brackets, quotes, field names) inflating the count relative to actual text content.

3. **SQ-21**: The formatting overhead omission in `GetContextTokenCount` compounds with SQ-1 -- the compactor underestimates context size, causing compaction to trigger later than intended.

4. **SQ-3**: While the Go-level recursion in `retrieval.go` compensates for the non-recursive SQL, callers using `Store.ExpandSummaryToMessages` directly will get incomplete results for condensed summaries. The Store interface method name is misleading.

---

## Review Notes

This section documents corrections and additions made during the verification review of this audit.

### Corrections Applied

1. **SQ-1 (Factual correction)**: The original claim that "SQLite's `LENGTH()` counts bytes, not characters" was **incorrect**. SQLite's `LENGTH()` on TEXT values returns the number of Unicode characters (code points), not bytes. `LENGTH()` only returns byte count for BLOB values. The SQL-level `LENGTH(m.parts)/4` and Go-level `len([]rune(content))/4` are actually **consistent** with each other. The impact analysis was updated to reflect the real divergence: Crush estimates from raw JSON-serialized parts (inflated by JSON syntax), while Volt uses pre-computed values. The claim of an "internal inconsistency" between SQL and Go estimates was removed.

2. **SQ-2 (Factual correction)**: `searchSummaries` was listed as "Partial (FTS5 in store)" but is actually fully implemented on the Crush `Store` interface (line 113 of `types.go`: `SearchSummaries`), backed by a raw SQL implementation in `store.go` lines 307-339. Changed to "Yes (FTS5 via `SearchSummaries` on Store)".

3. **SQ-16 (Incomplete)**: The finding title mentioned both `InsertLeafSummary` and `InsertCondensedSummary` but the detail only discussed the leaf case. Updated to document both methods, noting that `InsertCondensedSummary` (`store.go` lines 171-196) follows the same non-transactional pattern. Also updated the Volt section to reference both `insertLeafSummary` (lines 1098-1121) and `insertCondensedSummary` (lines 1126-1153) which both use transactions.

### Findings Added

1. **SQ-21 (MEDIUM)**: `GetContextTokenCount` in Crush's SQL does not include the summary formatting overhead (`[Summary ID: ...]` and `[Parent Summaries: ...]` headers). Volt's equivalent function (`getContextTokenCount` at db.ts lines 1003-1037) iterates over entries and adds this overhead. Crush's `GetFormattedContext` (context.go lines 9-35) correctly adds the overhead to individual entries, but the aggregate token count used by the compactor for threshold decisions omits it.

2. **SQ-22 (LOW)**: Volt's `LargeFileThreshold.estimateTokenCount` uses JavaScript `content.length / 4` (UTF-16 code units) while Crush's `EstimateTokenCount` uses `len([]rune(content)) / CharsPerToken` (Unicode code points). These differ for supplementary Unicode characters (emoji, rare CJK), where JS counts 2 code units per character. No practical impact since the affected formatting strings are ASCII-only hex identifiers.

### Verified Correct (No Changes Needed)

- **SQ-3**: Recursive CTE in Volt and non-recursive SQL + Go-level recursion in Crush accurately described. Line numbers, code quotes, and workaround analysis all verified correct.
- **SQ-4**: `interface{}` return type for `LCMGetContextTokenCount` confirmed at `lcm.sql.go` line 121. Type assertion logic in `store.go` lines 60-70 accurately quoted.
- **SQ-5**: N+1 query pattern confirmed at `store.go` lines 119-137 and 198-219. Volt batch pattern at `db.ts` line 862 confirmed.
- **SQ-6**: FK constraint `ON DELETE CASCADE` on `lcm_summary_messages.message_id` confirmed at migration line 21. Volt's `ON DELETE RESTRICT` confirmed at `db.ts` line 433.
- **SQ-7**: FK constraint `ON DELETE CASCADE` on `lcm_context_items.message_id` confirmed at migration line 54. Volt's `ON DELETE RESTRICT` confirmed at `db.ts` line 467.
- **SQ-8**: `budget.SoftThreshold` passed as row limit confirmed at `compactor.go` line 74. Volt's window function approach confirmed at `db.ts` lines 1043-1080.
- **SQ-9**: Transaction isolation with `nil` options confirmed at `replace.go` line 23. Volt's `FOR UPDATE` locking confirmed at `db.ts` lines 730-733.
- **SQ-10**: `GetLargeFile` missing from Store interface confirmed. sqlc query exists at `lcm.sql` lines 102-104; generated code at `lcm.sql.go` lines 191-208; Querier interface at `querier.go` line 40.
- **SQ-11**: Hash input format differences confirmed. Separator `:` vs `|`, milliseconds vs seconds, numeric vs string ID.
- **SQ-12**: Type assertion at `store.go` lines 41-44 confirmed.
- **SQ-13**: Narrowing conversions at `store.go` lines 43, 47, 141, 254 all confirmed.
- **SQ-14**: Type mismatch `LCMMessage.TokenCount int` (types.go line 22) vs `Summary.TokenCount int64` (types.go line 30) vs `ContextEntry.TokenCount int` (types.go line 43) confirmed.
- **SQ-15**: Null byte escaping at `db.ts` lines 19-21 confirmed. No equivalent in Crush confirmed.
- **SQ-17**: JSON unmarshal error fallback to `nil` at `store.go` lines 206-208 confirmed. Volt defaults at `db.ts` line 427 (`DEFAULT '[]'`) and line 149 (`z.array(z.string()).default([])`) confirmed.
- **SQ-18**: FTS5 JOIN on rowid confirmed correct for content-sync FTS5 tables. Migration at lines 75-78 confirms `content=lcm_summaries, content_rowid=rowid`.
- **SQ-19**: Naming convention divergence accurately described.
- **SQ-20**: Atomicity difference accurately described. Volt transaction at `db.ts` lines 720-769. Crush `AppendContextItem` at `store.go` lines 76-90 and `lcm.sql` lines 33-37 confirmed.
