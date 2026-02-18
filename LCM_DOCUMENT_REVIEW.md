# LCM Implementation Guide v4.0 — Error Review Report

Reviewed against: [charmbracelet/crush](https://github.com/charmbracelet/crush) and [voltropy/volt](https://github.com/voltropy/volt)

---

## Summary

The original document contained **5 critical errors** that would cause runtime failures or silent data loss, **13 significant errors** involving incorrect claims or design issues, and **12 minor issues**. The most severe finding was that the `MessagePart` struct and `FormatMessagesForSummary` function fundamentally misunderstood Crush's JSON serialization format, meaning the entire message parsing pipeline would silently produce empty output at runtime.

---

## Updated Guide Evaluation (Audit-Corrected Version)

The "Version 4.0 — Audit-Corrected" revision addresses **27 of 30 original findings** correctly. Three original issues remain unresolved, and **one new compile error** was introduced by the `Summary.TokenCount` type change.

### Resolution Summary

| Status | Count | Findings |
|--------|-------|----------|
| Correctly resolved | 27 | C1, C2, C3, C4, C5, S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, M1, M2, M3, M5, M9, M10 (type change correct but introduced N1), M12, V1, V2, O1, O2, O3 |
| Not resolved | 3 | M4, M6, M11 |
| New issue introduced | 1 | N1 (int64 vs int compile error) |

### Unresolved Issues

**M4. No Garbage Collection Strategy for Orphaned Summaries** — `lcm_summary_parents` still uses `ON DELETE RESTRICT` for `parent_summary_id`, meaning condensed parent summaries can never be deleted while they have children. Over time, the `lcm_summaries` table grows monotonically with no cleanup path. The updated guide does not address this — no GC strategy, no acknowledgment of the growth pattern, and no checklist item for it.

**M6. Timestamps Seconds vs Milliseconds Inconsistency** — Section 4 says "INTEGER for timestamps (Unix epoch)" without noting that Crush's initial migration comments say "Unix timestamp in milliseconds" while the actual code uses `strftime('%s', 'now')` (seconds). The LCM schema correctly uses seconds (matching Crush's actual behavior), but the pre-existing documentation inconsistency is inherited without comment.

**M11. Race Between Compaction Progress Check and Concurrent Message Insertion** — In `CompactContext`, the progress check `newTokenCount >= lastTokenCount` still runs outside the compaction transaction. If `AfterMessageAppended` concurrently appends a new message between the compaction commit and this check, `newTokenCount` could be higher than `lastTokenCount` even though compaction did reduce the context. This would cause a false "stuck at N tokens" error and abort the compaction loop. The window is narrow but real under high message throughput.

### New Issue Introduced by Fixes

**N1. `Summary.TokenCount` (`int64`) vs `calculateInputTokens`/`calculateSummaryTokens` (`int`) — Compile Error**

The M10 fix correctly changed `Summary.TokenCount` from `int` to `int64` to match sqlc's mapping of SQLite `INTEGER`. However, the escalation comparison sites were not updated:

```go
// In SummarizeMessages (summarizer.go):
inputTokens := calculateInputTokens(messages)       // returns int
if err == nil && summary.TokenCount < inputTokens {  // int64 < int → COMPILE ERROR

// In CondenseSummaries (summarizer.go):
inputTokens := calculateSummaryTokens(summaries)     // returns int
if err == nil && condensed.TokenCount < inputTokens { // int64 < int → COMPILE ERROR
```

In Go, comparing values of different numeric types (`int64` and `int`) without explicit conversion is a compile error:

```
invalid operation: summary.TokenCount < inputTokens (mismatched types int64 and int)
```

This affects **four comparison sites** in `summarizer.go` (Level 1 and Level 2 checks in both `SummarizeMessages` and `CondenseSummaries`).

**Fix**: Either change both helper functions to return `int64`:

```go
func calculateInputTokens(messages []LCMMessage) int64 {
    var total int64
    for _, msg := range messages {
        total += int64(msg.TokenCount)
    }
    return total
}
```

Or cast at each comparison site: `summary.TokenCount < int64(inputTokens)`.

### Correctly Resolved Findings — Verification Notes

**C1 (MessagePart wrapper)**: The `MessagePart` struct now correctly uses `Type string` + `Data partData` wrapper pattern matching Crush's `partWrapper` in `message.go:222-225`. All field access goes through `part.Data.X`. This is the single most important fix.

