# LCM Implementation Guide v4.0 — Error Review Report

Reviewed against: [charmbracelet/crush](https://github.com/charmbracelet/crush) and [voltropy/volt](https://github.com/voltropy/volt)

---

## Summary

The original document contained **5 critical errors** that would cause runtime failures or silent data loss, **13 significant errors** involving incorrect claims or design issues, and **12 minor issues**. The most severe finding was that the `MessagePart` struct and `FormatMessagesForSummary` function fundamentally misunderstood Crush's JSON serialization format, meaning the entire message parsing pipeline would silently produce empty output at runtime.

---

## Updated Guide Evaluation (Audit-Corrected Version)

### First Revision

The first "Audit-Corrected" revision addressed **27 of 30 original findings** correctly. Three original issues remained unresolved (M4, M6, M11) and **one new compile error** (N1) was introduced by the `Summary.TokenCount` type change where `calculateInputTokens`/`calculateSummaryTokens` still returned `int` while `Summary.TokenCount` became `int64`, making `summary.TokenCount < inputTokens` a compile error.

### Second Revision — All Issues Resolved

The second revision resolves **all remaining issues** including the newly introduced N1:

| Finding | Resolution |
|---------|------------|
| **M4** (orphan GC) | GC sweep query added in `lcm_summary_parents` schema comments with explanation of growth characteristics |
| **M6** (timestamps) | Section 4 preamble now explicitly states "Unix seconds via `strftime('%s', 'now')`" and notes Crush's own migration comments say "milliseconds" while the code returns seconds |
| **M11** (progress race) | Acknowledged in `compactor.go` inline comment as an accepted tradeoff — the window is narrow (two sequential DB calls) and SQLite WAL single-writer semantics make it rare |
| **N1** (int64 compile error) | Both `calculateInputTokens` and `calculateSummaryTokens` now return `int64`; all comparisons are `int64 < int64` |

### Full Resolution Summary

All **30 original findings** and **1 introduced finding** are now resolved:

| Status | Count | Findings |
|--------|-------|----------|
| Resolved | 30 + 1 | C1–C5, S1–S13, M1–M12, V1–V2, O1–O3, N1 |
| Not resolved | 0 | — |

### Verification Notes

**C1 (MessagePart wrapper)**: `MessagePart` uses `Type string` + `Data partData` wrapper pattern matching Crush's `partWrapper` in `message.go:222-225`. All field access via `part.Data.X`. The single most important fix.

**C4 (Compaction target)**: Formula `target = softThreshold * (100 - TargetFreePercent) / 100` produces 55,350 for 128K contexts — always below the 73,800 soft threshold. The inline comment explaining why the old `usable * 75/100` formula was wrong prevents regression.

**C5 (ON DELETE CASCADE)**: Changed on `lcm_context_items.message_id` with explanation of why RESTRICT broke existing deletion paths.

**S3/S4/V1/V2 (Volt divergences)**: The "Volt Reference Implementation" section clearly states Volt uses PostgreSQL, acknowledges file ID design divergence as intentional, and reframes the relationship as a port.

**M4 (GC sweep)**: The provided query (`DELETE FROM lcm_summaries WHERE summary_id NOT IN (context) AND summary_id NOT IN (parents)`) correctly targets orphaned summaries while respecting RESTRICT on parent references. Multi-level chains require multiple sweeps — acceptable for periodic cleanup.

**M11 (Race)**: Documenting the race as an accepted tradeoff rather than fixing it is reasonable — SQLite WAL serializes writers, so the window between two sequential reads is extremely narrow. A code fix (e.g., moving the check inside the transaction) would add complexity for a near-theoretical scenario.

**N1 (int64 helpers)**: `calculateInputTokens` casts `int64(msg.TokenCount)` and returns `int64`; `calculateSummaryTokens` reads `s.TokenCount` (already `int64`) directly. Both documented in the Changes from v3 table.

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

---

## Implementation Issues (Discovered During Port)

The following issues were discovered while actually implementing the LCM guide in the Crush codebase at `/tmp/crush/internal/lcm/`. All core files compile and all 16 unit tests pass (verified in an isolated build environment due to Go 1.25.5 toolchain unavailability).

### I1. sqlc Does Not Support `sqlc.slice()` for SQLite — Batch Queries Must Use Loops

**Severity**: Significant (guide's SQL is uncompilable)

The guide's `LCMGetSummariesByIDs` and `LCMGetMessagesByIDs` queries use `sqlc.slice('ids')` for `WHERE ... IN (...)` clauses:

```sql
SELECT ... FROM lcm_summaries WHERE summary_id IN (sqlc.slice('ids'));
```

**`sqlc.slice()` is not supported for SQLite in sqlc v1.30.0.** It is a PostgreSQL-only feature. Running `sqlc generate` with these queries produces no error but no code either — the queries are silently dropped.

**Fix applied**: Replaced batch queries with individual ID lookups (`LCMGetSummaryByID :one`, `LCMGetMessageByID :one`) and loop in the Go `SQLiteStore` implementation:

```go
func (s *SQLiteStore) GetMessagesByIDs(ctx context.Context, ids []string) ([]LCMMessage, error) {
    messages := make([]LCMMessage, 0, len(ids))
    for _, id := range ids {
        row, err := s.q.LCMGetMessageByID(ctx, id)
        // ...
    }
    return messages, nil
}
```

This is an N+1 query pattern. For typical compaction batch sizes (3–10 messages), the overhead is negligible. For larger batches, a raw SQL query with dynamically-built `IN (?, ?, ...)` would be more efficient but violates the sqlc mandate.

### I2. sqlc Maps `COALESCE(SUM(CASE...))` to `interface{}`, Not `int64`

**Severity**: Significant (guide assumes wrong return type)

The `LCMGetContextTokenCount` query returns `COALESCE(SUM(CASE ... END), 0)`. sqlc cannot determine the type of this expression and generates:

```go
func (q *Queries) LCMGetContextTokenCount(ctx context.Context, sessionID string) (interface{}, error) {
    var total_tokens interface{}
    err := row.Scan(&total_tokens)
    return total_tokens, err
}
```

The guide's `Store` interface declares `GetContextTokenCount` as returning `(int, error)`, but the sqlc-generated code returns `(interface{}, error)`. The `SQLiteStore` must perform a type assertion:

```go
func (s *SQLiteStore) GetContextTokenCount(ctx context.Context, sessionID string) (int, error) {
    result, err := s.q.LCMGetContextTokenCount(ctx, sessionID)
    if v, ok := result.(int64); ok {
        return int(v), nil
    }
    return 0, nil
}
```

The same issue affects the `token_count` column in `LCMGetCurrentContext` — it is generated as `TokenCount interface{}` in the row struct, requiring a type assertion when mapping to `ContextEntry.TokenCount int`.

The guide never mentions these type assertions. An implementer following the guide verbatim would get compile errors when trying to assign `interface{}` to `int`.

### I3. `LCMAppendContextItem` CTE Syntax Fails sqlc — Must Use Subquery in SELECT

**Severity**: Moderate (guide's exact SQL doesn't compile)

The guide's `LCMAppendContextItem` uses a CTE:

```sql
WITH next_pos AS (
    SELECT COALESCE(MAX(position), -1) + 1 AS pos
    FROM lcm_context_items
    WHERE session_id = sqlc.arg(session_id)
)
INSERT INTO lcm_context_items (session_id, position, item_type, message_id, summary_id)
SELECT sqlc.arg(session_id), pos, sqlc.arg(item_type), sqlc.narg(message_id), sqlc.narg(summary_id)
FROM next_pos;
```

This fails sqlc with `column reference "session_id" is ambiguous` because `sqlc.arg(session_id)` in both the CTE and the SELECT creates a conflict. The fix was to use an `INSERT...SELECT` with a subquery:

```sql
INSERT INTO lcm_context_items (session_id, position, item_type, message_id, summary_id)
SELECT ?, COALESCE(MAX(ci.position), -1) + 1, ?, ?, ?
FROM lcm_context_items ci
WHERE ci.session_id = sqlc.arg(session_id);
```

sqlc correctly deduces that the first `?` and `sqlc.arg(session_id)` refer to the same parameter and generates code that passes `arg.SessionID` twice (once for the INSERT and once for the WHERE). However, `sqlc.narg()` was dropped — the parameters are inferred as `sql.NullString` from the column definitions, which is functionally equivalent.

### I4. FTS5 Virtual Tables Cannot Be Introspected by sqlc

**Severity**: Moderate (guide's FTS5 query must be hand-coded)

sqlc cannot parse FTS5 virtual table syntax. The guide's `LCMSearchSummaries` query:

```sql
WHERE lcm_summaries_fts MATCH ?
```

fails with `column "lcm_summaries_fts" does not exist`. The FTS5 MATCH operator references the virtual table name as a column, which sqlc's SQLite parser doesn't understand.

**Fix applied**: The `SearchSummaries` method is implemented directly in `SQLiteStore` using raw `database/sql`, with FTS5 query sanitization:

```go
func (s *SQLiteStore) SearchSummaries(ctx context.Context, sessionID string, query string, limit int) ([]Summary, error) {
    safe := "\"" + strings.ReplaceAll(query, "\"", " ") + "\""
    rows, err := s.db.QueryContext(ctx, `...WHERE lcm_summaries_fts MATCH ?...`, safe, sessionID, limit)
    // ...
}
```

This is a second raw-SQL exception beyond `ReplacePositionsWithSummary`, which the guide's sqlc mandate (Section 3, point 8) does not list. The mandate should be updated to include FTS5 queries as a documented exception.

### I5. Goose Migration Requires `StatementBegin`/`StatementEnd` Blocks

**Severity**: Minor (guide's migration format is incomplete)

Crush's existing migrations use `-- +goose StatementBegin` and `-- +goose StatementEnd` to delimit statement blocks. The guide's migration does not include these directives. Goose may fail to parse multi-statement migrations without them — for example, CREATE TABLE + CREATE INDEX + CREATE TRIGGER sequences in a single `-- +goose Up` block need explicit statement boundaries when using SQLite.

**Fix applied**: Added `-- +goose StatementBegin` after `-- +goose Up` and `-- +goose StatementEnd` before `-- +goose Down` (and matching pair in the Down block).

### I6. `partData` Union Struct Has a JSON Key Collision Between `TextContent.Text` and Top-Level Content

**Severity**: Minor (functionally correct but confusing)

The `partData` struct merges all content type fields into one:

```go
type partData struct {
    Text     string `json:"text,omitempty"`     // TextContent
    Content  string `json:"content,omitempty"`  // ToolResult
    // ...
}
```

When deserializing a `text`-type part from `{"type":"text","data":{"text":"Hello"}}`, the `Text` field is populated correctly. However, if a `tool_result` part happened to have a `"text"` key in its JSON (it doesn't in Crush currently, but it's not structurally prevented), that key would populate `d.Text` instead of being ignored.

More practically: the `Text` and `Content` fields have similar semantics (both are "the main text content") but map to different JSON keys for different part types. This is correct but makes the code harder to reason about. A comment in the struct clarifying which fields are active for which `Type` value would help.

### I7. `LCMAppendContextItem` Returns No Rows When Session Has No Existing Context Items — Empty INSERT

**Severity**: Critical (first message in any session is silently lost)

**UPDATE**: After careful analysis, this is NOT actually a bug. The `SELECT ... FROM ... WHERE` with an aggregate function (`MAX()`) always returns exactly one row even when no rows match the WHERE clause, because aggregates without GROUP BY produce a single result row. `MAX()` over an empty set returns NULL, `COALESCE(NULL, -1)` = -1, and -1 + 1 = 0. The INSERT receives one row with position 0.

However, I initially flagged this because the behavior is non-obvious and differs from a typical `SELECT ... WHERE ... LIMIT 1` (which returns 0 rows when nothing matches). This is a correctness gotcha that the guide should document — an implementer reviewing the query might "fix" it by removing the aggregate, breaking the empty-session case.

### Summary of Implementation Issues

| ID | Severity | Guide Section | Issue |
|----|----------|---------------|-------|
| I1 | Significant | §13 | `sqlc.slice()` unsupported for SQLite; batch queries need Go loops |
| I2 | Significant | §6, §13 | `COALESCE(SUM(CASE...))` returns `interface{}` from sqlc, not `int64` |
| I3 | Moderate | §13 | CTE with `sqlc.arg` causes ambiguous column reference |
| I4 | Moderate | §11, §13 | FTS5 virtual tables can't be parsed by sqlc |
| I5 | Minor | §4 | Missing Goose `StatementBegin`/`StatementEnd` directives |
| I6 | Minor | §7 | `partData` union struct field semantics could be clearer |
| I7 | Informational | §13 | `MAX()` aggregate over empty WHERE is non-obvious; warrants documentation |

### Files Created During Implementation

```
internal/lcm/
├── config.go         — Constants, token estimation, budget computation
├── types.go          — Domain types, Store/Summarizer/LLMClient interfaces
├── format.go         — MessagePart wrapper, FormatMessagesForSummary, file ID regex
├── summarizer.go     — Three-level escalation (normal/aggressive/fallback)
├── context.go        — GetFormattedContext, summary metadata injection
├── compactor.go      — CompactContext iterative loop
├── replace.go        — ReplacePositionsWithSummary (raw SQL transaction)
├── manager.go        — CompactionManager async coordination
├── largefile.go      — CheckAndStoreLargeFile, GetLargeFileContent
├── retrieval.go      — ExpandSummary (recursive with cycle detection), search
├── integration.go    — LCM coordinator (AfterMessageAppended, GetContext, etc.)
├── store.go          — SQLiteStore implementing Store via sqlc + raw FTS5
└── lcm_test.go       — 16 unit tests (all passing)

internal/db/
├── migrations/20260218000000_create_lcm_tables.sql  — Goose migration
└── sql/lcm.sql                                       — sqlc query definitions
```
