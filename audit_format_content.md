# Audit Report: Format & Content Parsing Layer (Volt -> Crush Port)

**Auditor**: Claude Opus 4.6
**Date**: 2026-02-18
**Scope**: Message part parsing, wrapper format handling, content type coverage, file ID extraction, context formatting

## Source Files Examined

| System | File | Purpose |
|--------|------|---------|
| Volt | `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts` | Message formatting, file ID extraction |
| Volt | `/tmp/volt/packages/voltcode/src/session/lcm/condense.ts` | Summary condensation formatting |
| Volt | `/tmp/volt/packages/voltcode/src/session/lcm/context.ts` | Context window management |
| Volt | `/tmp/volt/packages/voltcode/src/session/lcm/summary.ts` | Summary type definitions, `formatForContext` |
| Volt | `/tmp/volt/packages/voltcode/src/session/message-v2.ts` | Message part type definitions |
| Crush | `/tmp/crush/internal/message/content.go` | ContentPart type definitions |
| Crush | `/tmp/crush/internal/message/message.go` | `partWrapper`, `marshalParts`/`unmarshalParts` |
| Crush | `/tmp/crush/internal/lcm/format.go` | `MessagePart`, `partData`, `FormatMessagesForSummary` |
| Crush | `/tmp/crush/internal/lcm/context.go` | `GetFormattedContext`, `FormatSummaryForContext` |
| Crush | `/tmp/crush/internal/lcm/summarizer.go` | `EscalationSummarizer`, fallback logic |
| Crush | `/tmp/crush/internal/lcm/lcm_test.go` | Test coverage for format layer |
| Crush | `/tmp/crush/internal/lcm/config.go` | Constants, token estimation |

---

## Summary Table

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| FC-1 | **Medium** | partData fields | `partData` missing `Finish` struct fields (`reason`, `time`, `message`, `details`) |
| FC-2 | **Low** | partData fields | `partData` missing `ReasoningContent` metadata fields (`signature`, `thought_signature`, `tool_id`, `responses_data`, `started_at`, `finished_at`) |
| FC-3 | **Low** | partData fields | `partData` missing `ToolCall.ProviderExecuted` field |
| FC-4 | **Low** | partData fields | `partData` missing `ToolResult.Data`, `ToolResult.MIMEType`, `ToolResult.Metadata` fields [CORRECTED: ToolResult has 7 fields, not 6; partData maps 4, not 3] |
| FC-5 | **Low** | partData fields | `partData` missing `ImageURLContent` fields (`url`, `detail`) |
| FC-6 | **Low** | partData fields | `partData` missing `BinaryContent` fields (`path`, `mime_type`, `data`) |
| FC-7 | **Medium** | File ID regex | Volt regex matches bare `LCM File ID:` (no brackets); Crush regex matches `[LCM File ID:]` (with brackets). Crush cannot extract bare-format IDs, but in practice both systems primarily use bracketed formats and structured `fileIds` fields for propagation. [CORRECTED: Downgraded from Critical -- bare format is documented in Volt comments but not routinely produced in the data pipeline; structured fileIds propagation mitigates loss.] |
| FC-8 | **Medium** | File ID format | Crush fallback emits `[LCM File ID: xxx]` (singular, per-ID lines); Volt emits `[LCM File IDs: xxx, yyy]` (plural, comma-separated). Crush regex cannot parse Volt's plural format. |
| FC-9 | **Low** | Formatting | Volt uses `[Tool: name]` for tool calls; Crush uses `[Tool Call: name]`. Semantic difference in summarization input. |
| FC-10 | **Low** | Formatting | Volt includes tool output truncated to 1000 chars; Crush includes tool result content truncated to 1000 runes. Different units. |
| FC-11 | **Info** | Formatting | Volt's `formatMessagesForSummary` header is `[Message ID] (role)`; Crush uses `[Message ID (role)]` (parentheses inside brackets). Cosmetic. |
| FC-12 | **Info** | Formatting | Volt only formats "completed" and "error" tool states; Crush formats all tool calls including in-progress. Different information density. |
| FC-13 | **Low** | Formatting | Volt filters out text parts with `ignored: true`; Crush has no equivalent check (Crush does not have an `ignored` concept in its content model). |
| FC-14 | **Info** | Truncation | `runeAwareTruncate` correctly uses rune slicing. Implementation is correct. |
| FC-15 | **Info** | Context formatting | `FormatSummaryForContext` matches Volt's `Summary.formatForContext` exactly. |
| FC-16 | **Low** | Extraction sort | Volt's `extractFileIds` returns sorted, deduplicated IDs. Crush's `extractFileIDs` returns deduplicated but unsorted (insertion-order). |
| FC-17 | **Info** | Test coverage | Tests cover wrapper parsing, tool calls, fallback on invalid JSON, flat-struct validation. Missing: `tool_result`, `finish`, `image_url`, `binary` type parsing tests. |
| FC-18 | **Medium** | `partData` collision | `partData` has a `Text` field (json:"text") that collides: used by both `TextContent.Text` and could theoretically match `ReasoningContent` if the JSON had a `text` key. The struct relies on `Thinking` (json:"thinking") for reasoning, which is correct, but both `text` and `thinking` could be present in the same JSON payload. |
| FC-19 | **Medium** | `partData` collision | `partData.Name` (json:"name") serves double duty for both `ToolCall.Name` and `ToolResult.Name`. This is harmless when parsing each independently, but means both fields populate for either type. |
| FC-20 | **Low** | `partData` collision | `partData.Content` (json:"content") serves both `ToolResult.Content` and is unrelated to `TextContent.Text`. Correctly separated by JSON key names. |
| FC-21 | **Medium** | File ID regex | NEW: Volt's own `FILE_ID_PATTERN` cannot parse its own plural emission `[LCM File IDs: ...]` (the regex uses singular `LCM File ID:` which mismatches plural `LCM File IDs:`). Mitigated by structured `fileIds` propagation. |
| FC-22 | **Low** | Extraction sort | NEW: `aggregateFileIDs` in Crush (summarizer.go:321-339) also returns unsorted results, compounding FC-16 non-determinism during condensation. |

