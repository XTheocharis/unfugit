# LCM Audit: Integration, Retrieval, Large Files & Test Coverage

## Volt (TypeScript/PostgreSQL) vs Crush (Go/SQLite)

---

## Summary Table

| ID | Severity | Category | Finding |
|----|----------|----------|---------|
| IT-1 | **HIGH** | Token Estimation | `EstimateTokenCount` uses `len([]rune(content))/4` (runes) vs Volt's `Math.ceil(content.length/4)` (UTF-16 code units, rounded up); yields different results for non-ASCII text and also differs by rounding (see IT-2) |
| IT-2 | **HIGH** | Token Estimation | `EstimateTokenCount` uses integer division (truncates) vs Volt's `Math.ceil` (rounds up); every non-empty string is under-counted by up to 1 token |
| IT-3 | **HIGH** | Token Estimation | `EstimateTokenCountFromBytes` uses integer division on int64 vs Volt's `BigInt(Math.ceil(fileSize/4))`; diverges for all file sizes not divisible by 4 |
| IT-4 | **HIGH** | File ID Generation | `GenerateFileIDFromPath` hashes with pipe `\|` separator and `mtime.Unix()` (seconds) vs Volt's colon `:` separator and `mtime.getTime()` (milliseconds); additionally Crush uses `sessionID` (string) vs Volt's `conversationId` (number); every file ID will differ |
| IT-5 | **HIGH** | Coordinator | `AfterMessageAppended` does not pass message role/content/tokenCount to Store; relies on Store already having the message but only passes ID for context-item append |
| IT-6 | **MEDIUM** | Coordinator | Background compaction goroutine reads result from channel but discards it after logging; Volt's `scheduleCompaction` returns the Promise so callers can await/inspect |
| IT-7 | **MEDIUM** | Coordinator | No in-flight compaction deduplication in `AfterMessageAppended` -- calls `ScheduleCompaction` every time threshold is exceeded; `CompactionManager` handles dedup but integration creates a new `Compactor` each call |
| IT-8 | **MEDIUM** | Context Retrieval | `GetFormattedContext` does not add formatting overhead to `GetContextTokenCount`; the token count used for threshold checks excludes summary header overhead |
| IT-9 | **MEDIUM** | Expansion | Crush's `ExpandSummary` uses application-level recursive expansion with cycle detection; Volt uses a single recursive CTE SQL query (`WITH RECURSIVE walk`) -- functionally equivalent but N+1 query risk in Crush |
| IT-10 | **MEDIUM** | Expansion | Crush's `ExpandSummary` returns `nil` messages for a leaf summary with no linked messages and no parents, treating it as "corrupt data"; Volt's CTE silently returns an empty set |
| IT-11 | **MEDIUM** | Search | Crush FTS5 search wraps query in double quotes for safety (`"query"`); Volt uses PostgreSQL `plainto_tsquery('english', query)` with English stemming -- different search semantics |
| IT-12 | **MEDIUM** | Search | Crush `SearchSummaries` joins FTS table via `rowid` but lacks ordering; Volt orders by `created_at DESC` -- results may be in non-deterministic order |
| IT-13 | **MEDIUM** | Large File | `CheckAndStoreLargeFile` threshold logic is functionally equivalent to Volt's `isLargeFile` (both use `>` semantics for byte and token thresholds), but Crush uses `EstimateTokenCountFromBytes(fileSize)` (bytes/4, truncated) for the token check, while Volt uses `estimateTokenCount(content)` (content.length/4, rounded up) -- diverges due to IT-1/IT-2/IT-3 |
| IT-14 | **MEDIUM** | Large File Format | `FormatLargeFileForContext` uses `[Large File Stored: ...]` format; Volt's `LargeFile.formatForContext` uses `[Large File ID: ...]` format -- neither system's `extractFileIds` regex matches Volt's `[Large File ID: ...]` marker, creating a silent extraction gap in Volt itself that Crush does not replicate |
| IT-15 | **LOW** | Large File Format | Crush's `FormatLargeFileForContext` omits the `"(File content stored externally - use file ID to retrieve)"` hint line that Volt includes |
| IT-16 | **HIGH** | Compaction | Crush's compaction target is `softThreshold * 75 / 100` (target to compact TO); Volt compacts until `overSoft` is false (i.e., `currentTokens <= softThreshold`) -- Crush over-compacts |
| IT-17 | **MEDIUM** | Compaction | Crush `CompactContext` progress check ignores errors from `GetContextTokenCount` (assigned to `_`); a DB error would cause false "no progress" and premature abort |
| IT-18 | **HIGH** | Test Coverage | No SQLite integration tests -- all tests use mock interfaces; Store, replace, and FTS5 query correctness are never verified against a real database |
| IT-19 | **HIGH** | Test Parity | Volt tests `extractFileIds` with 8 scenarios (patterns, dedup, sorting, malformed IDs, empty input, plural block); Crush has zero `extractFileIDs` tests |
| IT-20 | **HIGH** | Test Parity | Volt tests `isOverThreshold` math, `MAX_COMPACTION_ROUNDS`, and condenseFallback convergence; Crush does not test compaction loop, convergence guarantees, or compaction round limits |
| IT-21 | **MEDIUM** | Test Parity | Volt tests summarize/condense fallback produces output bounded at ~512 tokens regardless of input; Crush test `TestFallbackUsesRuneTruncation` only checks for rune-splitting, not bounded output size |
| IT-22 | **LOW** | Dead Code | `EventBus` interface defined in `types.go` line 117-119 but never implemented or used outside `CompactionManager`; `CompactionManager` accepts it but only calls `Publish` optionally |
| IT-23 | **MEDIUM** | Error Handling | `AfterMessageAppended` propagates `AppendContextItem` and `GetContextTokenCount` errors, but swallows compaction errors (logged in goroutine, never returned) |
| IT-24 | **MEDIUM** | Soft Threshold | Crush `ComputeTokenBudget` calculates `softRaw = contextWindow * 60 / 100` (integer math); Volt uses `Math.floor(contextWindow * 0.6)` -- identical for most values but integer overflow risk for contextWindow > 3.5B |
| IT-25 | **LOW** | Reserve Calculation | Crush uses `min(20_000, contextWindow/4)` for reserve; Volt does not have an explicit reserve function in `isOverThreshold` -- it receives `reserve` as a parameter, computed externally |
| IT-26 | **MEDIUM** | Exploration System | Volt has a comprehensive `ExploreDispatcher` with 30+ file-type explorers; Crush has no exploration/analysis system for large files at all |
| IT-27 | **MEDIUM** | Large File Content | Volt's `getLargeFileContent` has a hard 100MB safety cap and handles legacy inline content; Crush's `GetLargeFileContent` has no default cap when `maxBytes` is 0 (reads entire file into memory) |
| IT-28 | **LOW** | Large File Content | Crush `GetLargeFileContent` uses `io.ReadFull` which will fail with `io.ErrUnexpectedEOF` on files whose actual size < buffer size due to concurrent truncation; handled but imprecise |
| IT-29 | **HIGH** | Test Coverage | No tests for `AfterMessageAppended`, `GetContext`, `Expand`, or `Search` at the integration layer (`integration.go`); these are the primary API surface |
| IT-30 | **MEDIUM** | Test Coverage | No tests for `CompactionManager.ScheduleCompaction` (goroutine lifecycle, channel behavior, dedup logic, `context.WithoutCancel`) |
| IT-31 | **MEDIUM** | Test Coverage | Crush has no tests for `ReplacePositionsWithSummary` (the SQL transaction logic in `replace.go`); Volt DOES test this via integration tests in `context.test.ts` (lines 347-391, 537-541) using a real PostgreSQL database |
| IT-32 | **LOW** | Test Coverage | No tests for `GenerateFileIDFromPath` determinism or `CheckAndStoreLargeFile` threshold logic |
| IT-33 | **MEDIUM** | Test Accuracy | `TestIsLargeFile` "at byte threshold" case uses `size=100_000` and expects `false`; this is correct (Volt uses `>` not `>=`), but does not test the token-threshold-only path (content with high byte count but low rune count) |
| IT-34 | **LOW** | Test Accuracy | `TestEstimateTokenCount` "unicode" case expects `EstimateTokenCount("こんにちは世界") = 1`; 7 runes / 4 = 1 (integer division), but Volt would give `ceil(7/4) = 2` because `"こんにちは世界".length` = 7 UTF-16 code units (BMP chars) and Math.ceil rounds up -- test validates Crush behavior that diverges from Volt due to IT-2 (truncation vs ceiling) |
| IT-35 | **MEDIUM** | Null Handling | Volt's `LcmDb` escapes null bytes in content (`escNull`); Crush has no equivalent -- null bytes in message content will be stored in SQLite and may cause issues in FTS5 indexing |
| IT-36 | **LOW** | Concurrency | Volt uses PostgreSQL `FOR UPDATE` row lock for serialized message appends; Crush relies on SQLite's file-level locking -- adequate for single-process but different concurrency model |
| IT-37 | **MEDIUM** | File ID Ordering | Crush's `extractFileIDs` returns file IDs in appearance order (unsorted); Volt's `extractFileIds` returns `[...ids].sort()` -- ordering divergence in summary content |
| IT-38 | **HIGH** | Summary ID Generation | Crush's `generateSummaryID` hashes message metadata (`createdAt\|role\|content`); Volt's `Summary.generateId` hashes `content + timestamp` -- completely different ID schemes, no cross-system ID compatibility |
| IT-39 | **MEDIUM** | Summary ID Collision | Crush's `generateSummaryID` produces the same ID for normal and aggressive summarization of the same messages (hashes message metadata, not output); Volt's content-based IDs always differ when output differs |
| IT-40 | **LOW** | Fallback Truncation Budget | Crush's fallback reserves 100 tokens for metadata (`FallbackMetadataReserve`), truncating to `(512-100)*4 = 1648` chars; Volt's fallback uses full `512*4 = 2048` chars with no metadata reserve |
| IT-41 | **MEDIUM** | Regex Pattern Divergence | Crush's `extractFileIDs` pattern 3 matches `\[LCM File ID: ...\]` (with brackets); Volt's `extractFileIds` pattern 3 matches `LCM File ID: ...` (without brackets) -- file IDs formatted by one system's fallback may not be extractable by the other |

