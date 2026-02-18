# Audit Report: Summarizer & Compaction Logic (Volt -> Crush Port)

**Audit Date:** 2026-02-18
**Scope:** Escalation levels, compaction loop, target formulas, progress checks, token budget computation, summarization flow
**Volt (Source):** TypeScript / PostgreSQL
**Crush (Target):** Go / SQLite

---

## Summary Table

| ID | Severity | Category | Title | Status |
|----|----------|----------|-------|--------|
| SC-1 | **HIGH** | Token Estimation | Volt uses `string.length` (byte-ish), Crush uses `len([]rune(s))` (rune count) | Divergence |
| SC-2 | **HIGH** | Summary ID Generation | Completely different hashing inputs (content+timestamp vs. message fields) | Divergence |
| SC-3 | **HIGH** | Compaction Architecture | Volt has single-pass + re-check loop; Crush has iterative loop with target formula | Divergence |
| SC-4 | **HIGH** | File ID Appending | Volt appends `[LCM File IDs: ...]` as a batch; Crush appends individual `[LCM File ID: ...]` lines | Divergence |
| SC-5 | **MEDIUM** | Reserve Computation | Volt uses `min(base, model.limit.output, floor(context*0.25))`; Crush uses `min(20000, contextWindow/4)` | Divergence |
| SC-6 | **MEDIUM** | Compaction Target Formula | Crush introduces `target = softThreshold * (100 - TargetFreePercent) / 100`; Volt defines `TARGET_FREE_PERCENTAGE` but never uses it (dead code) | Divergence |
| SC-7 | **MEDIUM** | Escalation Error Handling | Crush loses Level 1 errors silently; Volt falls through after checking token counts | Bug |
| SC-8 | **MEDIUM** | Prompt Architecture | Volt uses system+user message pair; Crush uses `{{messages}}` placeholder substitution | Divergence |
| SC-9 | **MEDIUM** | Aggressive Summarization MaxTokens | Crush sets `MaxTokens: 500` for aggressive; Volt sets no explicit max_tokens | Divergence |
| SC-10 | **MEDIUM** | Condensation Aggressive MaxTokens | Crush sets `MaxTokens: 600`; Volt sets no explicit max_tokens | Divergence |
| SC-11 | **MEDIUM** | Fallback Metadata Reserve | Crush reserves 100 tokens for metadata (`FallbackMetadataReserve`); Volt does not | Addition |
| SC-12 | **LOW** | File ID Extraction from Messages | Volt extracts from formatted text; Crush extracts from raw `msg.Content` | Divergence |
| SC-13 | **LOW** | Condensation File ID Format | Volt appends single `[LCM File IDs: ...]` line; Crush appends individual lines | Divergence |
| SC-14 | **LOW** | Soft Threshold Default | Both use 60%, but Crush uses integer percent (60) while Volt uses `Math.floor(contextWindow * 0.6)` | Equivalent |
| SC-15 | **LOW** | `extractFileIDs` sorting | Volt returns sorted+deduplicated array; Crush returns insertion-order deduplicated array | Divergence |
| SC-16 | **LOW** | Compaction Manager: Duplicate Handling | Crush closes the result channel and returns nil; Volt returns null | Equivalent |
| SC-17 | **INFO** | `context.WithoutCancel` | Crush uses `context.WithoutCancel` for background compaction (correct Go pattern) | OK |
| SC-18 | **INFO** | Constants Match | `MinMessagesToSummarize=3`, `MaxCompactionRounds=10`, `FallbackMaxTokens=512` all match | OK |
| SC-19 | **MEDIUM** | Progress Check Strictness | Crush uses `>=` (no progress if equal); Volt uses `>=` too but also checks `!result.actionTaken` | Divergence |
| SC-20 | **LOW** | Unused `CRITICAL_THRESHOLD_MULTIPLIER` | Volt defines 1.2x critical threshold constant but never uses it; Crush has no equivalent | Equivalent |
| SC-21 | **MEDIUM** | Condensation Batch Size | Crush hardcodes batch of 5 oldest summaries; Volt condenses ALL summaries in context | Divergence |
| SC-22 | **MEDIUM** | `shouldSummarizeMessages` Deadlock Risk | Crush returns error when insufficient items exist; can stall the compaction loop | Bug |
| SC-23 | **LOW** | Summary `Parents` field missing from Crush type | Volt `Summary.Info` has `parents` array; Crush `Summary` struct has no `Parents` field | Omission |
| SC-24 | **LOW** | Compaction Loop Indexing | Crush uses 0-indexed rounds (0-9); Volt uses 1-indexed (1-10) | Divergence |
| SC-25 | **MEDIUM** | File IDs Not Appended to Normal/Aggressive Content in Crush | Crush only appends file IDs to content text in fallback (summarization and condensation); Volt appends in all levels | Divergence |
| SC-26 | **LOW** | Volt Regex Cannot Match Own Plural File ID Format | `LCM File ID:` regex does not match `LCM File IDs:` that Volt writes | Bug |
| SC-27 | **INFO** | `DEFAULT_OUTPUT_RESERVE` Missing from Constants Table | Both use 20000 but not listed in SC-18 | OK |

---

## Detailed Findings

---

### SC-1: Token Estimation Divergence [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/util/token.ts`, lines 4-6):
```typescript
export function estimate(input: string) {
  return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
}
```
Uses `string.length` which in JavaScript returns the number of UTF-16 code units. For ASCII this equals byte count. For multi-byte characters (e.g., CJK, emoji), this gives a value between rune count and byte count (since JS strings are UTF-16). Additionally, Volt wraps the result in `Math.max(0, ...)` to guard against negative values, while Crush has no such guard (though integer division of non-negative values cannot be negative anyway).

**Crush** (`/tmp/crush/internal/lcm/config.go`, line 47):
```go
func EstimateTokenCount(content string) int {
    if content == "" {
        return 0
    }
    return len([]rune(content)) / CharsPerToken
}
```
Uses `len([]rune(content))` which gives Unicode code point count. This is strictly less than or equal to JS `string.length` for any string containing surrogate pairs (emoji with combined characters, etc.).