**C4 (Compaction target)**: The new formula `target = softThreshold * (100 - TargetFreePercent) / 100` produces `73800 * 75 / 100 = 55350` for 128K contexts — always below the 73,800 soft threshold. The detailed comment explaining why the old formula was wrong is excellent and prevents regression.

**C5 (ON DELETE RESTRICT → CASCADE)**: Changed on `lcm_context_items.message_id` with a clear explanation of why RESTRICT broke existing deletion paths. The comment also notes the tradeoff (expansion linkage is severed but summary text survives).

**S3/S4/V1/V2 (Volt divergences)**: The new "Volt Reference Implementation" section in Section 3 is well-written. It clearly states Volt uses PostgreSQL, acknowledges the file ID design divergence as intentional, and reframes the relationship as a port rather than a match.

**S10 (sqlc.narg)**: Changed to `sqlc.narg()` with a clear comment about explicit nullability.

**S12 (FTS5 sanitization)**: Added a WARNING comment with a concrete sanitization example (`strings.ReplaceAll(query, "\"", " ")` wrapped in quotes). This is the right level of guidance — enough to prevent the bug without over-engineering.

**O1 (Bootstrap)**: The bootstrap note in `integration.go` and the Phase 4 checklist item for `BootstrapSession` adequately address the missing initialization logic.

**O2 (Partial failure recovery)**: The `summarizeMessagesOnce` comment correctly explains the crash-recovery semantics of `ON CONFLICT DO NOTHING`.

---

## Critical Errors

### C1. `MessagePart` JSON Structure Is Fundamentally Wrong (Section 7, `format.go`)

**Impact**: `FormatMessagesForSummary` will silently produce empty/meaningless output for every message. This is **worse** than falling back to raw JSON — the structured extraction path runs but yields empty strings.

Crush serializes `Message.Parts` using a **wrapper pattern** (`internal/message/message.go:222-258`):

```json
[{"type": "text", "data": {"text": "hello"}}, {"type": "tool_call", "data": {"id": "tc1", "name": "bash", "input": "{}", "finished": true}}]
```

Each part is wrapped in `{"type": "...", "data": {...}}`. The `type` discriminator is at the wrapper level, and the actual content is nested inside a `"data"` key.

The document's `MessagePart` struct assumes **flat** objects:

```json
[{"type": "text", "text": "hello"}, {"type": "tool_call", "name": "bash", "input": "{}"}]
```

When `json.Unmarshal([]byte(msg.Content), &msgParts)` runs, Go's default JSON decoder [silently ignores unknown fields](https://pkg.go.dev/encoding/json). The `"data"` key has no matching struct field, so it is discarded. The result: `Type` is correctly populated (e.g., `"text"`), but **all other fields remain zero-valued** (empty strings, false booleans). The unmarshal returns `nil` error, so the raw-JSON fallback never triggers.

The switch statement then runs the structured cases with empty data:
- `case "text"`: appends `part.Text` → `""` (empty string)
- `case "tool_call"`: appends `[Tool Call: ]` (empty name)
- `case "tool_result"`: appends `[Tool Result]\n` (empty content)
- `case "reasoning"`: appends `[Reasoning] ` (empty text)

Every message is "successfully" processed into meaningless empty output. All summaries produced by LCM would contain no actual conversation content.

**Fix**: The `MessagePart` struct needs to match the wrapper format:

```go
type partWrapper struct {
    Type string          `json:"type"`
    Data json.RawMessage `json:"data"`
}
```

Then unmarshal the `Data` field into type-specific structs based on the `Type` discriminator, exactly as Crush does in `unmarshalParts()` (`internal/message/message.go:260-328`).

---

### C2. `TextContent` Does Not Have an `Ignored` Field (Sections 3 and 7)

**Impact**: The `MessagePart.Ignored` field and the `if !part.Ignored` check in `FormatMessagesForSummary` reference a field that doesn't exist in Crush.

Section 3 claims:
> **`TextContent`**: `type="text"`, fields `text` and `ignored`

Crush's actual `TextContent` (`internal/message/content.go:60-62`):

```go
type TextContent struct {
    Text string `json:"text"`
}
```