---

## Detailed Findings

### IT-1: Token Estimation Uses Runes Instead of String Length [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/large-file-threshold.ts`, lines 53-55):
```typescript
export function estimateTokenCount(content: string): number {
    return Math.ceil(content.length / CHARS_PER_TOKEN)
}
```
`content.length` in JavaScript returns the count of UTF-16 code units. For ASCII text, this equals the byte count. For characters outside the Basic Multilingual Plane (e.g., emoji), a single character is 2 code units (surrogate pair). CJK characters in the BMP are 1 code unit each, same as their rune count.

**Crush** (`/tmp/crush/internal/lcm/config.go`, lines 47-52):
```go
func EstimateTokenCount(content string) int {
    if content == "" {
        return 0
    }
    return len([]rune(content)) / CharsPerToken
}
```
`len([]rune(content))` counts Unicode code points (runes). This differs from UTF-16 code units for characters outside the Basic Multilingual Plane (e.g., emoji like `U+1F44B` is 1 rune but 2 UTF-16 code units).

**Impact**: For CJK text like `"こんにちは世界"` (7 runes, 21 bytes, 7 UTF-16 code units), Volt yields `ceil(7/4) = 2`, Crush yields `7/4 = 1`. For emoji like `"👋🌍🎉🎊"` (4 runes, 16 bytes, 8 UTF-16 code units), Volt yields `ceil(8/4) = 2`, Crush yields `4/4 = 1`. This divergence affects threshold detection and token budget calculations for any non-ASCII content.

---

### IT-2: Token Estimation Truncates Instead of Rounding Up [HIGH]

**Volt** uses `Math.ceil(content.length / CHARS_PER_TOKEN)` -- rounding up guarantees that even 1 character counts as at least 1 token.

**Crush** uses integer division `len([]rune(content)) / CharsPerToken` -- this truncates toward zero. A string of 1-3 runes yields 0 tokens. A string of 5-7 runes yields 1 token instead of 2.