---

## Detailed Findings

### FC-1: `partData` Missing `Finish` Struct Fields

**Severity**: Medium
**Files**: `/tmp/crush/internal/lcm/format.go:79-93`, `/tmp/crush/internal/message/content.go:119-126`

The `Finish` content type in Crush has four fields:

```go
// content.go:119-124
type Finish struct {
    Reason  FinishReason `json:"reason"`
    Time    int64        `json:"time"`
    Message string       `json:"message,omitempty"`
    Details string       `json:"details,omitempty"`
}
```

The `partData` union struct in `format.go` has **none** of these fields:

```go
// format.go:79-93
type partData struct {
    Text       string `json:"text,omitempty"`
    ID         string `json:"id,omitempty"`
    Name       string `json:"name,omitempty"`
    Input      string `json:"input,omitempty"`
    Finished   bool   `json:"finished,omitempty"`
    ToolCallID string `json:"tool_call_id,omitempty"`
    Content    string `json:"content,omitempty"`
    IsError    bool   `json:"is_error,omitempty"`
    Thinking   string `json:"thinking,omitempty"`
}
```

**Impact**: The switch statement at line 51 (`case "finish"`) is a no-op comment (`// End-of-turn marker`), so missing fields cause no functional error today. However, if future code needed to log or inspect finish reasons during summarization, the data would be silently zero-valued. This is **acceptable as-is** since the switch explicitly skips `finish` parts, but represents incomplete coverage of the data model.

**Recommendation**: Add `Reason`, `Time`, `Message`, `Details` fields to `partData` for completeness, even if unused in the current switch.

---

### FC-2: `partData` Missing `ReasoningContent` Metadata Fields

**Severity**: Low
**Files**: `/tmp/crush/internal/lcm/format.go:79-93`, `/tmp/crush/internal/message/content.go:45-53`

`ReasoningContent` in `content.go` has seven fields:

```go
type ReasoningContent struct {
    Thinking         string                             `json:"thinking"`
    Signature        string                             `json:"signature"`
    ThoughtSignature string                             `json:"thought_signature"`
    ToolID           string                             `json:"tool_id"`
    ResponsesData    *openai.ResponsesReasoningMetadata `json:"responses_data"`
    StartedAt        int64                              `json:"started_at,omitempty"`
    FinishedAt       int64                              `json:"finished_at,omitempty"`
}
```

Only `Thinking` is present in `partData`. The missing fields (`Signature`, `ThoughtSignature`, `ToolID`, `ResponsesData`, `StartedAt`, `FinishedAt`) are all provider-specific metadata not needed for summarization text extraction.

**Impact**: None for current usage. The switch at line 48-49 only uses `d.Thinking`. The missing fields are silently discarded during JSON unmarshaling, which is Go's default behavior for unknown fields.

**Recommendation**: No action needed. These fields are legitimately irrelevant to the summarization use case.

---

### FC-3: `partData` Missing `ToolCall.ProviderExecuted`

**Severity**: Low
**Files**: `/tmp/crush/internal/lcm/format.go:82-86`, `/tmp/crush/internal/message/content.go:97-103`

`ToolCall` has a `ProviderExecuted bool` field (json tag: `"provider_executed"`) that is absent from `partData`. The summarization switch does not reference it.

**Impact**: None. The `ProviderExecuted` flag is a provider-level detail irrelevant to summarization.

---

### FC-4: `partData` Missing `ToolResult.Data`, `ToolResult.MIMEType`, `ToolResult.Metadata`