**Impact:** For predominantly ASCII content (code), the difference is negligible. For CJK or emoji-heavy content, Crush will estimate fewer tokens than Volt for the same content. Additionally, Volt uses `Math.round` (rounding to nearest integer) while Crush uses integer division (floor). For a 5-character string: Volt gives `round(5/4) = 1`, Crush gives `5/4 = 1` (same). For a 6-character string: Volt gives `round(6/4) = round(1.5) = 2`, Crush gives `6/4 = 1` (different).

**Recommendation:** Decide whether byte-length or rune-length semantics are desired. If porting Volt faithfully, use `len(content)` (byte length) in Go instead of `len([]rune(content))`. Also add rounding: `(len(content) + CharsPerToken/2) / CharsPerToken`.

---

### SC-2: Summary ID Generation Divergence [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summary.ts`, line 117-124):
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
Volt hashes `content + timestamp` -- deterministic given the same summary text and timestamp.

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, line 266-273):
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
Crush hashes `createdAt|role|content` for each message -- deterministic given the same input messages.

**Impact:** The ID generation algorithms are fundamentally different. Volt derives the ID from the **output** (summary content + timestamp), while Crush derives it from the **input** (source messages). This means:
- Same messages summarized at different times produce different IDs in Volt but the same ID in Crush.
- Different LLM outputs for the same messages produce different IDs in Volt but the same ID in Crush.
- If a summary is re-generated (retry), Crush will produce a colliding ID while Volt will not (different timestamp).

For condensed summaries, Crush hashes parent summary IDs (`generateCondensedID`), while Volt hashes the condensed content + timestamp. Same fundamental divergence.

**Recommendation:** This is a design choice with trade-offs. Crush's approach is more truly deterministic (idempotent for same input), but risks ID collisions on re-summarization with different LLM outputs. Volt's approach avoids collisions but is not idempotent. Document the chosen semantics explicitly.

---

### SC-3: Compaction Architecture Divergence [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 319-546 `onContextThresholdReached`, lines 776-920 `compactUntilUnderLimit`):

Volt's compaction has two layers:
1. **`onContextThresholdReached`** -- a single pass that: (a) summarizes messages, (b) replaces them, (c) checks if still over threshold, (d) if yes, condenses all summaries. This is a single-pass strategy, not a loop.
2. **`compactUntilUnderLimit`** -- a loop that repeatedly calls `onContextThresholdReached` with `force: true`, up to `MAX_COMPACTION_ROUNDS`. This is the iterative compaction loop that checks for progress.

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, lines 21-67 `CompactContext`):

Crush has a single `CompactContext` loop that:
1. Computes a **target** (`softThreshold * (100 - TargetFreePercent) / 100`).
2. Checks if `currentTokens <= target` (done condition).
3. Decides whether to summarize messages or condense summaries (`shouldSummarizeMessages`).
4. Executes one of those operations.
5. Checks progress and loops.

**Key Differences:**
- Volt's single pass always tries summarization first, then condensation if still over threshold. Crush decides one or the other per round based on message count.
- Volt's compaction target is the soft threshold itself; Crush targets `softThreshold * 75/100` (25% below soft threshold).
- Volt condenses ALL summaries at once; Crush condenses at most 5 oldest summaries per round.
- Volt has `force: true` parameter for hard-limit compaction loops; Crush has no such concept -- the target formula handles it.

**Impact:** The overall behavior should be similar (iterative compaction), but the strategies differ significantly. Crush's approach of targeting below the soft threshold is more conservative (compacts more aggressively), which could lead to over-compaction but ensures more headroom.

---

### SC-4: File ID Format in Summaries [HIGH]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, lines 103-104):
```typescript
const finalContent =
    fileIds.length > 0 ? summaryContent + `\n[LCM File IDs: ${fileIds.join(", ")}]` : summaryContent
```
Volt appends a **single line**: `[LCM File IDs: file_aaa, file_bbb, file_ccc]`

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 122-125):
```go
var metadata strings.Builder
for _, id := range fileIDs {
    fmt.Fprintf(&metadata, "\n[LCM File ID: %s]", id)
}
```
Crush appends **one line per file ID**: `[LCM File ID: file_aaa]\n[LCM File ID: file_bbb]`