**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/large-file-threshold.ts`, line 54
- Crush: `/tmp/crush/internal/lcm/config.go`, line 51

**Impact**: Every non-empty string shorter than 4 runes has an estimated token count of 0 in Crush but >= 1 in Volt. This accumulates across many messages and can cause the context token count to be systematically under-reported, delaying compaction triggers.

---

### IT-3: Byte-to-Token Estimation Truncates [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 1774):
```typescript
const tokenCount = BigInt(Math.ceil(fileSize / 4))
```

**Crush** (`/tmp/crush/internal/lcm/config.go`, lines 55-57):
```go
func EstimateTokenCountFromBytes(byteLen int64) int64 {
    return byteLen / CharsPerToken
}
```

Go integer division truncates; Volt rounds up. For a file of 101 bytes: Volt = 26 tokens, Crush = 25 tokens. The difference is small per-file but compounds.

---

### IT-4: File ID Generation Hash Input Differs [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1643-1645):
```typescript
hash.update(`${conversationId}:${filePath}:${fileSize}:${mtime.getTime()}`)
```
- Separator: `:` (colon)
- mtime: milliseconds since epoch (`Date.getTime()`)

**Crush** (`/tmp/crush/internal/lcm/largefile.go`, lines 75-80):
```go
fmt.Fprintf(h, "%s|%s|%d|%d", sessionID, filePath, fileSize, mtime.Unix())
```
- Separator: `|` (pipe)
- mtime: seconds since epoch (`time.Time.Unix()`)
- Uses `sessionID` (string) instead of `conversationId` (number)

**Impact**: Every file ID generated by Crush will differ from what Volt would generate for the same file. This means:
1. No cross-system deduplication is possible
2. If Crush is ever queried for a Volt-generated file ID, it will not find it

---

### IT-5: AfterMessageAppended Assumes Pre-existing Message [HIGH]

**Crush** (`/tmp/crush/internal/lcm/integration.go`, lines 18-48):
```go
func (l *LCM) AfterMessageAppended(
    ctx context.Context, sessionID string, messageID string,
) error {
    if err := l.Store.AppendContextItem(ctx, sessionID, "message", &messageID, nil); err != nil {
        return err
    }
    // ...
}
```

Crush's `AfterMessageAppended` only appends a context item reference. It assumes the message itself (with role, content, token_count) was already inserted into the messages table by the caller.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 720-769): `appendMessage` inserts the message AND the context item in a single transaction with `FOR UPDATE` locking on the conversation row.

**Impact**: Crush splits message insertion and context-item creation into separate, non-transactional operations. If the process crashes between message insert and `AfterMessageAppended`, the message exists but has no context item. This is a consistency gap.

---

### IT-6: Background Compaction Result Discarded [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/integration.go`, lines 40-46):
```go
go func() {
    result, ok := <-ch
    if ok && result.Error != nil {
        log.Printf("Background compaction error for %s: %v", sessionID, result.Error)
    }
}()
```

The goroutine reads the result channel and logs errors but never propagates the result back to the caller. The `AfterMessageAppended` method returns `nil` even if compaction fails.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 717-761): `scheduleCompaction` returns the Promise itself, allowing callers to await the compaction result or check it later. The in-flight compaction map also stores the Promise for deduplication.

---

### IT-7: New Compactor Created Per Trigger [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/integration.go`, line 37):
```go
compactor := NewCompactor(l.Store, l.Summarizer)
```

A new `Compactor` is created every time the threshold is exceeded, even though the `CompactionManager` handles dedup. This is wasteful but not incorrect due to `CompactionManager.LoadOrStore`. However, the `Compactor` is allocated and passed even when dedup rejects the request.

---

### IT-8: Context Token Count Excludes Summary Formatting Overhead [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/store.go`, lines 60-70):
```go
func (s *SQLiteStore) GetContextTokenCount(ctx context.Context, sessionID string) (int, error) {
    result, err := s.q.LCMGetContextTokenCount(ctx, sessionID)
    // ...
}
```

The SQL query `LCMGetContextTokenCount` sums raw token counts from the database. It does NOT add summary formatting overhead (the `[Summary ID: ...]` and `[Parent Summaries: ...]` headers).

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1003-1038): `getContextTokenCount` explicitly adds `getSummaryFormattingOverhead` for each summary entry.

**Impact**: Crush under-reports context size, causing compaction to trigger later than it should. The formatting overhead per summary is approximately `ceil(30/4) = 8` tokens minimum, and can be more with parent IDs.

---

### IT-9: Expansion Uses N+1 Queries [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/retrieval.go`, lines 10-54): `ExpandSummary` recursively calls `store.ExpandSummaryToMessages` and `store.GetSummaryParentIDs` for each node in the DAG, resulting in O(N) queries where N is the number of DAG nodes.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1368-1399): Uses a single `WITH RECURSIVE walk` CTE that traverses the entire DAG in one query.

**Impact**: For deep DAGs, Crush will issue many sequential database queries. For SQLite (single-process, file-level lock), this is less of a performance concern than it would be for PostgreSQL, but it is still less efficient.

---

### IT-10: Expansion Error on Empty Leaf Summaries [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/retrieval.go`, lines 41-43):
```go
if len(parentIDs) == 0 {
    return nil, fmt.Errorf("summary %s has no messages and no parents — data may be corrupt", summaryID)
}
```

If a summary has neither linked messages nor parent summaries, Crush returns a hard error. Volt's single CTE query would simply return an empty result set without erroring.

**Impact**: Orphaned summaries (e.g., from a crash during insert) cause Crush to return an error on expansion, while Volt would silently return nothing.

---

### IT-11: FTS Search Semantics Differ [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/store.go`, lines 309):
```go
safe := "\"" + strings.ReplaceAll(query, "\"", " ") + "\""
```
Wraps the query in double quotes for FTS5 phrase matching. This means `hello world` becomes `"hello world"` -- a phrase search requiring the words to be adjacent.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 1414):
```sql
content_tsv @@ plainto_tsquery('english', ${query})
```
Uses PostgreSQL's `plainto_tsquery` which tokenizes and stems words, matching them independently (AND logic by default). `hello world` matches documents containing both words anywhere, with English stemming applied.

**Impact**: Search behavior differs significantly. Crush requires exact phrase adjacency; Volt matches individual stemmed words anywhere in content.

---