There is no `ignored` field anywhere in Crush's `TextContent`. The document's `MessagePart` struct includes `Ignored bool json:"ignored,omitempty"` and the format function checks `if !part.Ignored` — both reference a nonexistent field. Even after fixing C1, the `Ignored` check would always evaluate to `!false` (true), making it dead code rather than a functional error, but the documentation claim about the type is wrong.

---

### C3. `ReasoningContent` Field Is `thinking`, Not `text` (Sections 3 and 7)

**Impact**: Even after fixing C1 (wrapper parsing), the `case "reasoning"` branch reads `part.Text` which maps to JSON key `"text"`, but Crush's `ReasoningContent` uses the JSON key `"thinking"`. All reasoning content would be silently lost.

Section 3 claims:
> **`ReasoningContent`**: `type="reasoning"`, field `text`

Crush's actual `ReasoningContent` (`internal/message/content.go:45-53`):

```go
type ReasoningContent struct {
    Thinking         string `json:"thinking"`
    Signature        string `json:"signature"`
    ThoughtSignature string `json:"thought_signature"`
    // ...additional fields
}
```

The JSON field is `"thinking"`, not `"text"`. The document's `MessagePart` reuses the `Text` field (with `json:"text"`) for both `TextContent` and `ReasoningContent`, but these types use different JSON keys in Crush. The `case "reasoning"` branch would always produce `[Reasoning] ` with empty content.

---

### C4. Compaction Soft Threshold / Target Misalignment — Compaction May Do Nothing (Sections 5 and 10)

**Impact**: For context windows larger than ~95K tokens (including all modern LLMs: 128K, 200K), the compaction target is **higher** than the soft threshold that triggers compaction, creating a dead zone where compaction is triggered but immediately exits without doing any work.

Demonstration with a 128K context window (overhead=3000, reserve=20000):

- **Soft threshold** (triggers compaction in `integration.go`): `128000 * 60/100 - 3000 = 73,800 tokens`
- **Compaction target** (stop condition in `CompactContext`): `usable * 75/100 = (128000 - 3000 - 20000) * 75/100 = 78,750 tokens`

When context hits 74,000 tokens (above the 73,800 soft threshold), `AfterMessageAppended` schedules compaction. But `CompactContext` checks `if currentTokens <= target` → `74,000 <= 78,750` → **true** → returns immediately with "Compaction complete after 0 rounds."

The crossover point where softThreshold equals target:
```
0.6 * CW - overhead = (CW - overhead - reserve) * 0.75
```
Solving for CW with overhead=3000, reserve=20000: **CW ≈ 95,000 tokens**.

- **CW < 95K** (e.g., 32K): softThreshold (16,200) > target (15,750) → works correctly
- **CW = 128K**: softThreshold (73,800) < target (78,750) → **~5,000 token dead zone**
- **CW = 200K**: softThreshold (117,000) < target (132,750) → **~16,000 token dead zone**

The problem gets worse with larger context windows. For 200K models, compaction goroutines are spawned and immediately exit for contexts between 117K and 133K tokens — wasting resources and providing no compression.

---

### C5. `ON DELETE RESTRICT` on `lcm_context_items.message_id` Will Break Crush's Existing Message Deletion (Section 4)

**Impact**: Crush's existing `DeleteMessage` and `DeleteSessionMessages` queries will fail with foreign key constraint violations whenever any message is referenced in the LCM context window.

The schema declares:
```sql
FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT
```

Crush's existing code (`internal/db/messages.sql.go`) runs:
```sql
DELETE FROM messages WHERE id = ?
DELETE FROM messages WHERE session_id = ?
```

With `PRAGMA foreign_keys = ON` (confirmed in `connect.go:13-21`), these will fail if the message is still in `lcm_context_items`. The document acknowledges this is "intentional" and says "Compaction must replace context items with summaries before Crush can delete the underlying messages," but:

1. No cleanup logic is provided that integrates with Crush's existing deletion paths
2. The implementation checklist (Section 15) doesn't include wiring LCM cleanup into `DeleteMessage`/`DeleteSessionMessages`
3. This is a **breaking change** to Crush's existing behavior with no migration path
4. The `message` service's `DeleteSessionMessages` method (`internal/message/message.go:98-112`) deletes messages one by one in a loop — every message still in context would cause a failure, potentially leaving the session in a half-deleted state

---

## Significant Errors