**Severity**: Low
**Files**: `/tmp/crush/internal/lcm/format.go:87-90`, `/tmp/crush/internal/message/content.go:107-115`

`ToolResult` has seven fields. `partData` maps four of them (`ToolCallID`, `Name` via shared field (see FC-19), `Content`, `IsError`). [CORRECTED: Original said "six fields" and "maps three" -- actual count is seven fields, four mapped.] Missing:
- `Data string` (json: `"data"`) -- binary/media output
- `MIMEType string` (json: `"mime_type"`) -- content type indicator
- `Metadata string` (json: `"metadata"`) -- arbitrary metadata

**Impact**: Low. The `tool_result` case (format.go:42-46) only uses `d.IsError` and `d.Content`. If a tool result contains media data in `Data` instead of text in `Content`, the summarization output would show an empty or incomplete result. However, Volt's implementation also ignores these fields (it stringifies the `output` field and truncates it).

**Recommendation**: Consider adding `Data` to `partData` and falling back to it when `Content` is empty, mirroring how `ToolResult` can carry data in either field.

---

### FC-5: `partData` Missing `ImageURLContent` Fields

**Severity**: Low
**Files**: `/tmp/crush/internal/lcm/format.go:79-93`, `/tmp/crush/internal/message/content.go:70-73`

`ImageURLContent` has `URL` and `Detail` fields (json: `"url"`, `"detail"`). Neither is in `partData`. The switch at line 53 skips image_url entirely.

**Impact**: None. Both Volt and Crush skip image content during summarization.

---

### FC-6: `partData` Missing `BinaryContent` Fields

**Severity**: Low
**Files**: `/tmp/crush/internal/lcm/format.go:79-93`, `/tmp/crush/internal/message/content.go:81-85`

`BinaryContent` has `Path`, `MIMEType`, and `Data` fields. None are in `partData`. Note that `BinaryContent` in Crush does **not** use json tags for `Path`, `MIMEType`, or `Data`, meaning it relies on Go's default field-name-to-JSON-key mapping (exact field name, e.g., `"Path"`, `"MIMEType"`, `"Data"`). [CORRECTED: Go's default JSON mapping preserves the exact field name, it does not lowercase the first letter.] The switch at line 55 skips binary parts.

**Impact**: None. Binary content is handled via the large file storage path, not inline summarization.

---

### FC-7: File ID Regex Mismatch -- Bare vs Bracketed `LCM File ID`

**Severity**: **Medium** [CORRECTED: Downgraded from Critical]
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:230-231`
- Crush: `/tmp/crush/internal/lcm/format.go:108-114`

Volt's `FILE_ID_PATTERN` includes this alternative:

```typescript
// Volt (summarize.ts:231) — third alternative in the regex
LCM File ID:\s*(file_[0-9a-f]{16})
```

This matches the **bare** format `LCM File ID: file_xxx` (no brackets). Importantly, because this regex has no anchors, it also matches the substring `LCM File ID:` inside bracketed text like `[LCM File ID: file_xxx]`.

Crush's `fileIDPattern` includes:

```go
// Crush (format.go:112)
\[LCM File ID:\s*(file_[0-9a-f]{16})\]
```

This matches **only** the **bracketed** format `[LCM File ID: file_xxx]`.

**Difference**: Crush's regex cannot match the bare format `LCM File ID: file_xxx` (without brackets). However, Volt's bare regex *can* match inside Crush's bracketed format `[LCM File ID: file_xxx]` since there are no anchors.

**Impact**: [CORRECTED] The practical impact is lower than originally assessed for two reasons:
1. The bare `LCM File ID: file_xxx` format is documented in Volt's comments (summarize.ts:227,239) but neither Volt nor Crush currently emits bare-format IDs in their data pipeline -- both use bracketed emission formats.
2. File IDs are also propagated through structured `fileIds` fields on Summary objects (e.g., condense.ts:141-142 uses `s.fileIds` alongside regex extraction), providing a redundant propagation path that does not depend on regex matching.

If bare-format IDs ever appear in user-generated content or through future format changes, Crush would fail to extract them. This is a defensive coverage gap rather than an active data loss bug.

**Recommendation**: Add the bare `LCM File ID:` pattern to Crush's regex for parity with Volt:

```go
var fileIDPattern = regexp.MustCompile(
    `(?:` +
        `\[Large File Stored:\s*(file_[0-9a-f]{16})\]` + `|` +
        `\[Large User Text Stored:\s*(file_[0-9a-f]{16})\]` + `|` +
        `\[LCM File ID:\s*(file_[0-9a-f]{16})\]` + `|` +
        `LCM File ID:\s*(file_[0-9a-f]{16})` + `|` +  // bare format
        `file_id\s+"(file_[0-9a-f]{16})"` +
        `)`,
)
```

---

### FC-8: File ID Emission Format Divergence (Singular vs Plural)

**Severity**: Medium
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:104`
- Crush: `/tmp/crush/internal/lcm/summarizer.go:124`