**Impact:** The `extractFileIDs` regex in Crush (`format.go` line 108) matches `\[LCM File ID:\s*(file_[0-9a-f]{16})\]` -- this matches individual `[LCM File ID: ...]` lines but does **NOT** match the Volt-style `[LCM File IDs: file_aaa, file_bbb]` (note the plural "IDs" and comma-separated list). Volt's regex uses `LCM File ID:\s*(file_[0-9a-f]{16})` (without surrounding brackets), which matches the singular `[LCM File ID: ...]` pattern from Crush (the regex matches the substring within the brackets). However, neither Volt's nor Crush's regex matches the plural `[LCM File IDs: file_aaa, file_bbb]` format that Volt writes -- Volt's regex requires `LCM File ID:` (singular) immediately followed by a single file ID, while the plural form has `LCM File IDs:` (with trailing "s"). So:
- Crush can extract IDs from its own format: YES
- Crush can extract IDs from Volt-format summaries: NO (the plural `[LCM File IDs: ...]` pattern is not in Crush's regex)
- Volt can extract IDs from Crush-format summaries: YES (via unbracketed `LCM File ID:` pattern)
- Volt can extract IDs from its OWN `[LCM File IDs: ...]` format: **NO** (the plural "IDs" doesn't match the singular "ID:" regex)

The last point means Volt's regex cannot re-extract file IDs from its own summary output text. This is likely by design since file IDs are stored structurally in the `fileIds` array, but it is worth noting.

More importantly, the normal and aggressive summarization in Crush (`summarizeNormal`, lines 77-84; `summarizeAggressive`, lines 101-108) do NOT append file IDs to the content at all -- they only set the `FileIDs` field on the struct. Only the fallback level appends them to text. In contrast, Volt appends `[LCM File IDs: ...]` to the content in all three levels (normal, aggressive, and fallback). This is an inconsistency between the systems and within Crush itself.

**Recommendation:** Align the file ID format. Add the `[LCM File IDs: ...]` (plural) pattern to Crush's regex or change Crush to use the singular format consistently.

---

### SC-5: Reserve Computation Divergence [MEDIUM]

**Volt** (`/tmp/volt/packages/voltcode/src/session/token-budget.ts`, lines 126-129):
```typescript
export function outputReserve(model: Provider.Model): number {
    const base = (model.limit as any).output_reserve ?? DEFAULT_OUTPUT_RESERVE
    return Math.min(base, model.limit.output, Math.floor(model.limit.context * 0.25))
}
```
The reserve is `min(output_reserve_or_20000, model.limit.output, floor(context * 0.25))`. This is model-aware and considers the model's output limit.

**Crush** (`/tmp/crush/internal/lcm/config.go`, lines 87):
```go
reserve := min(20_000, contextWindow/4)
```
The reserve is simply `min(20000, contextWindow/4)`. No model output limit consideration.

**Impact:** For large-context models with low output limits (e.g., context=200K, output=4K), Volt would use `min(20000, 4000, 50000) = 4000`, while Crush would use `min(20000, 50000) = 20000`. This means Crush over-reserves by 16K tokens, reducing the effective hard limit. For standard models (output >= 20K), both converge to the same value.

**Recommendation:** Add model output limit awareness to Crush's `ComputeTokenBudget` if model metadata is available.

---

### SC-6: Compaction Target Formula [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, line 33):
```go
target := budget.SoftThreshold * (100 - TargetFreePercent) / 100
```
This computes `target = softThreshold * 75/100`. With `TargetFreePercent = 25`, the compaction continues until tokens are at 75% of the soft threshold.

**Volt** has no equivalent target formula. The `compactUntilUnderLimit` loop (`context.ts` line 870) checks `recheck.currentTokens <= recheck.hardLimit` (comparing against hard limit). The `onContextThresholdReached` function checks `overSoft` (comparing against soft threshold). Volt defines `TARGET_FREE_PERCENTAGE = 0.25` (`context.ts` line 123) but this constant is **never referenced anywhere in the codebase** -- it is dead code. Volt does NOT use a target-below-threshold approach at all.

**Impact:** Crush compacts more aggressively than Volt. Given `softThreshold = 73800`, Crush targets `73800 * 75/100 = 55350`. Volt would stop as soon as tokens drop below the soft threshold (73800) or hard limit (105000), depending on which loop is running. This means Crush will run more compaction rounds, consuming more LLM calls, but will have more headroom before the next compaction trigger.

**Recommendation:** This is an intentional design choice in Crush but should be documented. The `TargetFreePercent` constant in Crush is actively used to compute a compaction target, while the equivalent `TARGET_FREE_PERCENTAGE` constant in Volt is dead code (defined but never referenced). This is a new behavior in Crush, not a port of existing Volt logic.

---

### SC-7: Escalation Error Handling [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 33-62):
```go
func (s *EscalationSummarizer) SummarizeMessages(
    ctx context.Context, messages []LCMMessage,
) (*Summary, error) {
    inputTokens := calculateInputTokens(messages)

    // Level 1: Normal
    summary, err := s.summarizeNormal(ctx, messages)
    if err == nil && summary.TokenCount < inputTokens {
        return summary, nil
    }
    lastGoodOutput := summary    // <-- summary could be nil if err != nil

    // Level 2: Aggressive
    summary, err = s.summarizeAggressive(ctx, messages)
    if err == nil && summary.TokenCount < inputTokens {
        return summary, nil
    }
    if err == nil {
        lastGoodOutput = summary
    }

    // Level 3: Fallback
    if lastGoodOutput == nil {
        return nil, fmt.Errorf("all summarization levels failed (no output produced)")
    }
    return s.summarizeFallback(lastGoodOutput.Content, messages)
}
```

When Level 1 fails with an error, `summary` is nil but is assigned to `lastGoodOutput`. When Level 2 also fails, `lastGoodOutput` remains nil, and the function returns an error. This is correct.

However, when Level 1 **succeeds but is too large** (`err == nil && summary.TokenCount >= inputTokens`), `lastGoodOutput` is set to the Level 1 output. If Level 2 then **fails with an error**, `lastGoodOutput` still has Level 1's output, and fallback is called with it. This is acceptable behavior.

But there is a subtle issue: Level 1 errors are silently discarded. In Volt, the escalation is only triggered by the size check (`leafSummary.tokenCount >= inputTokens`), and errors propagate upward. In Crush, an LLM error at Level 1 causes silent escalation to Level 2.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 434-445):
```typescript
// Level 1: Normal summarization
let leafSummary = await LcmSummarize.summarize(summarizeParams)
let summarizationLevel = "normal"

// Convergence check: summary must be strictly smaller than input
if (leafSummary.tokenCount >= inputTokens) {
    // ...
    // Level 2: Aggressive
    leafSummary = await LcmSummarize.summarizeAggressive(summarizeParams)
```
If `LcmSummarize.summarize()` throws, the error propagates upward -- there is no escalation on error, only on size.

**Impact:** In Crush, a transient LLM error at Level 1 causes silent fallback to Level 2 instead of reporting the error. This could mask configuration issues, API problems, or rate limiting.

**Recommendation:** Log the Level 1 error before escalating, or propagate errors rather than treating them as escalation triggers.

---

### SC-8: Prompt Architecture Divergence [MEDIUM]

**Volt** uses the AI SDK's `generateText` with a `messages` array containing a `system` role message and a `user` role message:
```typescript
const result = await generateText({
    model: language,
    messages: [
        { role: "system", content: SUMMARIZE_PROMPT },
        { role: "user", content: `<messages>\n${formattedMessages}\n</messages>` },
    ],
})
```

**Crush** uses a `{{messages}}` template replacement:
```go
func buildPrompt(template, input string) string {
    return strings.ReplaceAll(template, "{{messages}}", input)
}
```
The entire prompt (system instructions + messages) is sent as a single string via `LLMRequest.Prompt`.

**Impact:** Volt properly separates system instructions from user content, which most LLM APIs prefer. Crush concatenates them into a single prompt string. The Crush `LLMClient.Generate` interface would need to handle proper role separation at the transport layer, or the prompt quality may degrade depending on the LLM API being used.

Additionally, Volt wraps messages in `<messages>` XML tags, while Crush relies on the `{{messages}}` placeholder substitution without any XML wrapping, which changes how the LLM interprets the boundary between instructions and content.

**Recommendation:** If the Crush LLM client sends the prompt as a single user message, add XML wrapping. If it splits into system+user, document the expected behavior.

---

### SC-9: Aggressive Summarization MaxTokens [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 92-96):
```go
response, err := s.llmClient.Generate(ctx, LLMRequest{
    Model:     s.model,
    Prompt:    prompt,
    MaxTokens: 500,
})
```

**Volt** does not set `maxTokens` on the aggressive summarization call. The LLM is free to produce any length output; the convergence check `tokenCount >= inputTokens` determines if escalation is needed.

**Impact:** Crush's `MaxTokens: 500` hard-caps the LLM output, which forces brevity but may cause truncation of important content for large inputs. Volt relies on the aggressive prompt to produce shorter output naturally. The 500-token limit is lower than the aggressive prompt's suggested target of "200-500 tokens", which could cause mid-sentence truncation.

---

### SC-10: Aggressive Condensation MaxTokens [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 197-200):
```go
response, err := s.llmClient.Generate(ctx, LLMRequest{
    Model:     s.model,
    Prompt:    prompt,
    MaxTokens: 600,
})
```

**Volt** does not set `maxTokens` on the aggressive condensation call either.

**Impact:** Same as SC-9. The 600-token limit aligns with the aggressive condense prompt's "Target 300-600 tokens" guideline but risks truncation.

---

### SC-11: Fallback Metadata Reserve [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/config.go`, lines 32 and 35):
```go
const FallbackMaxTokens = 512        // line 32
const FallbackMetadataReserve = 100   // line 35
```

Used in fallback truncation (`summarizer.go` line 114):
```go
maxRunes := (FallbackMaxTokens - FallbackMetadataReserve) * CharsPerToken
```
So content is truncated to `(512 - 100) * 4 = 1648` runes, leaving 100 tokens (~400 chars) for metadata lines.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, lines 379, 406):
```typescript
const FALLBACK_MAX_TOKENS = 512
const maxChars = FALLBACK_MAX_TOKENS * 4  // 2048 chars
```
Volt truncates to `512 * 4 = 2048` chars with **no metadata reserve**. The metadata (file IDs, truncation notice) is appended after the 2048-char limit, so the total output can exceed 512 tokens.