### S1. `ToolCall` Is Missing the `ID` and `ProviderExecuted` Fields (Section 7, `format.go`)

Crush's `ToolCall` (`internal/message/content.go:97-103`):
```go
type ToolCall struct {
    ID               string `json:"id"`
    Name             string `json:"name"`
    Input            string `json:"input"`
    ProviderExecuted bool   `json:"provider_executed"`
    Finished         bool   `json:"finished"`
}
```

The document's `MessagePart` omits `ID` (used throughout Crush for correlating tool calls with results via `ToolResult.ToolCallID`) and `ProviderExecuted`. The `ID` field is particularly important — without it, tool call/result correlation is lost during summarization.

### S2. `ToolResult` Is Missing Multiple Fields (Section 7, `format.go`)

Crush's `ToolResult` (`internal/message/content.go:107-115`) has `ToolCallID`, `Name`, `Data`, `MIMEType`, and `Metadata` fields absent from the document's `MessagePart`. While Section 3 claims to accurately describe Crush's content types, it omits 5 of 7 fields from `ToolResult`.

### S3. Document Diverges From Volt's File ID Format Without Acknowledgment (Section 7)

The document claims its file ID changes "match Volt's behavior," but they diverge in three ways:

| Aspect | Volt (actual) | Document |
|--------|---------------|----------|
| Fallback output format | `[LCM File IDs: file_aaa, file_bbb]` (plural, comma-separated) — `summarize.ts:418`, `condense.ts:339` | `[LCM File ID: file_aaa]\n[LCM File ID: file_bbb]` (singular, one per line) |
| Regex pattern 3 | `LCM File ID:\s*(file_[0-9a-f]{16})` (no brackets) — `summarize.ts:231` | `\[LCM File ID:\s*(file_[0-9a-f]{16})\]` (with brackets) |
| Design intent | Regex intentionally doesn't match fallback output; file IDs propagate structurally via `summary.fileIds` — see test at `compaction-redesign.test.ts:250-267` | Regex is designed to match fallback output; file IDs re-extracted via regex |

Volt's test suite (`compaction-redesign.test.ts:250-267`) explicitly documents and tests that `[LCM File IDs: ...]` (plural) is NOT matched by the extraction regex — this is by design, because Volt propagates file IDs structurally through the `fileIds` field, not via re-extraction from content. The document presents its divergence as a bug fix rather than a deliberate design choice.

### S4. Volt Uses PostgreSQL, Not SQLite (Throughout)

Volt's LCM implementation uses PostgreSQL (`packages/voltcode/src/session/lcm/db.ts`) with:
- `tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED` for full-text search
- `jsonb` for file ID arrays
- PostgreSQL-specific types and features

The document correctly adapts to SQLite (FTS5, TEXT columns, CHECK constraints), but the repeated framing of "matching Volt's reference implementation" is misleading. The document should clearly state it is a **port** from PostgreSQL to SQLite with intentional deviations.

### S5. Partial `ContextEntry` Returns From Queries Not Documented (Section 13)

`LCMGetMessagesToSummarize` and `LCMGetOldestSummariesInContext` select only 4 columns (`position`, `item_type`, `message_id`, `summary_id`) but the Store interface declares their return type as `[]ContextEntry` which has 8 fields (`Position`, `ItemType`, `MessageID`, `SummaryID`, `SummaryKind`, `Role`, `Content`, `TokenCount`). sqlc will generate a separate row struct for these queries, not a `ContextEntry`. The SQLiteStore implementation must manually map these partial results, and callers receive entries with zero-valued `Role`, `Content`, `TokenCount`, and `SummaryKind` — a foot-gun for anyone adding code that reads these fields.

### S6. `DefaultByteThreshold` Comment Says "100 KB" (Section 5)

```go
// DefaultByteThreshold: byte size above which a file is considered "large" (100 KB).
const DefaultByteThreshold = 100_000
```

100,000 bytes = 97.66 KB (1 KB = 1024 bytes). Should say "~100 KB" or "100,000 bytes" to be precise.

### S7. `CriticalThresholdMultiplier` Is Declared But Unused (Sections 5 and 10)

The constant is defined with a specific purpose ("force aggressive compaction at this level") and a computed value ("72% when soft = 60%"), but the compactor explicitly suppresses it:
```go
_ = CriticalThresholdMultiplier // Reserved for future escalation logic
```