### IT-12: Search Results Lack Ordering [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/store.go`, lines 311-317):
```sql
SELECT s.summary_id, s.session_id, s.kind, s.content, s.token_count, s.file_ids
FROM lcm_summaries_fts fts
JOIN lcm_summaries s ON s.rowid = fts.rowid
WHERE lcm_summaries_fts MATCH ?
AND s.session_id = ?
LIMIT ?
```
No `ORDER BY` clause. Results come in FTS5 internal order (typically insertion order).

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, line 1435):
```sql
ORDER BY created_at DESC
```
Volt orders results by recency (newest first).

---

### IT-14: Large File Context Marker Format Mismatch [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/format.go`, lines 96-99):
```go
func FormatLargeFileForContext(f *LargeFile) string {
    return fmt.Sprintf("[Large File Stored: %s]\n[Path: %s]\n[Type: %s]\n[Tokens: %d]",
        f.FileID, f.OriginalPath, f.MimeType, f.TokenCount)
}
```

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/large-file.ts`, line 152):
```typescript
lines.push(`[Large File ID: ${file.fileId}]`)
```

Crush uses `[Large File Stored: ...]` while Volt uses `[Large File ID: ...]`. There are three important nuances:

1. **Both systems' `extractFileIds` regexes match `[Large File Stored: ...]`** (Crush's pattern 1), so Crush's format IS extractable by both systems.
2. **Volt's `[Large File ID: ...]` is NOT matched by either system's regex.** Volt's regex has `LCM File ID:` (no brackets, different prefix than `Large File ID`), and Crush's regex has `\[LCM File ID:\s*...\]` (brackets, but `LCM` prefix, not `Large`). Neither matches `[Large File ID: ...]`. This is a latent bug in Volt itself.
3. **The two systems' regexes differ in pattern 3**: Volt matches bare `LCM File ID: file_xxx` (no brackets), while Crush matches `[LCM File ID: file_xxx]` (with brackets). This means `LCM File ID:` lines without brackets are extractable in Volt but not Crush, and `[LCM File ID: ...]` lines with brackets are extractable in Crush but not Volt.

**Severity upgraded from LOW to MEDIUM** because the regex divergence between the two systems means file IDs formatted in one system's style may not be extractable by the other, and Volt has a latent self-inconsistency.

---

### IT-15: Large File Format Missing Retrieval Hint [LOW]

**Crush** format does not include the hint line `"(File content stored externally - use file ID to retrieve)"` that Volt includes. This is a minor UX difference for the LLM.

---

### IT-16: Compaction Target Diverges from Volt [HIGH]

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, line 33):
```go
target := budget.SoftThreshold * (100 - TargetFreePercent) / 100
```
With `TargetFreePercent=25`, this computes `target = softThreshold * 75 / 100`. Compaction continues until `currentTokens <= target`, which is 75% of the soft threshold.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 486-508): The `onContextThresholdReached` function does one round of summarization, then checks `isOverThreshold` (checking `overSoft`). It only continues to condense if still over the soft threshold. There is no 75% target -- Volt aims to get below `softThreshold`, not 75% of it.

**Impact**: Crush over-compacts by continuing until 25% below the soft threshold. This causes more aggressive summarization than Volt, potentially losing more context detail.

**Note**: Volt's `compactUntilUnderLimit` (for hard-limit compaction) does use a looping approach similar to Crush, but the normal path (`onContextThresholdReached`) does not use `TargetFreePercent`.

---

### IT-17: Compaction Progress Check Ignores DB Error [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, line 61):
```go
newTokenCount, _ := c.store.GetContextTokenCount(ctx, sessionID)
```

The error from `GetContextTokenCount` is discarded. If the database query fails, `newTokenCount` will be 0, which is less than `lastTokenCount`, so compaction appears to have made progress and exits successfully -- but the context is still over threshold.

---

### IT-18: No SQLite Integration Tests [HIGH]

**File**: `/tmp/crush/internal/lcm/lcm_test.go`

All tests in Crush use mock interfaces (`mockLLMClient`). There are no tests that:
1. Create a real SQLite database
2. Insert messages, summaries, and context items
3. Verify `ReplacePositionsWithSummary` transaction correctness
4. Verify FTS5 search works correctly
5. Verify `GetContextTokenCount` SQL accuracy
6. Test the full compaction pipeline end-to-end

**Risk**: Any SQL bugs in the sqlc-generated queries, the FTS5 virtual table setup, or the `replace.go` transaction logic are completely undetected.

---

### IT-19: extractFileIDs Has Zero Test Coverage [HIGH]

**Volt** tests (`/tmp/volt/packages/voltcode/test/session/lcm/compaction-redesign.test.ts`, lines 11-101):
- 8 test cases covering all 4 regex patterns
- Deduplication
- Sorting
- Empty input
- Malformed IDs

**Crush**: The `extractFileIDs` function in `/tmp/crush/internal/lcm/format.go` (lines 117-130) has no dedicated tests. The `TestFallbackFileIDsExtractable` test indirectly verifies that file IDs appear in fallback output, but does not test the extraction function itself with edge cases.

---

### IT-20: No Compaction Loop or Convergence Tests [HIGH]

**Volt** tests (`/tmp/volt/packages/voltcode/test/session/lcm/compaction-redesign.test.ts`, lines 104-186):
- `summarizeFallback convergence`: Verifies fallback truncation produces fewer tokens
- `condenseFallback convergence`: Verifies condensation of N summaries converges
- `isOverThreshold math`: Verifies threshold arithmetic
- `MAX_COMPACTION_ROUNDS is 10`: Verifies constant

**Crush** has no equivalent tests for:
- `Compactor.CompactContext` loop behavior
- Convergence guarantee (each round reduces tokens)
- `MaxCompactionRounds` limit
- Progress check correctness

---

### IT-21: Fallback Test Checks Rune Splitting, Not Size Bound [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/lcm_test.go`, lines 142-165):
```go
func TestFallbackUsesRuneTruncation(t *testing.T) {
    // ...
    for i, r := range summary.Content {
        if r == '\ufffd' {
            t.Errorf("replacement character at index %d — rune was split", i)
        }
    }
}
```

This test only verifies that multi-byte characters are not split during truncation. It does NOT verify that:
1. The fallback output is bounded to ~`FallbackMaxTokens` tokens
2. The output is strictly smaller than the input
3. The metadata block is properly appended