**Impact:** Volt's fallback may produce output exceeding the nominal 512-token budget. Crush's approach is more conservative and guarantees the total stays within the budget. This is actually a Crush **improvement** over Volt, but it means the behaviors differ.

---

### SC-12: File ID Extraction Source [LOW]

**Volt** extracts file IDs from the **formatted message text** (the text sent to the LLM):
```typescript
const fileIds = extractFileIds(formattedMessages)
```

**Crush fallback** extracts from **raw message content**:
```go
fileIDs := extractFileIDsFromMessages(originalMessages)
```
Where `extractFileIDsFromMessages` concatenates `msg.Content` directly.

For normal/aggressive levels, Crush extracts from the formatted text (same as Volt):
```go
fileIDs := extractFileIDs(formattedInput)
```

**Impact:** The Crush fallback may miss file IDs that appear only in formatted tool output (e.g., truncated tool results) or may find IDs in JSON-serialized parts that the formatter would have skipped. Minor inconsistency.

---

### SC-13: Condensation Fallback File ID Format [LOW]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/condense.ts`, lines 337-340):
```typescript
const metadataBlock = [
    `[Summary IDs: ${parentIds.join(", ")}]`,
    `[LCM File IDs: ${allFileIds.length > 0 ? allFileIds.join(", ") : "none"}]`,
    `[Truncated from ${originalTokens} tokens]`,
].join("\n")
```
Uses plural format `[LCM File IDs: ...]` and includes "none" when no file IDs exist.

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 228-236):
```go
fmt.Fprintf(&metadata, "[Condensed from: %s]", strings.Join(parentIDs, ", "))
for _, id := range fileIDs {
    fmt.Fprintf(&metadata, "\n[LCM File ID: %s]", id)
}
fmt.Fprintf(&metadata, "\n[Truncated from %d tokens to ≤%d tokens]",
    EstimateTokenCount(bestOutput), FallbackMaxTokens)
```
Uses individual `[LCM File ID: ...]` lines and omits the block entirely if no file IDs exist.

**Impact:** Same as SC-4 -- format inconsistency between the two systems. Additionally, Volt includes `[Summary IDs: ...]` while Crush includes `[Condensed from: ...]` in fallback. The `[Summary IDs: ...]` format in Volt is unique to the fallback and different from the standard `[Condensed from: ...]` header used by LLM-generated condensation.

---

### SC-14: Soft Threshold Default [LOW]

**Volt** (`/tmp/volt/packages/voltcode/src/session/token-budget.ts`, line 146):
```typescript
const softRaw = (input.softThresholdOverride ?? Math.floor(contextWindow * 0.6)) - overhead
```

**Crush** (`/tmp/crush/internal/lcm/config.go`, lines 7, 90):
```go
const DefaultCtxCutoffPercent = 60
softRaw := contextWindow * DefaultCtxCutoffPercent / 100
```

Both are effectively 60%. The integer arithmetic in Go (`contextWindow * 60 / 100`) is equivalent to `Math.floor(contextWindow * 0.6)` for positive integers when `contextWindow * 60` doesn't overflow `int`. Since context windows are typically < 1M tokens and Go's `int` is 64-bit, this is safe. **No issue.**

---

### SC-15: `extractFileIDs` Sorting [LOW]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, line 253):
```typescript
return [...ids].sort()
```
Returns a **sorted** deduplicated array.

**Crush** (`/tmp/crush/internal/lcm/format.go`, lines 117-130):
```go
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
```
Returns an **insertion-order** deduplicated array (not sorted).

**Impact:** Minor. File IDs may appear in different order in the `[LCM File IDs: ...]` block, but this does not affect functionality.

---

### SC-16: Compaction Manager Duplicate Handling [LOW]

**Crush** (`/tmp/crush/internal/lcm/manager.go`, lines 31-35):
```go
if _, loaded := cm.inFlight.LoadOrStore(sessionID, resultChan); loaded {
    log.Printf("Compaction already in flight for session %s", sessionID)
    close(resultChan)
    return nil
}
```

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 727-729):
```typescript
if (inFlightCompactions.has(input.conversationId)) {
    return null
}
```

Both correctly reject duplicate compaction requests. Crush uses `sync.Map.LoadOrStore` for atomic check-and-set, which is correct for concurrent access. Volt uses a plain `Map` which is safe because JavaScript is single-threaded. **No issue.**

---

### SC-17: `context.WithoutCancel` Usage [INFO]

**Crush** (`/tmp/crush/internal/lcm/manager.go`, line 37):
```go
compactCtx := context.WithoutCancel(ctx)
```