Shipping a configuration constant with documentation about its computed behavior but no actual code that uses it creates false expectations. It should either be implemented or removed.

### S8. Background Compaction May Be Canceled Prematurely (Section 12)

`ScheduleCompaction` passes the caller's `context.Context` directly to the background goroutine. In `integration.go`, this context comes from `AfterMessageAppended`, which is called from the agent message loop. If this context is request-scoped or tied to a specific agent turn, canceling it will abort the background compaction mid-way. The goroutine should use `context.WithoutCancel(ctx)` (Go 1.21+) or a detached application-scoped context to ensure compaction completes independently of the caller's lifecycle.

### S9. `min`/`max` Described as Go 1.25 Feature (Section 3)

> Use Go 1.25 built-in `min`/`max` functions (do NOT define custom versions)

The built-in `min`/`max` functions were [introduced in Go 1.21](https://go.dev/blog/go1.21) (August 2023). Describing them as a Go 1.25 feature is inaccurate — they've been available for four major releases. The note is still useful (don't redefine them), but the version attribution is wrong.

### S10. `sqlc.arg()` vs `sqlc.narg()` for Nullable Parameters (Section 13)

The `LCMAppendContextItem` query uses `sqlc.arg(message_id)` and `sqlc.arg(summary_id)` for parameters that must accept NULL values (the CHECK constraint ensures exactly one is NULL). Per [sqlc documentation](https://docs.sqlc.dev/en/stable/reference/macros.html), `sqlc.narg()` is described as "the same as `sqlc.arg`, but always marks the parameter as nullable." While `sqlc.arg()` may infer nullability from the column definition in some cases, `sqlc.narg()` would be the explicit and unambiguous choice. The generated Go type discrepancy between sqlc's `sql.NullString` and the Store interface's `*string` must be bridged by the SQLiteStore regardless, but using `sqlc.narg()` makes the intent clear.

### S11. `"file"` and `"patch"` Type Cases Are Dead Code; `"image_url"` and `"binary"` Are Unhandled (Section 7, `format.go`)

The `format.go` switch statement includes:
```go
case "file", "patch":
    // Skip — already in context via large files
```

Crush's actual content type constants (`internal/message/message.go:212-219`) are:
```go
imageURLType   partType = "image_url"
binaryType     partType = "binary"
```

There are no `"file"` or `"patch"` type strings anywhere in Crush. These cases will never match any real data — they are dead code. Meanwhile, messages containing `"image_url"` (image references with URL and detail) or `"binary"` (base64-encoded file data with path and MIME type) content have no matching case and will be silently dropped during summarization. Image URLs referenced in conversations could contain context-relevant visual information that is permanently lost.

### S12. FTS5 Query Sanitization Missing (Section 13)

The `LCMSearchSummaries` query passes raw user input directly to FTS5:
```sql
WHERE lcm_summaries_fts MATCH ?
```

FTS5's MATCH expression has its own [mini-language](https://www.sqlite.org/fts5.html) with operators: `AND`, `OR`, `NOT`, `NEAR`, `*`, `^`, `:`, `-`, `"`, and parentheses. Unsanitized user input containing these characters causes either malformed MATCH expression errors (e.g., searching for `-6` or `file*`) or unexpected boolean query behavior (e.g., searching for `NOT found`). The [recommended approach](https://blog.haroldadmin.com/posts/escape-fts-queries) is to wrap each user term in double quotes with internal `"` escaped as `""`, or strip non-alphanumeric characters before passing to FTS5.

### S13. `file_ids` Column JSON Marshaling Gap (Sections 4, 6, and 13)

The schema defines `file_ids TEXT NOT NULL DEFAULT '[]'` (a JSON array stored as TEXT), and the Go type `Summary.FileIDs` is `[]string`. sqlc will generate a `FileIds string` field for this column. The document provides no marshal/unmarshal conversion code between the SQL-level `string` (JSON text) and the Go-level `[]string`. The `SQLiteStore` implementation must call `json.Marshal` on inserts and `json.Unmarshal` on reads, but this bridging logic is nowhere in the document — unlike other implementation details which are explicitly documented or at least noted.

---

## Minor Issues

### M1. `lcm_large_files` Schema Has Columns Not in Go Type (Section 4 vs Section 6)

The SQL schema includes `exploration_summary TEXT` and `explorer_used TEXT` columns, but the `LargeFile` Go struct in `types.go` doesn't include these fields. The `LCMInsertLargeFile` query also doesn't populate them. They'll always be NULL with no way to read or write them. If they're for future use, they should be documented as such or removed from the initial migration to keep the schema clean.

### M2. `IsLargeFile` and `CheckAndStoreLargeFile` Use Different Token Estimation Methods

`IsLargeFile` uses `EstimateTokenCount(content)` which counts **runes** / 4. `CheckAndStoreLargeFile` uses `EstimateTokenCountFromBytes(fileSize)` which counts **bytes** / 4. For UTF-8 multi-byte content (CJK, emoji), bytes/4 produces a higher estimate than runes/4. A 100KB file of CJK characters (~33,333 runes, ~8,333 tokens by rune count) would estimate as ~25,000 tokens by byte count. The two functions could classify the same content differently at the token threshold boundary.

### M3. Token Estimation for Messages Overestimates Significantly (Section 13)

`LENGTH(m.parts) / 4` counts the byte length of the full JSON parts array including all wrapper overhead. For a short message `[{"type":"text","data":{"text":"hi"}}]` (42 bytes), the estimate is ~10 tokens when the actual content "hi" is ~0.5 tokens — a **20x overestimate**. The document acknowledges this ("JSON structure characters are included") but understates the magnitude by calling it merely "conservative."

### M4. No Garbage Collection Strategy for Orphaned Summaries

The `lcm_summary_parents` table uses `ON DELETE RESTRICT` for `parent_summary_id`, meaning condensed parent summaries can never be deleted even after being removed from the active context. Over time, the `lcm_summaries` table grows monotonically. The document doesn't discuss a GC strategy or even acknowledge the monotonic growth pattern.

### M5. `Finish` Type Description Is Incomplete (Section 3)

Section 3 says `Finish` has `type="finish"` and "signals end of assistant turn." Crush's `Finish` (`internal/message/content.go:119-124`) actually has `Reason` (FinishReason), `Time` (int64), `Message` (string), and `Details` (string) fields. While the format function correctly skips it (`// End-of-turn marker`), the type description is incomplete.

### M6. `sessions` Table Timestamps: Seconds vs Milliseconds Inconsistency

Crush's initial migration (`20250424200609_initial.sql`) comments say `-- Unix timestamp in milliseconds`, but the actual triggers and insert queries use `strftime('%s', 'now')` which returns **seconds** since epoch. The LCM schema uses `DEFAULT (strftime('%s', 'now'))` (seconds), matching Crush's actual behavior but not its comments. This is a pre-existing Crush inconsistency that the LCM document inherits without comment.

### M7. Go Version Specificity

The document header says "Requires: Go 1.25+" while Crush's `go.mod` specifies `go 1.25.5`. The "+" notation is acceptable but imprecise. Since Go 1.25 is the minimum and the document references Go 1.25-specific features (like the version itself), the header is correct if slightly informal.

### M8. `LCMInsertSummaryMessage` Uses `ON CONFLICT(summary_id, message_id)` but Primary Key Is `(summary_id, ord)`

The `lcm_summary_messages` table has:
```sql
PRIMARY KEY (summary_id, ord),
UNIQUE (summary_id, message_id)
```

The `LCMInsertSummaryMessage` query uses `ON CONFLICT(summary_id, message_id) DO NOTHING`, which targets the UNIQUE constraint rather than the PRIMARY KEY. This works correctly — SQLite allows `ON CONFLICT` to target any unique constraint — but if a re-summarization produces the same messages in a different order (different `ord` values), the primary key would not conflict while the UNIQUE constraint would. The idempotency guarantee holds only if the same messages always produce the same ordering, which the deterministic ID generation ensures.

### M9. `ImageURLContent` and `BinaryContent` Not Documented in Section 3

Section 3 documents 5 of Crush's 7 content part types (`TextContent`, `ToolCall`, `ToolResult`, `ReasoningContent`, `Finish`) but omits `ImageURLContent` (with `URL string` and `Detail string` fields, `internal/message/content.go:70-73`) and `BinaryContent` (with `Path`, `MIMEType`, `Data` fields, `content.go:81-85`). These types are serialized as `"image_url"` and `"binary"` respectively. Their omission from both the documentation and the `format.go` handler means implementers won't know these types exist or how to handle them.

### M10. `Summary.TokenCount` Is `int` but sqlc Generates `int64` (Section 6)

The document declares `Summary.TokenCount int` in `types.go`, but the SQL schema has `token_count INTEGER NOT NULL`. sqlc maps SQLite `INTEGER` to Go `int64`. The `SQLiteStore` implementation must perform explicit narrowing conversions (`int(row.TokenCount)`) which are technically lossy, though overflow is unrealistic for token counts.

### M11. Race Between Compaction Progress Check and Concurrent Message Insertion (Section 10)

In `CompactContext`, after performing compaction the code checks:
```go
newTokenCount, _ := c.store.GetContextTokenCount(ctx, sessionID)
if newTokenCount >= lastTokenCount {
    return round, fmt.Errorf("compaction made no progress (stuck at %d tokens)", newTokenCount)
}
```

This progress check runs **outside** the compaction transaction. If `AfterMessageAppended` concurrently appends a new message between the compaction commit and this check, `newTokenCount` could be higher than `lastTokenCount` even though compaction did reduce the context. This would cause a false "stuck at N tokens" error and abort the compaction loop. The window is narrow (requires a message to arrive between two sequential DB calls), but it's a real race that could surface under high message throughput.

### M12. `ReplacePositionsWithSummary` Raw SQL Contradicts sqlc Mandate (Sections 3 and 10)

Section 3 states: "Use sqlc for all database queries (write `.sql` files, generate Go code)." However, `replace.go` executes raw SQL via `database/sql` transactions. The design note in Section 10 acknowledges and justifies this exception (the transactional read-delete-insert cycle can't be expressed through the Store interface), but Section 3's mandate is stated as absolute with no listed exceptions. This is a documentation inconsistency — the mandate should say "for all database queries except where noted" or Section 3 should reference the exception.

---

## Errors in "Changes from v3" Tables

### V1. The `>` vs `>=` Change Claim Is Correct For Volt But Misattributed

The document says it changed `IsLargeFile` from `>=` to `>` to match "Volt's reference implementation." Volt does use strict `>` (`large-file-threshold.ts:73,79`). This change is technically correct, but the "fixed" framing implies v3 was buggy — it may have been an intentional conservative choice. The document should note this as a design alignment, not a bug fix.

### V2. The "Multi-file-ID fallback footer" Fix Claim Is Misleading

The document says v3's comma-separated format `[LCM File IDs: file_aaa, file_bbb]` "never matched" the regex and presents this as a bug. In Volt, this non-matching is **intentional and tested** (`compaction-redesign.test.ts:250-267`). Volt relies on structural propagation of file IDs (via `summary.fileIds`), not regex re-extraction from content. The document reframes an intentional Volt design choice as a v3 bug.

---

## Omissions

### O1. No Bootstrap Logic for Existing Sessions

The migration creates new tables but doesn't discuss how existing sessions (which have no `lcm_context_items` entries) should be initialized. When LCM is first enabled for an existing session with messages, `GetCurrentContext` would return an empty context window, `GetContextTokenCount` would return 0, and new messages would be appended starting at position 0 — effectively creating a split timeline where pre-LCM messages exist in the `messages` table but not in the LCM context.

### O2. No Error Recovery for Partial Compaction Failures

The `summarizeMessagesOnce` flow is: (1) generate summary via LLM, (2) `InsertLeafSummary` to save the summary and message links, (3) `ReplacePositionsWithSummary` to update context. Step 3 is transactional, but steps 2 and 3 are separate operations. A crash after step 2 but before step 3 leaves a dangling summary (no context reference) and the original messages still in context. The `ON CONFLICT DO NOTHING` on the summary insert handles re-execution, but the message links in `lcm_summary_messages` would already exist and block a clean retry.

### O3. Implementation Checklist Missing Critical Integration Items

The Phase 4 checklist doesn't include:
- Wiring LCM cleanup into Crush's `DeleteMessage`/`DeleteSessionMessages` (required by `ON DELETE RESTRICT` — see C5)
- Bootstrap logic for populating `lcm_context_items` from existing session messages
- Context scope management for background compaction goroutines (see S8)
- Database GC/cleanup for orphaned summaries (see M4)
- Verification of `MessagePart` JSON field names against actual Crush serialization format (the checklist mentions this but the provided code doesn't implement it correctly)