**Volt** tests verify both the bounded-size property AND that output < input.

---

### IT-22: EventBus Interface is Dead Code [LOW]

**File**: `/tmp/crush/internal/lcm/types.go`, lines 117-119:
```go
type EventBus interface {
    Publish(event string, data any)
}
```

This interface is defined and accepted by `CompactionManager` (`/tmp/crush/internal/lcm/manager.go`, line 18), but:
1. No concrete implementation exists in the codebase
2. `CompactionManager` checks `cm.eventBus != nil` before calling (line 60), so it is always a no-op when `nil` is passed
3. Volt uses a robust `Bus.publish(Event.CompactionStarted, ...)` and `Bus.publish(Event.CompactionEnded, ...)` event system with schema validation

The Volt event system publishes `compaction.started` (with blocking flag and timing) and `compaction.ended` events. Crush only publishes a single `compaction.complete` event (if eventBus is non-nil).

---

### IT-23: Compaction Errors Swallowed in Integration [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/integration.go`, lines 40-46):
```go
go func() {
    result, ok := <-ch
    if ok && result.Error != nil {
        log.Printf("Background compaction error for %s: %v", sessionID, result.Error)
    }
}()
```

Errors from compaction are logged but never surfaced to the caller. `AfterMessageAppended` returns `nil` immediately after scheduling compaction.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, line 749):
```typescript
log.warn("async compaction failed", { conversationId: input.conversationId, error })
```
Volt also logs and swallows, but returns the Promise so callers CAN check the result. Additionally, Volt publishes `CompactionEnded` events regardless of success/failure, and tracks compaction state (`setCompactionState`/`clearCompactionState`) for observability.

---

### IT-24: Soft Threshold Integer Math [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/config.go`, line 90):
```go
softRaw := contextWindow * DefaultCtxCutoffPercent / 100
```

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, line 196):
```typescript
const softRaw = (input.softThresholdOverride ?? Math.floor(input.contextWindow * 0.6)) - input.overhead
```

Both produce the same result for typical context window sizes (up to ~3.5 billion). However, Crush's integer multiplication `contextWindow * 60` could overflow `int` on 32-bit systems. In Go, `int` is platform-dependent (32 or 64 bit). On a 64-bit system this is not an issue, but the code is less safe than Volt's floating-point approach.

---

### IT-26: No File Exploration System [MEDIUM]

**Volt** has a comprehensive `ExploreDispatcher` (`/tmp/volt/packages/voltcode/src/session/lcm/explore/dispatcher.ts`) with 30+ specialized file explorers (Python, Go, Rust, TypeScript, JSON, CSV, YAML, SQLite, PDF, images, executables, etc.). After a large file is stored, Volt can analyze it and produce a structured summary stored in `exploration_summary` and `explorer_used` columns.

**Crush** has no equivalent. The `LargeFile` type has no exploration summary fields. Large files are stored as path references with no analysis.

**Impact**: In Crush, the LLM has no information about the content of large files beyond the filename, MIME type, and token count. In Volt, the LLM receives a structured exploration summary that helps it understand the file's contents.

---

### IT-27: No Default Safety Cap on Large File Read [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/largefile.go`, lines 42-72):
```go
func GetLargeFileContent(originalPath string, maxBytes int64) (*LargeFileContent, error) {
    // ...
    if maxBytes > 0 && totalSize > maxBytes {
        bytesToRead = maxBytes
        truncated = true
    }
    buffer := make([]byte, bytesToRead)
    // ...
}
```

When `maxBytes` is 0 (or negative), the entire file is read into memory with no upper bound.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 1954):
```typescript
const safeMax = Math.min(maxBytes ?? 100 * 1024 * 1024, 100 * 1024 * 1024)
```
Volt caps at 100MB regardless of the requested maxBytes.

**Impact**: A malicious or accidental call to `GetLargeFileContent(path, 0)` on a 28GB file would attempt to allocate 28GB of memory, likely crashing the process.

---

### IT-29: No Integration Layer Tests [HIGH]

The functions in `/tmp/crush/internal/lcm/integration.go` -- `AfterMessageAppended`, `GetContext`, `Expand`, and `Search` -- have zero test coverage. These are the primary API surface that the agent loop calls.

What is untested:
- `AfterMessageAppended`: context item append + threshold check + compaction scheduling
- `GetContext`: delegation to `GetFormattedContext` with store
- `Expand`: delegation to `ExpandSummary` with store
- `Search`: delegation to `SearchSummaries` with store

---

### IT-30: No CompactionManager Tests [MEDIUM]

`CompactionManager` in `/tmp/crush/internal/lcm/manager.go` has no tests for:
1. Deduplication via `sync.Map.LoadOrStore` (only one compaction per session)
2. `context.WithoutCancel` usage (compaction survives parent context cancellation)
3. Channel close semantics (result channel closed after compaction completes)
4. `EventBus.Publish` call timing
5. Error propagation to result channel

---

### IT-31: Crush Has No ReplacePositionsWithSummary Tests [MEDIUM]

`ReplacePositionsWithSummary` in `/tmp/crush/internal/lcm/replace.go` implements a complex delete-all/rebuild transaction pattern. Untested scenarios in Crush:
1. Non-contiguous positions (e.g., positions [0, 2, 4] with messages at [1, 3])
2. Single-position replacement
3. Empty positions list
4. Concurrent modifications during rebuild
5. Correct position renumbering after rebuild

**Correction**: The original audit stated "neither has dedicated tests." This is incorrect for Volt. Volt's `context.test.ts` (lines 347-391) tests `replacePositionsWithSummary` via `replaceContextWithSummary` against a real PostgreSQL database, including non-contiguous position scenarios and multi-round summarization/condensation cycles (lines 433-564) that exercise `replacePositionsWithSummary` at line 537. Only Crush lacks tests for this critical operation.

---

### IT-33: IsLargeFile Test Missing Token-Only Path [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/lcm_test.go`, lines 37-58):

The `TestIsLargeFile` test only varies `size` (byte length) using `strings.Repeat("a", tt.size)` -- ASCII characters where byte length equals rune count. It does not test the scenario where:
- Byte count is below `DefaultByteThreshold` (100,000)
- But estimated token count (runes/4) exceeds `DefaultTokenThreshold` (25,000)