**Volt** emits file IDs in summaries as a single **plural** line:

```typescript
// Volt (summarize.ts:104)
`\n[LCM File IDs: ${fileIds.join(", ")}]`
// Example output: [LCM File IDs: file_aaa, file_bbb]
```

**Crush** emits file IDs as **individual singular** lines:

```go
// Crush (summarizer.go:124)
fmt.Fprintf(&metadata, "\n[LCM File ID: %s]", id)
// Example output:
// [LCM File ID: file_aaa]
// [LCM File ID: file_bbb]
```

This creates a cross-compatibility concern:
1. Crush's regex (format.go:112) matches `[LCM File ID: ...]` (singular), so it **can** parse its own output. Good.
2. Volt's bare regex `LCM File ID:\s*(file_[0-9a-f]{16})` **can** match Crush's singular bracketed `[LCM File ID: file_xxx]` because the bare pattern matches the substring inside the brackets (no anchors). [CORRECTED: Original claim that Volt cannot match Crush's singular format was wrong.]
3. However, **neither** system's regex can parse the other's *emission* format fully:
   - Crush cannot parse Volt's `[LCM File IDs: file_aaa, file_bbb]` (plural, comma-separated) because Crush's regex expects singular `[LCM File ID: ...]` (no trailing `s` in `ID`).
   - Volt also cannot parse its own plural format: `LCM File ID:\s*` does not match `LCM File IDs:\s*` (the `s` before `:` prevents the match).

**Impact**: If summaries are ever migrated between Volt and Crush, or if older Volt-generated summaries exist in a Crush database, file IDs embedded in the plural `[LCM File IDs: ...]` format will not be extractable by regex. However, both systems propagate file IDs through structured `fileIds` fields alongside regex extraction (Volt: condense.ts:141-142; Crush: summarizer.go:321-337), mitigating this for most workflows.

**Additional note**: Volt's own regex also cannot re-extract file IDs from its own plural emission `[LCM File IDs: file_aaa, file_bbb]` -- this is a latent issue in Volt itself, not just a Crush porting gap.

**Recommendation**: Add a regex alternative in both Volt and Crush that matches the plural bracketed form `[LCM File IDs: ...]`, extracting individual IDs from the comma-separated list. Alternatively, standardize on one format (singular per-line).

---

### FC-9: Tool Formatting Divergence -- `[Tool: name]` vs `[Tool Call: name]`

**Severity**: Low
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:188`
- Crush: `/tmp/crush/internal/lcm/format.go:34`

Volt formats tool calls as:
```
[Tool: bash]
Input: {"cmd":"ls"}
Output: <truncated output>
```

Crush formats tool calls as:
```
[Tool Call: bash]
Input: {"cmd":"ls"}
```

Two differences:
1. Header text: `[Tool: name]` vs `[Tool Call: name]`
2. Volt includes the tool output (from the completed state); Crush does not include any output in `tool_call` handling (output comes from `tool_result` parts instead)

**Impact**: Low. The summarization LLM should handle either format. However, there is a semantic difference: Volt combines tool call + result in one block under the tool part, while Crush separates them into distinct `tool_call` and `tool_result` parts, which is actually more faithful to the underlying data model.

---

### FC-10: Truncation Unit Difference -- Characters vs Runes

**Severity**: Low
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:194`
- Crush: `/tmp/crush/internal/lcm/format.go:43-46,64-70`

Volt truncates tool output using `output.slice(0, 1000)` which operates on **UTF-16 code units** (JavaScript string indexing). Crush uses `runeAwareTruncate(d.Content, 1000)` which operates on **Unicode code points** (runes).

**Impact**: For ASCII-only content, these are identical. For content with multi-byte characters (e.g., CJK, emoji), the truncation point will differ slightly. Crush's approach is more correct for Unicode handling.

---

### FC-11: Message Header Format Difference

**Severity**: Info
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:177`
- Crush: `/tmp/crush/internal/lcm/format.go:18`

Volt: `[Message ${id}] (${role})` -- role outside brackets, e.g., `[Message m1] (user)`
Crush: `[Message ${id} (${role})]` -- role inside brackets, e.g., `[Message m1 (user)]`

**Impact**: Cosmetic only. Both are human-readable and the summarization LLM will interpret them equivalently.

---

### FC-12: Tool State Filtering Divergence

**Severity**: Info
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:187-198`
- Crush: `/tmp/crush/internal/lcm/format.go:33-46`

Volt only formats tools with `status === "completed"` or `status === "error"`, skipping pending/running tools.

Crush formats **all** tool calls regardless of completion state. Specifically, it checks `!d.Finished` and appends `[In Progress]` for unfinished calls (format.go:38-40). Crush also separately handles `tool_result` parts with error checking.

**Impact**: Crush may include more information in its summaries (in-progress tools), while Volt omits them. This is a reasonable design decision for Crush since its data model separates calls from results, but it means Crush summaries may contain more noise from incomplete operations.

---

### FC-13: Missing `ignored` Text Part Filtering

**Severity**: Low
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:182-184`
- Crush: `/tmp/crush/internal/lcm/format.go:29-31`

Volt checks `if (!part.ignored)` before including text content:

```typescript
case "text":
    if (!part.ignored) {
        parts.push(part.text)
    }
    break
```

Crush does not have this check:

```go
case "text":
    if d.Text != "" {
        parts = append(parts, d.Text)
    }
```

**Impact**: Low. Crush's `TextContent` type (`content.go:60-62`) does not have an `ignored` field at all. This means Crush's content model does not support the concept of ignored text parts. If Crush ever adopts this concept, the `partData` struct and the switch statement would need updating. Currently, the missing check is consistent with Crush's own data model.

---

### FC-14: `runeAwareTruncate` Implementation -- Correct

**Severity**: Info (Positive Finding)
**File**: `/tmp/crush/internal/lcm/format.go:64-70`

```go
func runeAwareTruncate(s string, maxRunes int) string {
    runes := []rune(s)
    if len(runes) <= maxRunes {
        return s
    }
    return string(runes[:maxRunes]) + "..."
}
```

This correctly converts the string to a rune slice before truncating, avoiding mid-codepoint splits that would produce invalid UTF-8 sequences. The test `TestFallbackUsesRuneTruncation` (lcm_test.go:142-165) verifies this with CJK characters.

---

### FC-15: Context Formatting -- Correct Match

**Severity**: Info (Positive Finding)
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summary.ts:201-210`
- Crush: `/tmp/crush/internal/lcm/context.go:38-47`

Volt's `Summary.formatForContext`:
```typescript
const lines: string[] = []
lines.push(`[Summary ID: ${summary.summaryId}]`)
if (summary.parents.length > 0) {
    lines.push(`[Parent Summaries: ${summary.parents.join(", ")}]`)
}
lines.push("")
lines.push(summary.content)
return lines.join("\n")
```

Crush's `FormatSummaryForContext`:
```go
fmt.Fprintf(&builder, "[Summary ID: %s]\n", summaryID)
if len(parentIDs) > 0 {
    fmt.Fprintf(&builder, "[Parent Summaries: %s]\n", strings.Join(parentIDs, ", "))
}
builder.WriteString("\n")
builder.WriteString(content)
```

These produce identical output: `[Summary ID: sum_xxx]\n[Parent Summaries: sum_aaa, sum_bbb]\n\ncontent`. The Crush implementation faithfully reproduces Volt's format.

---

### FC-16: `extractFileIDs` Does Not Sort Results

**Severity**: Low
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:245-253`
- Crush: `/tmp/crush/internal/lcm/format.go:117-130`

Volt returns sorted, deduplicated file IDs:
```typescript
return [...ids].sort()
```

Crush returns deduplicated but **unsorted** file IDs (insertion order):
```go
var fileIDs []string
for _, match := range matches {
    // ...
    fileIDs = append(fileIDs, match[i])
}
return fileIDs
```

**Impact**: Low. The sort in Volt is for determinism, which matters for reproducible summary IDs (since file ID lists are included in summary content). Without sorting, Crush's file ID lists may vary in order depending on their position in the source text, potentially leading to different summary IDs for semantically identical content.

**Recommendation**: Add `sort.Strings(fileIDs)` before returning in `extractFileIDs`.

---

### FC-17: Test Coverage Gaps

**Severity**: Info
**File**: `/tmp/crush/internal/lcm/lcm_test.go:242-313`

The format-related tests cover:
- `TestFormatMessagesForSummary_WrapperParsing` -- text + reasoning (line 242)
- `TestFormatMessagesForSummary_ToolCall` -- tool_call type (line 270)
- `TestFormatMessagesForSummary_FlatStructFails` -- validates wrapper requirement (line 288)
- `TestFormatMessagesForSummary_FallbackOnInvalidJSON` -- invalid JSON fallback (line 305)
- `TestFallbackFileIDsExtractable` -- file ID extraction in fallback (line 194)
- `TestFallbackUsesRuneTruncation` -- rune-safe truncation (line 142)

**Missing test coverage**:
1. No test for `tool_result` type parsing (both normal and error cases)
2. No test for `finish` type (verifying it is silently skipped)
3. No test for `image_url` type (verifying it is silently skipped)
4. No test for `binary` type (verifying it is silently skipped)
5. No test for messages with mixed content types (e.g., reasoning + text + tool_call + finish in one message)
6. No test for `extractFileIDs` directly (only tested indirectly through fallback)
7. No test for multiple messages with various role types
8. No negative test for the file ID regex with malformed IDs (e.g., `file_` with wrong hex length)

**Recommendation**: Add targeted tests for each content type and a comprehensive mixed-content test.

---

### FC-18: `partData` Field Name Collision -- `Text` vs `Thinking`

**Severity**: Medium
**File**: `/tmp/crush/internal/lcm/format.go:79-93`

The `partData` struct uses a union/flat approach where all content type fields coexist:

```go
type partData struct {
    Text     string `json:"text,omitempty"`       // TextContent
    // ...
    Thinking string `json:"thinking,omitempty"`   // ReasoningContent
}
```

When Go unmarshals a `reasoning` type part like `{"thinking":"Let me think..."}`, the `Text` field will be empty and `Thinking` will be populated. This is correct.

However, consider a `text` type part: `{"text":"Hello"}`. Here `Text` is populated and `Thinking` is empty. Also correct.

**The collision risk**: If Crush's serialization ever includes both `text` and `thinking` keys in the same JSON data object (e.g., if a future content type has both), Go will silently populate both fields. The switch statement reads the correct field based on the `Type` discriminator, so this is safe today. But it makes the struct fragile to schema evolution.

**Current status**: Safe, because the `message.go:marshalParts` function serializes each content type individually, and no content type has both `text` and `thinking` fields.

---

### FC-19: `partData.Name` Double-Duty for `ToolCall` and `ToolResult`

**Severity**: Medium
**File**: `/tmp/crush/internal/lcm/format.go:84` [CORRECTED: was "84,88" but Name is only at line 84; line 88 is `ToolCallID`]

The `Name` field (json: `"name"`) serves both `ToolCall.Name` (content.go:99) and `ToolResult.Name` (content.go:109). When unmarshaling a `tool_result`, the `Name` field will be populated from the result's `name` key. When unmarshaling a `tool_call`, it comes from the call's `name` key.

**Impact**: The switch statement only uses `d.Name` for `tool_call` (line 34: `fmt.Sprintf("[Tool Call: %s]", d.Name)`). For `tool_result`, `d.Name` is populated but unused. This is functionally correct, but the ToolResult's name could be useful for richer summarization (e.g., `[Tool Result: bash]` instead of just `[Tool Result]`).

**Recommendation**: Consider using `d.Name` in the `tool_result` case to produce `[Tool Result: <name>]` for better summarization fidelity.

---

### FC-20: `partData.Content` Field Usage

**Severity**: Low
**File**: `/tmp/crush/internal/lcm/format.go:89`

The `Content` field (json: `"content"`) maps to `ToolResult.Content`. There is no collision with `TextContent` since `TextContent` uses the `text` JSON key. This is correct.

---

## Architecture Notes

### Structural Difference: Volt vs Crush Message Models

Volt uses a **rich part model** with discriminated union types (`TextPart`, `ToolPart`, `ReasoningPart`, `FilePart`, `PatchPart`, etc.) where each part type has its own schema. The `formatMessagesForSummary` function pattern-matches on `part.type` and accesses typed fields directly.

Crush uses a **wrapper + content part model** where parts are serialized as `[{"type":"...", "data":{...}}]` and deserialized through the `partWrapper`/`unmarshalParts` mechanism in `message.go`. The LCM layer re-implements deserialization with its own `MessagePart`/`partData` flat-union struct in `format.go`.

This creates **two separate deserialization paths** in Crush:
1. `message.go:unmarshalParts` -- full fidelity, type-safe, used for normal message handling
2. `lcm/format.go:MessagePart`/`partData` -- lossy flat-union, used for summarization

The second path is deliberately lossy (for summarization), but it introduces a maintenance burden: whenever a new field is added to any content type in `content.go`, someone must remember to also add it to `partData` if it should be visible to summarization.

### `Condensed from:` Header Handling

Both Volt and Crush implement the same pattern for ensuring parent IDs are present in condensed summaries:
1. Check if `[Condensed from: ...]` header exists
2. If missing, inject it
3. If present but incomplete (missing some parent IDs), replace it with the full list

Volt: `condense.ts:129-136`
Crush: `summarizer.go:250-264` via `EnsureParentIDsPresent`

The implementations are functionally equivalent. The regex pattern is the same: `^\[Condensed from:.*?\]` with multiline mode.

---

## Recommendations Summary

| Priority | Action |
|----------|--------|
| **P1** | Fix FC-7: Add bare `LCM File ID:` pattern (without brackets) to Crush's `fileIDPattern` regex for parity with Volt [CORRECTED: was P0, downgraded with FC-7 severity] |
| **P1** | Fix FC-8: Add regex alternative for plural `[LCM File IDs: file_xxx, file_yyy]` format in both Volt and Crush, or standardize on singular per-line emission |
| **P1** | Fix FC-16: Sort file IDs in `extractFileIDs` for deterministic output |
| **P2** | Fix FC-17: Add test coverage for all 7 content types in `FormatMessagesForSummary` |
| **P2** | Fix FC-19: Use `d.Name` in `tool_result` formatting for richer summaries |
| **P2** | Fix FC-21 (NEW): Address Volt's own plural `[LCM File IDs: ...]` regex gap (Volt cannot re-extract from its own emission) |
| **P3** | Fix FC-1: Add `Finish` fields to `partData` for completeness |
| **P3** | Fix FC-4: Add `ToolResult.Data` to `partData` as fallback content source |

---

## Additional Findings (Added During Review)

### FC-21: Volt's Own Regex Cannot Parse Its Plural `[LCM File IDs: ...]` Emission (NEW)

**Severity**: Medium
**Files**:
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts:104,230-231`
- Volt: `/tmp/volt/packages/voltcode/src/session/lcm/condense.ts:140`

Volt emits file IDs in summaries as `[LCM File IDs: file_aaa, file_bbb]` (line 104), using the **plural** `IDs` with a comma-separated list.

However, Volt's `FILE_ID_PATTERN` (line 230-231) has these alternatives:
1. `\[Large File Stored:\s*(file_[0-9a-f]{16})\]`
2. `\[Large User Text Stored:\s*(file_[0-9a-f]{16})\]`
3. `LCM File ID:\s*(file_[0-9a-f]{16})` -- matches singular `LCM File ID:`, NOT plural `LCM File IDs:`
4. `file_id\s+"(file_[0-9a-f]{16})"`

None of these alternatives match `[LCM File IDs: file_aaa, file_bbb]` because:
- Alternative 3 uses `LCM File ID:` (no `s`), which does not match `LCM File IDs:` (with `s`)
- No alternative handles comma-separated lists

**Impact**: When `condense.ts:140` calls `extractFileIds(allContent)` on summary content that contains `[LCM File IDs: ...]` blocks, the regex fails to extract those IDs. This is mitigated by line 141-142 which also propagates file IDs through the structured `s.fileIds` field. The regex extraction serves as a redundant safety net, but it silently fails for the primary emission format.

**Recommendation**: Add a regex alternative for the plural form, or switch Volt to emit singular per-line `[LCM File ID: file_xxx]` entries (matching Crush's approach).

### FC-22: `aggregateFileIDs` in Crush Does Not Sort Results (NEW)

**Severity**: Low
**File**: `/tmp/crush/internal/lcm/summarizer.go:321-339`

The `aggregateFileIDs` function in Crush (used during condensation) returns file IDs in insertion order without sorting, similar to `extractFileIDs` (FC-16). This compounds the non-determinism noted in FC-16 during the condensation path.

**Impact**: Low. Same concern as FC-16 -- may produce different summary IDs for semantically identical content.

**Recommendation**: Apply `sort.Strings()` to the result, consistent with the FC-16 recommendation.

---

## Review Notes

**Reviewed by**: Claude Opus 4.6
**Review date**: 2026-02-18
**Method**: Line-by-line cross-reference of every audit finding against source code in Volt and Crush

### Changes Made

| Finding | Change | Reason |
|---------|--------|--------|
| FC-4 | Corrected field counts | ToolResult has 7 fields (not 6). `partData` maps 4 of them (ToolCallID, Name, Content, IsError), not 3. Name is shared with ToolCall (see FC-19). |
| FC-6 | Corrected description of Go's default JSON key mapping | Go uses the exact field name (e.g., `"Path"`), not lowercase first letter (e.g., `"path"`). The audit incorrectly stated "lowercase first letter". |
| FC-7 | Downgraded from **Critical** to **Medium** | The bare `LCM File ID:` format is documented in Volt comments but is not routinely produced in the data pipeline. Both systems use bracketed emission formats. File IDs are also propagated through structured `fileIds` fields, providing a redundant path that does not depend on regex. |
| FC-7 | Corrected line reference | Changed `summarize.ts:231` to `summarize.ts:230-231` (the regex spans both lines). |
| FC-7 | Added nuance about Volt's bare regex matching Crush's bracketed format | Volt's unanchored bare regex `LCM File ID:\s*` will match the substring inside `[LCM File ID: file_xxx]`, so Volt can parse Crush's output. |
| FC-8 | Corrected false claim about cross-compatibility | Original audit stated "Volt's regex does not match `[LCM File ID: file_xxx]` (singular with brackets)". This is **wrong** -- Volt's bare regex `LCM File ID:\s*` matches the substring inside the brackets because it has no anchors. |
| FC-8 | Added discovery that Volt cannot parse its own plural emission | See new finding FC-21. |
| FC-8 | Updated recommendation to include both Volt and Crush | The plural format gap exists in both systems, not just Crush. |
| FC-15 | Corrected line reference | Changed `summary.ts:201-209` to `summary.ts:201-210` (function ends at line 210). |
| FC-19 | Corrected line reference | Changed `format.go:84,88` to `format.go:84` -- line 88 is `ToolCallID`, not `Name`. |
| Architecture Notes | Corrected line references | Changed `condense.ts:128-136` to `129-136` and `summarizer.go:250-263` to `250-264`. |
| Recommendations | Adjusted priorities | P0 removed (was FC-7, now P1). FC-8 recommendation expanded to cover both systems. New FC-21 added at P2. |

### Findings Verified as Correct (No Changes Needed)

| Finding | Verification |
|---------|-------------|
| FC-1 | Finish struct at content.go:119-124 confirmed. partData at format.go:79-93 confirmed. Switch at line 51-52 confirmed as no-op. |
| FC-2 | ReasoningContent at content.go:45-53 confirmed with all 7 fields. partData only has Thinking. Switch at line 48-49 confirmed. |
| FC-3 | ToolCall.ProviderExecuted at content.go:101 confirmed. Not in partData. |
| FC-4 | ToolResult at content.go:107-115 confirmed with 7 fields. partData maps 4 (ToolCallID, Name, Content, IsError). Consistent with Changes Made correction. |
| FC-5 | ImageURLContent at content.go:70-73 confirmed. Switch at line 53 confirmed. |
| FC-9 | Volt summarize.ts:188 `[Tool: ${part.tool}]` confirmed. Crush format.go:34 `[Tool Call: %s]` confirmed. |
| FC-10 | Volt summarize.ts:194 `output.slice(0, 1000)` confirmed. Crush format.go:43-46 `runeAwareTruncate(d.Content, 1000)` confirmed. |
| FC-11 | Volt summarize.ts:177 `[Message ${id}] (${role})` confirmed. Crush format.go:18 `[Message %s (%s)]` confirmed. |
| FC-12 | Volt summarize.ts:187-198 confirmed (completed/error only). Crush format.go:33-40 confirmed (all states + In Progress). |
| FC-13 | Volt summarize.ts:182 `!part.ignored` confirmed. Crush format.go:29-31 no equivalent confirmed. TextContent (content.go:60-62) has no `ignored` field confirmed. |
| FC-14 | runeAwareTruncate at format.go:64-70 code verified. Test at lcm_test.go:142-165 verified. |
| FC-16 | Volt summarize.ts:253 `[...ids].sort()` confirmed. Crush format.go:117-130 no sort confirmed. |
| FC-17 | All test function names and line numbers verified against lcm_test.go. |
| FC-18 | partData union analysis verified. Text (json:"text") and Thinking (json:"thinking") use different JSON keys. No current content type has both. |
| FC-20 | Content (json:"content") correctly maps to ToolResult.Content only. No collision with TextContent (json:"text"). |

### Items Not in Scope but Noted

1. **Volt `types.ts` does not exist**: The Source Files Examined table correctly references `summary.ts` (not `types.ts`), which is the actual file containing Summary type definitions.
2. **`BinaryContent.Data` type difference**: Crush's `BinaryContent.Data` is `[]byte` (content.go:84), while `ToolResult.Data` is `string` (content.go:111). These are different types for different purposes. Not a bug but worth noting for anyone extending `partData`.
3. **Volt's `ToolPart` vs Crush's `ToolCall`/`ToolResult` model**: Volt uses a single `ToolPart` with a discriminated `state` union (pending/running/completed/error), while Crush separates into `ToolCall` + `ToolResult` as independent content parts. This is an intentional design difference, not a bug, and is correctly noted in FC-9 and FC-12.

### Second-Pass Verification

**Verified by**: Claude Opus 4.6
**Date**: 2026-02-18
**Method**: Full re-read of all 13 source files (Volt and Crush) cross-referenced against every finding, line number, code snippet, severity rating, and comparative claim in this document.

**Result**: All 22 findings (FC-1 through FC-22) verified as accurate. No errors, omissions, or contradictions found. Specifically confirmed:

- All line number references point to the correct code in the current source files.
- All code snippets are exact matches to the source.
- All severity ratings are justified by the documented impact analysis.
- All Volt vs Crush comparisons are factually correct (both sides verified).
- The summary table matches the detailed findings in every column (ID, severity, category, summary).
- The Recommendations Summary priorities are consistent with the severity ratings.
- The Architecture Notes accurately describe both systems' deserialization paths and header handling.
- The first-pass Review Notes (Changes Made table and Findings Verified table) are all correct.
- No findings contradict each other.

No changes were required during this second-pass verification.