This ensures background compaction continues even if the parent context (e.g., the HTTP request) is cancelled. This is the correct Go pattern for background work that should outlive the triggering request. **No issue.**

---

### SC-18: Matching Constants [INFO]

| Constant | Volt | Crush | Match? |
|----------|------|-------|--------|
| `MinMessagesToSummarize` | 3 | 3 | YES |
| `MaxCompactionRounds` | 10 | 10 | YES |
| `FallbackMaxTokens` | 512 | 512 | YES |
| `DefaultCtxCutoffPercent` | 0.6 (60%) | 60 | YES |
| `TargetFreePercent` (semantics differ) | 0.25 (25%) | 25 | YES (value) |
| `CharsPerToken` | 4 | 4 | YES |
| `SummaryIDPrefix` | "sum_" | "sum_" | YES |
| `SummaryIDLength` | 16 | 16 | YES |
| `FileIDPrefix` | "file_" | "file_" | YES |
| `FileIDLength` | 16 | 16 | YES |
| `FallbackMetadataReserve` | N/A | 100 | NEW |

---

### SC-19: Progress Check Strictness [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, lines 61-64):
```go
newTokenCount, _ := c.store.GetContextTokenCount(ctx, sessionID)
if newTokenCount >= lastTokenCount {
    return round, fmt.Errorf("compaction made no progress (stuck at %d tokens)", newTokenCount)
}
```

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 879-893):
```typescript
if (!result.actionTaken || recheck.currentTokens >= lastTokenCount) {
    log.error("compaction made no progress, cannot reduce context further", { ... })
    return {
        success: false,
        rounds: round,
        finalTokens: recheck.currentTokens,
        hardLimit: recheck.hardLimit,
    }
}
```

Both use `>=` for the stuck detection. However, Volt also checks `!result.actionTaken` as a separate condition. In Crush, if the compaction operations (summarize/condense) succeed but fail to reduce tokens (e.g., because a concurrent message append increased the count between operations), the `>=` check would detect this. But Crush ignores errors from `GetContextTokenCount` (`_ :=`), which means a database error would result in `newTokenCount = 0`, causing the progress check to pass spuriously.

The comment in Crush (lines 58-60) acknowledges the TOCTOU race with concurrent appends, which is a valid concern.

**Recommendation:** Handle the error from `GetContextTokenCount` in the progress check to avoid false progress detection.

---

### SC-20: ~~Missing `CRITICAL_THRESHOLD_MULTIPLIER`~~ Unused Constant [~~HIGH~~ LOW]

**CORRECTED:** Severity downgraded from HIGH to LOW. The constant is defined but **never used** in Volt.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 132-136):
```typescript
/**
 * Critical threshold multiplier - when context is this far over threshold,
 * we lower the minimum messages requirement to ensure progress is made.
 * At 1.2 = 20% over threshold, we'll summarize even 1-2 messages.
 */
export const CRITICAL_THRESHOLD_MULTIPLIER = 1.2
```

This constant is defined with an explanatory comment describing intended behavior, but it is **never referenced anywhere in the Volt codebase** (confirmed via full codebase search). The described behavior (lowering the minimum messages requirement when context is 20% over threshold) is **not implemented** in Volt.

**Crush** has no equivalent constant, and its `MinMessagesToSummarize` is always enforced as a hard minimum (see `compactor.go` line 78):
```go
if len(messagesToSummarize) < MinMessagesToSummarize {
    return fmt.Errorf("not enough messages to summarize (got %d, need %d)",
        len(messagesToSummarize), MinMessagesToSummarize)
}
```

**Impact:** Both Volt and Crush enforce the minimum messages requirement unconditionally. Neither system currently lowers the minimum when context is critically over threshold. The edge case described (1-2 very large messages stalling compaction) applies equally to both systems. The original audit incorrectly stated that Volt implements this behavior.

**Recommendation:** If this safety valve is desired, it should be implemented in both systems. Currently neither has it.

---

### SC-21: Condensation Batch Size [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, line 115):
```go
summariesToCondense, err := c.store.GetOldestSummariesInContext(ctx, sessionID, 5)
```
Hardcoded limit of 5 oldest summaries per condensation round.

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, lines 511-518):
```typescript
const allSummaries = await getSummariesInContext(input.conversationId)
if (allSummaries.length >= 1) {
    const condensationResult = await attemptCondensation(input, allSummaries)
```
Condenses ALL summaries in context at once.

**Impact:** Crush's batch of 5 means condensation may require multiple rounds to reduce all summaries. This is more conservative (smaller LLM inputs per call) but slower. Volt's all-at-once approach is more aggressive and can reduce many summaries in a single LLM call.

**Recommendation:** The batch size of 5 is reasonable for controlling LLM input sizes, but it should be configurable or documented as a tunable parameter.

---

### SC-22: `shouldSummarizeMessages` Error Path [MEDIUM]

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, lines 149-171):
```go
func (c *Compactor) shouldSummarizeMessages(
    ctx context.Context, sessionID string,
) (bool, error) {
    messageCount, err := c.store.CountMessagesInContext(ctx, sessionID)
    if err != nil {
        return false, fmt.Errorf("failed to count messages: %w", err)
    }
    if messageCount >= MinMessagesToSummarize {
        return true, nil
    }
    summaryCount, err := c.store.CountSummariesInContext(ctx, sessionID)
    if err != nil {
        return false, fmt.Errorf("failed to count summaries: %w", err)
    }
    if summaryCount < 1 {
        return false, fmt.Errorf(
            "insufficient items for compaction: %d messages (need %d), %d summaries (need ≥1)",
            messageCount, MinMessagesToSummarize, summaryCount,
        )
    }
    return false, nil
}
```

When there are fewer than 3 messages AND 0 summaries, this returns an error. In `CompactContext`, this error propagates up as a hard failure for the round:
```go
shouldSummarize, err := c.shouldSummarizeMessages(ctx, sessionID)
if err != nil {
    return round, fmt.Errorf("failed to determine compaction strategy: %w", err)
}
```

**Impact:** If a session has 1-2 messages and no summaries (e.g., a very large initial message that exceeds the soft threshold), the compaction loop will immediately fail. Combined with SC-20 (no critical threshold multiplier), this can lead to permanently stuck sessions that are over threshold but cannot compact.