For ASCII, this is impossible since bytes=runes, so `100_000/4 = 25_000` which equals the threshold (not exceeds). But for multi-byte content, this path can differ. The test should include a case with high-rune-count, low-byte-count content if such a scenario is relevant.

---

### IT-34: Unicode Token Test Validates Incorrect Behavior [LOW]

**Crush** (`/tmp/crush/internal/lcm/lcm_test.go`, lines 25-26):
```go
{"unicode", "こんにちは世界", 1},
{"emoji", "👋🌍🎉🎊", 1},
```

For `"こんにちは世界"` (7 runes, 7 UTF-16 code units since all are BMP characters), Crush computes `7/4 = 1` (integer division).
Volt would compute `ceil(7/4) = 2` (since JS `"こんにちは世界".length` = 7 and `Math.ceil(7/4) = 2`).
**Note**: The original audit incorrectly stated Volt would give `ceil(21/4) = 6`, confusing byte count (21) with UTF-16 code unit count (7). These BMP characters are 1 UTF-16 code unit each despite being 3 bytes in UTF-8.

For `"👋🌍🎉🎊"` (4 runes, but 8 UTF-16 code units due to surrogate pairs):
- Crush: `4/4 = 1`
- Volt: `ceil(8/4) = 2`

The test asserts the Crush-specific behavior, which diverges from Volt. This is technically correct as a unit test (it validates what Crush does), but it masks the Volt divergence.

---

### IT-35: No Null Byte Escaping [MEDIUM]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/db.ts`, lines 20-21):
```typescript
const escNull = (s: string) => s.replaceAll("\0", "\\x00")
```
PostgreSQL text columns reject null bytes, so Volt escapes them before insertion.

**Crush** has no equivalent. SQLite does accept null bytes in TEXT columns, but FTS5 may not index them correctly, and some string operations in Go may terminate at null bytes when interfacing with C libraries (via CGo/SQLite).

---

### IT-36: Concurrency Model Difference [LOW]

**Volt** uses PostgreSQL `FOR UPDATE` row-level locking for serialized message appends within transactions. This supports concurrent multi-process access.

**Crush** relies on SQLite's WAL mode file-level locking. This is adequate for the single-process CLI use case but would not support multi-process concurrent access to the same database.

---

### IT-37: extractFileIDs Does Not Sort Results [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/format.go`, lines 117-130):
```go
func extractFileIDs(content string) []string {
    matches := fileIDPattern.FindAllStringSubmatch(content, -1)
    seen := make(map[string]bool)
    var fileIDs []string
    for _, match := range matches {
        for i := 1; i < len(match); i++ {
            if match[i] != "" && !seen[match[i]] {
                seen[match[i]] = true
                fileIDs = append(fileIDs, match[i])
            }
        }
    }
    return fileIDs
}
```
Returns file IDs in order of first appearance, unsorted.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, line 253):
```typescript
return [...ids].sort()
```
Returns a sorted, deduplicated array.

**Impact**: File ID blocks appended to summaries (e.g., `[LCM File IDs: file_aaa, file_bbb]`) will have non-deterministic ordering in Crush but deterministic (sorted) ordering in Volt. This affects summary content hashing and comparability.

---

### IT-38: Summary ID Generation Algorithm Differs Completely [HIGH]

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 266-273):
```go
func generateSummaryID(messages []LCMMessage) string {
    h := sha256.New()
    for _, msg := range messages {
        fmt.Fprintf(h, "%d|%s|%s", msg.CreatedAt, msg.Role, msg.Content)
    }
    hash := hex.EncodeToString(h.Sum(nil))
    return SummaryIDPrefix + hash[:SummaryIDLength]
}
```
Hashes message *metadata* (createdAt, role, content) with pipe separators. The summary ID is deterministic based on input messages, not on the summary output.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summary.ts`, lines 117-124):
```typescript
export function generateId(content: string, timestamp?: number): string {
    const ts = timestamp ?? Date.now()
    const hash = createHash("sha256")
      .update(content + ts.toString())
      .digest("hex")
      .slice(0, 16)
    return `sum_${hash}`
}
```
Hashes summary *output content* + timestamp. The ID is deterministic for the same content at the same time.

**Impact**: Summary IDs are completely incompatible between systems. Crush's approach means the same messages always produce the same summary ID regardless of output, while Volt's approach means the ID changes when content changes. Neither approach allows cross-system ID lookup.

---

### IT-39: Same Summary ID for Different Escalation Levels [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 78, 102):
Both `summarizeNormal` (line 78) and `summarizeAggressive` (line 102) call `generateSummaryID(messages)` using the same input messages. This means the summary ID is identical regardless of which escalation level produced the output:

```go
// In summarizeNormal (line 78):
SummaryID: generateSummaryID(messages),
// In summarizeAggressive (line 102):
SummaryID: generateSummaryID(messages),
```

**Volt** uses content-based IDs (`Summary.generateId(finalContent, timestamp)`), so different summarization outputs automatically get different IDs.

**Impact**: If the database has `ON CONFLICT DO NOTHING` for summary inserts, re-summarizing the same messages at a different escalation level would silently skip the insert, leaving the first (potentially larger) summary in place. This could interfere with the escalation guarantee.

---

### IT-40: Fallback Truncation Budget Differs [LOW]

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, line 114):
```go
maxRunes := (FallbackMaxTokens - FallbackMetadataReserve) * CharsPerToken
// = (512 - 100) * 4 = 1648 runes
```
Reserves 100 tokens (400 chars) for metadata appended after truncation.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, line 406):
```typescript
const maxChars = FALLBACK_MAX_TOKENS * 4
// = 512 * 4 = 2048 chars
```
Uses the full 512-token budget for content, with metadata added on top.

**Impact**: Crush's fallback retains ~80% of the content that Volt's fallback retains (1648 vs 2048 chars). The Crush approach is arguably more correct since it accounts for metadata overhead in the budget, but it produces slightly shorter summaries.

---

### IT-41: File ID Regex Pattern 3 Bracket Mismatch [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/format.go`, line 112):
```go
`\[LCM File ID:\s*(file_[0-9a-f]{16})\]`
```
Pattern 3 requires surrounding square brackets: `[LCM File ID: file_xxx]`.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, line 231):
```typescript
/LCM File ID:\s*(file_[0-9a-f]{16})/
```
Pattern 3 does NOT require brackets: `LCM File ID: file_xxx`.