**Volt** handles this differently: if there are no messages and no summaries, it returns `actionTaken: false` (not an error). The `compactUntilUnderLimit` loop detects this via `!result.actionTaken` and stops gracefully.

**Recommendation:** Return `(false, nil)` instead of an error when no items are available, and let the progress check handle the stuck detection.

---

### SC-23: Missing `Parents` Field on Crush Summary Type [LOW]

**Volt** `Summary.Info` (`/tmp/volt/packages/voltcode/src/session/lcm/summary.ts`, line 40):
```typescript
parents: z.array(z.string().startsWith("sum_")),
```

**Crush** `Summary` struct (`/tmp/crush/internal/lcm/types.go`, lines 25-32):
```go
type Summary struct {
    SummaryID  string
    SessionID  string
    Kind       string
    Content    string
    TokenCount int64
    FileIDs    []string
}
```

No `Parents` field. Parent IDs are tracked in the database via `LCMInsertSummaryParent` and retrieved via `GetSummaryParentIDs`, but the in-memory `Summary` struct does not carry them.

**Impact:** When `CondenseSummaries` returns a condensed summary, the caller has no way to know its parents without a separate database query. The `EnsureParentIDsPresent` function embeds parent IDs in the content text, so they are preserved in the content string, but not as structured data. This makes it harder to programmatically work with the DAG structure in memory.

**Recommendation:** Add a `Parents []string` field to the `Summary` struct for consistency with Volt's model.

---

## Additional Observations

### Normal Summarization: File IDs Not Appended to Content in Crush

In Crush's `summarizeNormal` (`summarizer.go` lines 64-85), the file IDs are extracted and stored in `summary.FileIDs` but are **not** appended to `summary.Content`. In contrast, Volt appends `[LCM File IDs: ...]` to the content in all three levels.

This means file IDs are only in the database but not in the summary text visible to the LLM. If the LLM needs file IDs for retrieval, they would be missing from the normal summarization output.

### `EnsureParentIDsPresent` Logic Difference

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/condense.ts`, lines 128-136):
```typescript
if (!condensedFromPattern.test(finalContent)) {
    finalContent = `[Condensed from: ${parentIds.join(", ")}]\n\n${finalContent}`
} else if (missingIds.length > 0) {
    finalContent = finalContent.replace(condensedFromPattern, `[Condensed from: ${parentIds.join(", ")}]`)
}
```

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 253-264):
```go
func EnsureParentIDsPresent(content string, parentIDs []string) string {
    fullHeader := fmt.Sprintf("[Condensed from: %s]", strings.Join(parentIDs, ", "))
    if !condensedFromPattern.MatchString(content) {
        return fullHeader + "\n" + content
    }
    for _, id := range parentIDs {
        if !strings.Contains(content, id) {
            return condensedFromPattern.ReplaceAllString(content, fullHeader)
        }
    }
    return content
}
```

Volt uses `\n\n` (double newline) when injecting the header; Crush uses `\n` (single newline). Minor formatting difference but could affect downstream parsing.

### `buildCondensePrompt` Format Difference

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/condense.ts`, lines 34-44):
```typescript
function formatSummariesForPrompt(summaries: Summary.Info[]): string {
    return summaries.map((summary) => {
        const lines: string[] = []
        lines.push(`--- Summary ${summary.summaryId} ---`)
        lines.push(summary.content)
        lines.push("")
        return lines.join("\n")
    }).join("\n")
}
```
Uses `--- Summary sum_xxx ---` format.

**Crush** (`/tmp/crush/internal/lcm/summarizer.go`, lines 304-311):
```go
func buildCondensePrompt(template string, summaries []Summary) string {
    for i, summary := range summaries {
        fmt.Fprintf(&builder, "--- Summary %d (ID: %s) ---\n%s\n",
            i+1, summary.SummaryID, summary.Content)
    }
    return strings.ReplaceAll(template, "{{summaries}}", builder.String())
}
```
Uses `--- Summary 1 (ID: sum_xxx) ---` format with a numeric index.

Minor formatting difference; the LLM should handle both formats, but the numeric index in Crush is additional information not present in Volt.

### Volt's `scheduleCompaction` vs Crush's `ScheduleCompaction`

Volt's `scheduleCompaction` returns `Promise<ContextHandlerResult | null> | null` (a Promise or null). Crush's returns `<-chan CompactionResult` or `nil`. Both are functionally equivalent patterns for their respective languages.

However, Volt uses `Map<number, Promise>` (keyed by conversationId, which is numeric), while Crush uses `sync.Map` keyed by sessionID (string). This means in Volt, different sessions sharing the same conversationId would share the same compaction lock, while in Crush, each session has its own lock. This is a semantic difference due to the different data models (Volt has conversations within sessions; Crush appears to use sessionID directly).

---

## Risk Summary

**High-Risk Items (Require Attention):**
- SC-1: Token estimation divergence can cause compaction to trigger at different points
- SC-2: Summary ID generation is fundamentally different, affecting idempotency and deduplication
- SC-3: Compaction architecture divergence means different compaction behavior in practice
- SC-4: File ID format mismatch prevents cross-system summary parsing (see also SC-25: Crush normal/aggressive levels do not append file IDs to content text in either summarization or condensation, unlike Volt)

**Medium-Risk Items (Should Address):**
- SC-5: Reserve computation difference for low-output models
- SC-6: Compaction target formula is new Crush behavior, not a port of Volt logic
- SC-7: Silent error escalation masks operational issues
- SC-8: Prompt architecture divergence (system+user vs. single prompt string)
- SC-9: Aggressive summarization MaxTokens hard-cap (500) not present in Volt
- SC-10: Aggressive condensation MaxTokens hard-cap (600) not present in Volt
- SC-11: Fallback metadata reserve is a Crush improvement but changes behavior
- SC-19: Ignored database errors in progress check
- SC-21: Batch condensation (5) vs. all-at-once changes compaction efficiency
- SC-22: Error from `shouldSummarizeMessages` can stall compaction permanently
- SC-25: Crush normal/aggressive summarization and condensation do not append file IDs to content text

**Low-Risk Items (Document or Accept):**
- SC-12, SC-13, SC-14, SC-15, SC-23: Minor inconsistencies that are unlikely to cause issues in practice
- SC-16, SC-17, SC-18: Verified equivalent or correct
- SC-20: `CRITICAL_THRESHOLD_MULTIPLIER` is dead code in Volt (defined but never used); neither system implements the described behavior
- SC-24: Compaction loop indexing difference (0-indexed vs. 1-indexed); cosmetic
- SC-26: Volt regex cannot re-extract file IDs from its own plural format; likely by design
- SC-27: `DEFAULT_OUTPUT_RESERVE` constant not listed in SC-18 table; informational only

---

## Additional Findings (Added During Review)

### SC-24: Compaction Loop Indexing Difference [LOW]

**Crush** (`/tmp/crush/internal/lcm/compactor.go`, line 26):
```go
for round := 0; round < MaxCompactionRounds; round++ {
```
Crush uses **0-indexed** rounds (0 through 9).

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/context.ts`, line 831):
```typescript
for (let round = 1; round <= MAX_COMPACTION_ROUNDS; round++) {
```
Volt uses **1-indexed** rounds (1 through 10).

Both execute exactly 10 rounds, but the round number returned in results differs by 1. Crush returns 0-9 for individual rounds and `MaxCompactionRounds` (10) for exhaustion; Volt returns 1-10 for individual rounds and `MAX_COMPACTION_ROUNDS` (10) for exhaustion. This could cause confusion when comparing diagnostics/logs between the two systems.

---

### SC-25: Crush Normal/Aggressive Summarization and Condensation Do Not Append File IDs to Content [MEDIUM]

**Crush** `summarizeNormal` (`/tmp/crush/internal/lcm/summarizer.go`, lines 77-84):
```go
return &Summary{
    SummaryID:  generateSummaryID(messages),
    SessionID:  messages[0].SessionID,
    Kind:       SummaryKindLeaf,
    Content:    response.Text,        // <-- raw LLM output, no file IDs appended
    TokenCount: int64(EstimateTokenCount(response.Text)),
    FileIDs:    fileIDs,              // <-- stored only in struct field
}, nil
```

**Volt** `summarize` (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, lines 103-104):
```typescript
const finalContent =
    fileIds.length > 0 ? summaryContent + `\n[LCM File IDs: ${fileIds.join(", ")}]` : summaryContent
```

Volt appends file IDs to the summary content text in **all three** escalation levels (normal, aggressive, fallback). Crush only appends them in the **fallback** level. In the normal and aggressive levels, Crush stores them in the `FileIDs` struct field but the content text has no file ID markers.

The same pattern applies to **condensation**: Crush's `condenseNormal` (lines 169-191) and `condenseAggressive` (lines 193-216) do not append file IDs to content, only setting the struct field. Only `condenseFallback` (lines 218-247) appends them. In contrast, Volt's `condenseSummaries` (condense.ts lines 144-146) and `condenseSummariesAggressive` (condense.ts lines 260-262) both append `[LCM File IDs: ...]` to the content text.

**Impact:** When the LLM sees summary content in context (e.g., during condensation), Crush's normal/aggressive summaries and condensed summaries will not contain file ID references in the text. This means the LLM cannot preserve file IDs during condensation unless they are injected separately. The `aggregateFileIDs` function (`summarizer.go` lines 321-338) compensates by extracting from both `summary.FileIDs` and `summary.Content`, but downstream consumers that only have the content text will miss the file IDs.

---

### SC-26: Volt Regex Cannot Match Its Own Plural File ID Format [LOW]

**Volt** (`/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`, line 231):
```typescript
const FILE_ID_PATTERN =
    /\[Large File Stored:\s*(file_[0-9a-f]{16})\]|
     \[Large User Text Stored:\s*(file_[0-9a-f]{16})\]|
     LCM File ID:\s*(file_[0-9a-f]{16})|
     file_id\s+"(file_[0-9a-f]{16})"/g
```

The third alternative matches `LCM File ID:` (singular) followed by a single file ID. However, Volt writes file IDs in the plural format: `[LCM File IDs: file_aaa, file_bbb]`. The regex `LCM File ID:` does **not** match `LCM File IDs:` because the "s" in "IDs" prevents the match (`ID:` vs `IDs:`).

**Impact:** Volt's `extractFileIds` function cannot re-extract file IDs from its own summary output text. This is likely acceptable because file IDs are stored structurally in the `fileIds` array on `Summary.Info` objects, but it means file IDs embedded in summary content text are effectively opaque to Volt's regex extraction. If a condensed summary's content only contains the plural format (from the LLM echoing it), those IDs would not be re-extracted.

---

### SC-27: `DEFAULT_OUTPUT_RESERVE` Not Listed in Constants Table [INFO]

Volt defines `DEFAULT_OUTPUT_RESERVE = 20_000` (`/tmp/volt/packages/voltcode/src/session/token-budget.ts`, line 10). Crush hardcodes `20_000` directly in `ComputeTokenBudget` (`config.go`, line 87). Both use the same value but the constant is not listed in the SC-18 matching constants table.

---

## Review Notes

**Review performed:** 2026-02-18
**Reviewer methodology:** Every finding was verified by reading the actual source files and cross-referencing file paths, line numbers, code snippets, and behavioral claims against the real code.

### Corrections Applied

1. **SC-1**: Added note about Volt's `Math.max(0, ...)` guard not present in Crush (minor omission).

2. **SC-4**: Significantly expanded the Impact section. The original audit incorrectly stated "the Volt regex also matches the singular pattern" without clarifying that Volt's regex uses `LCM File ID:` (without brackets), which CAN match Crush's `[LCM File ID: ...]` format as a substring. Also added the critical finding that Volt's own regex CANNOT match its own plural `[LCM File IDs: ...]` format. Noted that Crush's normal/aggressive levels don't append file IDs to content text (only the fallback does), which is inconsistent with Volt.

3. **SC-6**: Corrected claim that "Volt uses `TARGET_FREE_PERCENTAGE = 0.25` only for message selection." In fact, `TARGET_FREE_PERCENTAGE` is **defined but never referenced** anywhere in the Volt codebase -- it is dead code. Updated the recommendation accordingly.

4. **SC-7**: Fixed Volt code snippet line numbers from "lines 435-461" to "lines 434-445" and removed fake inline comments that were not in the actual source code. Moved the behavioral explanation outside the code block.

5. **SC-11**: Fixed line number for `FallbackMaxTokens` from "lines 34-35" to "lines 32 and 35" (the two constants are not on adjacent lines in the source).

6. **SC-20**: **Major correction.** Downgraded from HIGH to LOW. The original audit claimed Volt actively uses `CRITICAL_THRESHOLD_MULTIPLIER` to lower the minimum messages requirement, but a full codebase search confirmed this constant is **defined but never referenced** anywhere. The described behavior is not implemented in Volt. Neither system lowers the minimum messages requirement under critical conditions. Updated the finding title, severity, description, impact, and recommendation.

7. **SC-22**: Fixed the code snippet to include the error-handling lines (`if err != nil { ... }`) that were omitted from the original audit. The original snippet showed a simplified version that did not match the actual source code.

8. **Summary Table**: Updated SC-6 description and SC-20 severity/description/status to reflect corrections.

9. **Risk Summary**: Reorganized to be consistent with actual severity ratings. SC-6, SC-8, SC-9, SC-10, SC-11 were listed as "Low-Risk" in the original but are rated MEDIUM in their findings -- moved them to Medium-Risk. SC-20 moved from High-Risk to Low-Risk.

### New Findings Added

- **SC-24** [LOW]: Compaction loop indexing difference (0-indexed in Crush vs. 1-indexed in Volt).
- **SC-25** [MEDIUM]: Crush normal/aggressive summarization does not append file IDs to content text (unlike Volt, which always appends them).
- **SC-26** [LOW]: Volt's own regex cannot match the plural `[LCM File IDs: ...]` format it writes.
- **SC-27** [INFO]: `DEFAULT_OUTPUT_RESERVE = 20_000` constant not listed in the matching constants table.

### Verified Accurate (No Changes Needed)

The following findings were verified as accurate with correct file paths, line numbers, code snippets, and analysis:
- SC-1 (core analysis correct, minor addition made)
- SC-2, SC-3, SC-5, SC-8, SC-9, SC-10, SC-12, SC-13, SC-14, SC-15, SC-16, SC-17, SC-18, SC-19, SC-21, SC-23
- All "Additional Observations" in the original document were verified as accurate

### Files Referenced During Verification

**Volt:**
- `/tmp/volt/packages/voltcode/src/util/token.ts`
- `/tmp/volt/packages/voltcode/src/session/token-budget.ts`
- `/tmp/volt/packages/voltcode/src/session/lcm/summarize.ts`
- `/tmp/volt/packages/voltcode/src/session/lcm/condense.ts`
- `/tmp/volt/packages/voltcode/src/session/lcm/context.ts`
- `/tmp/volt/packages/voltcode/src/session/lcm/summary.ts`
- `/tmp/volt/packages/voltcode/src/session/lcm/config.ts` (Postgres config only, no LCM logic)

**Crush:**
- `/tmp/crush/internal/lcm/summarizer.go`
- `/tmp/crush/internal/lcm/compactor.go`
- `/tmp/crush/internal/lcm/config.go`
- `/tmp/crush/internal/lcm/manager.go`
- `/tmp/crush/internal/lcm/types.go`
- `/tmp/crush/internal/lcm/format.go`
- `/tmp/crush/internal/lcm/context.go`
- `/tmp/crush/internal/lcm/replace.go`
- `/tmp/crush/internal/lcm/integration.go`
- `/tmp/crush/internal/lcm/retrieval.go`
- `/tmp/crush/internal/lcm/lcm_test.go`

**Note:** The task listed `/tmp/volt/packages/voltcode/src/session/lcm/compaction.ts` and `/tmp/volt/packages/voltcode/src/session/lcm/types.ts` as source files, but neither file exists. The compaction logic in Volt is in `context.ts` (the `compactUntilUnderLimit` function), and the types are in `summary.ts`.

---

### Second-Pass Verification

**Second-pass review performed:** 2026-02-18
**Methodology:** Independent re-read of the full audit document and every source file referenced. All line numbers, code snippets, severity ratings, comparative claims, constants, formulas, and the first-pass Review Notes were cross-referenced against the actual source code.

**Overall assessment:** The first-pass review was thorough and the vast majority of findings, corrections, and new additions were accurate. The following minor issues were identified and corrected in this second pass:

#### Corrections Applied (Second Pass)

1. **SC-1 line number**: Changed Volt file reference from "line 5" to "lines 4-6". The function declaration begins at line 4 (`export function estimate(...)`) and the code snippet spans lines 4-6. The original "line 5" pointed only to the `return` statement inside the function body.

2. **SC-4 Crush line numbers**: Changed from "lines 121-125" to "lines 122-125". The quoted code snippet (`var metadata strings.Builder` through `}`) starts at line 122, not 121. Line 121 is `fileIDs := extractFileIDsFromMessages(originalMessages)` which was not included in the quote.

3. **SC-13 code snippet**: Fixed `<=%d` to `≤%d` in the Crush `condenseFallback` code snippet. The actual source code at `summarizer.go` line 235 uses the Unicode less-than-or-equal sign `≤`, not the ASCII `<=`. This was an encoding/transcription error introduced during the first review pass.

4. **SC-22 code snippet**: Fixed `>=1` to `≥1` in the Crush `shouldSummarizeMessages` error message. The actual source code at `compactor.go` line 166 uses the Unicode greater-than-or-equal sign `≥`, not the ASCII `>=`. Same class of transcription error as above.

5. **SC-25 scope expanded**: The finding previously only mentioned summarization, but the same divergence applies to condensation. Crush's `condenseNormal` (summarizer.go lines 169-191) and `condenseAggressive` (lines 193-216) do not append file IDs to content text -- only `condenseFallback` (lines 218-247) does. In contrast, Volt's `condenseSummaries` and `condenseSummariesAggressive` both append `[LCM File IDs: ...]` to the content. Updated the finding title, summary table entry, and detailed description accordingly.

6. **Risk Summary section**: Added SC-24, SC-25, SC-26, and SC-27 which were added as new findings during the first review pass but were not included in the Risk Summary classification.

#### Verified Accurate (Second Pass)

All other findings, including the first-pass corrections (SC-1 addition, SC-4 expansion, SC-6 dead-code clarification, SC-7 line fix, SC-11 line fix, SC-20 severity downgrade, SC-22 code fix, summary table updates, risk summary reorganization, and all four new findings SC-24 through SC-27), were verified as accurate.

No contradictions were found between findings. The summary table matches the detailed findings after corrections. Constants and formula values are exact matches to source code.