**Impact**: Crush's fallback output (line 124) emits `[LCM File ID: file_xxx]` (with brackets), which is matched by Crush's own regex but NOT by Volt's regex. Conversely, bare `LCM File ID: file_xxx` lines (used in Volt's test patterns) are matched by Volt's regex but NOT by Crush's regex. This means file IDs in fallback summaries generated by one system may not be re-extractable when processed by the other system's condensation pipeline.

---

## Test Coverage Gap Summary

### What Crush Tests

| Test | File | What It Verifies |
|------|------|-----------------|
| `TestEstimateTokenCount` | `lcm_test.go:14` | Basic token estimation for empty, short, exact, longer, unicode, emoji |
| `TestIsLargeFile` | `lcm_test.go:37` | Byte threshold comparison with ASCII content |
| `TestComputeTokenBudget` | `lcm_test.go:60` | Budget arithmetic for 128K context window |
| `TestComputeTokenBudgetSmall` | `lcm_test.go:76` | Budget arithmetic for 8K context window |
| `TestCompactionTargetBelowSoftThreshold` | `lcm_test.go:89` | Target < softThreshold invariant |
| `TestSummarizeMessagesEscalation` | `lcm_test.go:114` | Three-level escalation with mock LLM |
| `TestFallbackUsesRuneTruncation` | `lcm_test.go:142` | No rune splitting in fallback truncation |
| `TestEnsureParentIDsPresent` | `lcm_test.go:167` | Header injection, preservation, and fix |
| `TestFallbackFileIDsExtractable` | `lcm_test.go:194` | File IDs preserved in fallback output |
| `TestFormatMessagesForSummary_*` | `lcm_test.go:242-313` | JSON wrapper parsing, tool calls, fallback |

### What Crush Does NOT Test (But Volt Does)

1. **extractFileIds** -- pattern matching, dedup, sorting, malformed IDs, empty input (Volt: 8 tests)
2. **Fallback convergence** -- output bounded at ~512 tokens, output < input (Volt: 4 tests)
3. **Condense fallback convergence** -- N summaries combined and truncated (Volt: 2 tests)
4. **isOverThreshold arithmetic** -- hardLimit, softThreshold, clamping (Volt: 3 tests)
5. **MAX_COMPACTION_ROUNDS** -- constant value (Volt: 1 test)
6. **File ID extraction from structured blocks** -- singular vs plural patterns (Volt: 3 tests)

### What Neither System Tests

1. **Concurrent compaction** scheduling and dedup
2. **Large file content retrieval** with truncation
3. **Context formatting overhead** accuracy

### What Only Volt Tests (Crush Lacks)

1. **End-to-end compaction** with a real database (Volt has PostgreSQL integration tests in `context.test.ts`)
2. **ReplacePositionsWithSummary** transaction correctness (Volt tests this at `context.test.ts:347-391` and `context.test.ts:537`)
3. **FTS search** with real database (Volt tests `searchMessages` at `context.test.ts:393-421`)
4. **Multi-round summarization and condensation** cycles (Volt tests at `context.test.ts:433-564` with 30-message and 100-message scenarios)

---

## Recommendations

1. **Critical**: Fix `EstimateTokenCount` to use `Math.ceil` equivalent: `(len([]rune(content)) + CharsPerToken - 1) / CharsPerToken` or use `math.Ceil(float64(...))`. This affects all threshold decisions.

2. **Critical**: Fix `EstimateTokenCountFromBytes` similarly to round up.

3. **Critical**: Align `GenerateFileIDFromPath` hash input format with Volt (use `:` separator and millisecond mtime) or document the intentional divergence.

4. **Critical**: Add `GetSummaryFormattingOverhead` to `GetContextTokenCount` in the SQL query or the Go wrapper.

5. **High**: Add SQLite integration tests that create a real database, insert data, and verify query results.

6. **High**: Add tests for `AfterMessageAppended`, `GetContext`, `Expand`, and `Search`.

7. **High**: Add tests for `extractFileIDs` covering all patterns, dedup, empty input, and malformed IDs.

8. **High**: Add compaction convergence tests verifying the loop terminates and makes progress.

9. **Medium**: Add a default safety cap in `GetLargeFileContent` (e.g., 100MB) when `maxBytes <= 0`.

10. **Medium**: Add `ORDER BY` to `SearchSummaries` query for deterministic results.

11. **Medium**: Handle the `GetContextTokenCount` error in `CompactContext` progress check instead of discarding it.

12. **Low**: Decide whether to implement the `EventBus` interface or remove dead code.

13. **Low**: Add null byte escaping for content before SQLite insertion if FTS5 compatibility is a concern.

14. **High**: Align summary ID generation with Volt (content-based hashing) to avoid ID collisions across escalation levels (IT-38, IT-39).

15. **Medium**: Sort the output of `extractFileIDs` for deterministic file ID ordering in appended metadata blocks (IT-37).

16. **Medium**: Align `extractFileIDs` regex pattern 3 with Volt's bracket convention, or ensure fallback output uses a format that both systems can parse (IT-41).

---

## Review Notes

This section documents the verification process and all changes made to the original audit.

### Verification Methodology

Every finding was cross-referenced against the actual source files in `/tmp/volt/packages/voltcode/src/session/lcm/` and `/tmp/crush/internal/lcm/`. File paths, line numbers, code snippets, and behavioral claims were individually verified.

### Findings Verified as Accurate (No Changes)

The following findings were verified as factually correct with accurate line numbers, code snippets, and severity ratings:

- **IT-1**: Verified. Rune vs UTF-16 code unit difference confirmed. Line numbers correct.
- **IT-2**: Verified. Integer truncation vs Math.ceil confirmed.
- **IT-3**: Verified. Line 1774 in Volt confirmed. Integer division vs BigInt(Math.ceil) confirmed.
- **IT-4**: Verified. Pipe vs colon separator, seconds vs milliseconds, sessionID vs conversationId all confirmed at cited lines.
- **IT-5**: Verified. AfterMessageAppended only appends context item, does not insert message. Volt's appendMessage at lines 720-769 confirmed.
- **IT-6**: Verified. Goroutine at lines 40-46 logs and discards. Volt returns Promise.
- **IT-7**: Verified. NewCompactor at line 37 per call confirmed.
- **IT-8**: Verified. GetContextTokenCount at store.go:60-70 uses raw SQL sum. Volt at db.ts:1003-1038 adds getSummaryFormattingOverhead.
- **IT-9**: Verified. Crush recursive expansion at retrieval.go:10-54. Volt CTE at db.ts:1368-1399.
- **IT-10**: Verified. Error at retrieval.go:41-43 for orphaned summaries.
- **IT-11**: Verified. FTS5 phrase wrapping at store.go:309. Volt plainto_tsquery at db.ts:1414.
- **IT-12**: Verified. No ORDER BY in Crush at store.go:311-317. Volt ORDER BY at db.ts:1435.
- **IT-15**: Verified. Crush omits retrieval hint line.
- **IT-16**: Verified. Target = softThreshold * 75/100 at compactor.go:33. Volt checks overSoft at context.ts:486-508.
- **IT-17**: Verified. Error discarded at compactor.go:61.
- **IT-18**: Verified. All Crush tests use mock interfaces, no real SQLite.
- **IT-19**: Verified. 8 Volt tests at compaction-redesign.test.ts:11-101. Zero Crush extractFileIDs tests.
- **IT-20**: Verified. Volt tests at compaction-redesign.test.ts:104-235. No Crush equivalents.
- **IT-21**: Verified. TestFallbackUsesRuneTruncation at lcm_test.go:142-165 only checks rune splitting.
- **IT-22**: Verified. EventBus at types.go:116-119. CompactionManager nil check at manager.go:60.
- **IT-23**: Verified. Error swallowed in goroutine at integration.go:40-46.
- **IT-24**: Verified. Integer math at config.go:90. Volt float at context.ts:196.
- **IT-25**: Verified. Crush min(20_000, contextWindow/4) at config.go:87. Volt receives reserve as parameter.
- **IT-26**: Verified. 30+ Volt explorers in explore/ directory. No Crush equivalent.
- **IT-27**: Verified. No cap when maxBytes=0 at largefile.go:56. Volt cap at db.ts:1954.
- **IT-28**: Verified. io.ReadFull at largefile.go:62.
- **IT-29**: Verified. Zero tests for integration.go functions.
- **IT-30**: Verified. Zero tests for CompactionManager in manager.go.
- **IT-32**: Verified. No tests for GenerateFileIDFromPath or CheckAndStoreLargeFile.
- **IT-33**: Verified. TestIsLargeFile at lcm_test.go:37-58 uses only ASCII.
- **IT-34**: Verified. Unicode test cases at lcm_test.go:24-25.
- **IT-35**: Verified. escNull at db.ts:20. No Crush equivalent.
- **IT-36**: Verified. Concurrency model difference is accurately described.

### Corrections Made

1. **IT-1 summary table**: Added "rounded up" to Volt's description to clarify the Math.ceil difference is a combined issue with IT-2, not just the rune/UTF-16 difference.

2. **IT-1 detail**: Corrected the description of CJK character handling. CJK characters in the BMP (like hiragana) are 1 UTF-16 code unit each, same as their rune count. The UTF-16 divergence only affects characters outside the BMP (emoji, rare CJK).

3. **IT-3 summary table**: Changed "Math.ceil(fileSize/4)" to "BigInt(Math.ceil(fileSize/4))" to match the actual Volt code at db.ts:1774.

4. **IT-4 summary table**: Added note about sessionID vs conversationId difference (was mentioned in the detail section but not the summary).

5. **IT-13 summary table**: Rewrote to correctly note that the threshold logic is functionally equivalent but diverges due to the underlying token estimation differences (IT-1/IT-2/IT-3).

6. **IT-14**: Severity upgraded from LOW to MEDIUM. The detailed analysis was substantially rewritten to correct three errors in the original:
   - Original incorrectly stated Volt's `[Large File ID: ...]` format "is matched by `LCM File ID:` pattern without brackets." This is wrong -- `Large File ID` and `LCM File ID` have different prefixes.
   - Original failed to note that Crush's regex pattern 3 uses brackets (`\[LCM File ID:\]`) while Volt's does not (`LCM File ID:`).
   - Added explicit enumeration of which patterns match which formats across both systems.

7. **IT-31**: Corrected the claim that "neither has dedicated tests." Volt DOES have integration tests for `replacePositionsWithSummary` in `context.test.ts` (lines 347-391, 537-541) using a real PostgreSQL database. Only Crush lacks tests.

8. **"What Neither System Tests" section**: Reorganized. Moved items that Volt actually tests (end-to-end compaction, replacePositionsWithSummary, FTS search, multi-round summarization) into a new "What Only Volt Tests (Crush Lacks)" section.

9. **IT-34**: Corrected factual error. The original stated Volt would give `ceil(21/4) = 6` for `"こんにちは世界"`, confusing byte count (21 UTF-8 bytes) with JavaScript's `string.length` (7 UTF-16 code units, since all are BMP characters). The correct Volt result is `ceil(7/4) = 2`. The divergence is due to IT-2 (truncation vs ceiling), not character encoding -- both systems count 7 for this particular string.

### New Findings Added

- **IT-37** [MEDIUM]: Crush's `extractFileIDs` does not sort results; Volt sorts. Ordering divergence in summary content.
- **IT-38** [HIGH]: Summary ID generation algorithm is completely different between systems. Crush hashes message metadata; Volt hashes output content + timestamp.
- **IT-39** [MEDIUM]: Crush generates the same summary ID for normal and aggressive escalation levels (input-based), creating potential ID collisions when re-summarizing.
- **IT-40** [LOW]: Crush's fallback reserves 100 tokens for metadata (truncates to 1648 chars); Volt uses full 2048 chars with metadata on top.
- **IT-41** [MEDIUM]: Crush's regex pattern 3 requires brackets; Volt's does not. Fallback file ID lines generated by one system are not extractable by the other.

### Recommendations Added

- #14: Align summary ID generation (IT-38, IT-39)
- #15: Sort extractFileIDs output (IT-37)
- #16: Align regex pattern 3 bracket convention (IT-41)
