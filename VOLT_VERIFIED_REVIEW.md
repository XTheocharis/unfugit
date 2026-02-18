# LCM Implementation Review: Crush vs Volt (Verified Against Volt Source)

**Date:** 2026-02-18
**Volt repo:** https://github.com/voltropy/volt (commit 2822943c8)
**Crush branch:** claude/review-document-errors-CWPsA
**Build status:** Clean (go build, go vet pass)
**Tests:** 68/68 pass, 32% statement coverage

---

## Methodology

Each finding was verified by reading the actual Volt source at `/tmp/volt/packages/voltcode/src/session/lcm/`. Line numbers reference specific Volt and Crush files.

---

## BUGS (5 issues)

### B1 [HIGH] Compaction target uses Volt's dead code constant

**Crush:** `compactor.go:33` — `target := budget.SoftThreshold * (100 - TargetFreePercent) / 100` where `TargetFreePercent = 25` (`config.go:10`). Compaction stops when tokens drop to **75%** of SoftThreshold.

**Volt:** `context.ts:123` — `export const TARGET_FREE_PERCENTAGE = 0.25` is **declared but never used** (confirmed by grep). The actual stop condition at `context.ts:494` is `!newThresholdCheck.overSoft` which checks `currentTokens > softThreshold` (`context.ts:208`). Compaction stops at **100%** of SoftThreshold.

**Impact:** Crush performs ~33% more compaction work per session than Volt. Every compaction round triggers unnecessary extra LLM calls.

**Fix:** Change `TargetFreePercent = 0` or use `budget.SoftThreshold` directly as the target.

---

### B2 [MEDIUM] LLM errors trigger escalation instead of propagating

**Crush:** `summarizer.go:44-51` — Level 1 failure is caught, logged, and escalation continues to Level 2:
```go
if err != nil {
    log.Printf("Level 1 summarization failed, escalating: %v", err)
}
```

**Volt:** `context.ts:434-462` — No `try/catch` around `LcmSummarize.summarize()`. An LLM API error propagates as an unhandled exception to `scheduleCompaction()` (`context.ts:738-753`) which catches and returns null. Escalation from Level 1 to Level 2 is triggered **solely** by the size check `leafSummary.tokenCount >= inputTokens`.

**Impact:** Transient API errors in Crush silently escalate to aggressive/fallback modes instead of being surfaced. An API outage would produce a cascade of degraded summaries instead of failing fast.

---

### B3 [MEDIUM] Aggressive levels have hard MaxTokens caps absent in Volt

**Crush:** `summarizer.go:105` — `MaxTokens: 500` for aggressive summarize. `summarizer.go:212` — `MaxTokens: 600` for aggressive condense.

**Volt:** All four `generateText()` calls in `summarize.ts:84-97`, `summarize.ts:303-316`, `condense.ts:101-114`, `condense.ts:222-235` omit `maxTokens` entirely. Volt controls output length via prompt instructions only:
- Normal summarize: "Target 500-1000 tokens" (`summarize.txt`)
- Aggressive summarize: "Target 200-500 tokens" (`summarize-aggressive.txt`)
- Normal condense: "Target 800-1500 tokens" (`condense.txt`)
- Aggressive condense: "Target 300-600 tokens" (`condense-aggressive.txt`)

**Impact:** Hard caps risk mid-sentence truncation by the API. Volt relies on prompt-guided brevity.

---

### B4 [MEDIUM] ImageExplorer matches SVG (Volt explicitly excludes it)

**Crush:** `explorer_binary.go:162-163`:
```go
func (ImageExplorer) CanExplore(path string, mimeType string) bool {
    if strings.HasPrefix(mimeType, "image/") {
        return true
    }
```
Matches all `image/*` including `image/svg+xml`.

**Volt:** `dispatcher.ts:915`:
```typescript
if (normalized.startsWith("image/") && normalized !== "image/svg+xml") {
    return "image"
}
```
Explicitly excludes SVG. Additionally, `.svg` is routed to XmlExplorer via extension (`dispatcher.ts:595`).

**Impact:** SVG files (text-based XML) are incorrectly processed as binary images in Crush.

---

### B5 [MEDIUM] PythonExplorer missing `application/x-python` MIME type

**Crush:** `explorer_code.go:108-109`:
```go
func (PythonExplorer) CanExplore(path string, mimeType string) bool {
    return mimeType == "text/x-python" || filepath.Ext(path) == ".py"
}
```
Only handles `text/x-python`.

**Volt:** `dispatcher.ts:909-911`:
```typescript
if (normalized === "text/x-python" || normalized === "application/x-python") {
    return "python"
}
```
Handles both `text/x-python` and `application/x-python`.

**Impact:** Files served with `application/x-python` MIME type fall through to TextExplorer instead of PythonExplorer.

---

## BEHAVIORAL DIVERGENCES (9 issues)

These are differences from Volt that are expected or acceptable in a port but could affect cross-system compatibility.

### D1 [HIGH] File ID generation uses fundamentally different strategy

**Crush:** `largefile.go:86-91` — Hashes **metadata** (sessionID, path, size, mtime):
```go
fmt.Fprintf(h, "%s|%s|%d|%d", sessionID, filePath, fileSize, mtime.Unix())
```

**Volt:** `large-file.ts:89-92` — Hashes **file content**:
```typescript
export function generateId(content: string | Uint8Array): string {
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 16)
    return `file_${hash}`
}
```

| Aspect | Volt | Crush |
|--------|------|-------|
| Hash input | Raw file content | `sessionID\|path\|size\|mtime` |
| Dedup behavior | Same content = same ID (content-addressed) | Same path+metadata = same ID |
| Cross-session | Same file = same ID across sessions | Different sessions = different IDs |

**Impact:** File IDs for identical files will differ between systems. Volt's content-addressing enables deduplication; Crush's metadata-addressing does not.

---

### D2 [MEDIUM] File ID markers use singular per-line format vs plural one-line

**Crush:** `summarizer.go:340-342`:
```go
for _, id := range fileIDs {
    fmt.Fprintf(&b, "\n[LCM File ID: %s]", id)
}
```
Emits: `[LCM File ID: file_xxx]\n[LCM File ID: file_yyy]`

**Volt:** `summarize.ts:103`:
```typescript
const finalContent = fileIds.length > 0
    ? summaryContent + `\n[LCM File IDs: ${fileIds.join(", ")}]`
    : summaryContent
```
Emits: `[LCM File IDs: file_xxx, file_yyy]`

**Mitigation:** Crush's `extractFileIDs()` handles both formats via `fileIDInline` regex fallback (`format.go:176`).

---

### D3 [MEDIUM] Token estimation differs in both character counting AND rounding

| Aspect | Volt (`Token.estimate`) | Volt (`LargeFileThreshold`) | Crush |
|--------|------------------------|---------------------------|-------|
| Character unit | UTF-16 code units (`string.length`) | UTF-16 code units | Unicode code points (`len([]rune())`) |
| Divisor | 4 | 4 | 4 |
| Rounding | `Math.round()` | `Math.ceil()` | Ceiling `(n+3)/4` |
| Reference | `util/token.ts:5` | `large-file-threshold.ts:54` | `config.go:52-53` |

Crush's comment at `config.go:47` says it matches "Volt's `Math.ceil`" — this is true for the large-file-threshold variant but **not** for Volt's primary `Token.estimate()` which uses `Math.round()`.

**Impact:** For ASCII text (the common case), results are identical. For non-BMP Unicode (emoji, some CJK), Volt counts surrogate pairs as 2 while Crush counts them as 1.

---

### D4 [MEDIUM] FormatLargeFileForContext header marker differs

**Crush:** `format.go:145` — `[Large File Stored: %s]`

**Volt:** `large-file.ts:153` — `[Large File ID: ${file.fileId}]`

Additionally, Volt conditionally includes the Path line (`if (file.originalPath)`), while Crush always includes it. Volt adds a blank line before the hint; Crush does not.

---

### D5 [MEDIUM] Prompt architecture: single string vs structured messages

**Crush:** `summarizer.go:77-81` — Single `Prompt` string via `{{messages}}` template substitution. `LLMRequest` has a flat `Prompt string` field (`types.go:154`).

**Volt:** `summarize.ts:84-97` — Structured `messages` array with explicit `role: "system"` and `role: "user"` entries:
```typescript
messages: [
    { role: "system", content: SUMMARIZE_PROMPT },
    { role: "user", content: `<messages>\n${formattedMessages}\n</messages>` },
]
```

**Impact:** LLMs may produce different outputs when system and user content are mixed into a single prompt vs properly separated by role.

---

### D6 [LOW] Tool call label format

**Crush:** `format.go:44` — `[Tool Call: name]`
**Volt:** `summarize.ts:188` — `[Tool: name]`

Additionally, Volt includes the tool name in error output (`[Tool: name] Error: ...`), while Crush omits it (`[Tool Error]\n...`).

---

### D7 [LOW] Message header bracket placement

**Crush:** `format.go:19` — `[Message m1 (user)]` (role inside brackets)
**Volt:** `summarize.ts:177` — `[Message m1] (user)` (role outside brackets)

---

### D8 [LOW] Round indexing

**Crush:** `compactor.go:26` — 0-indexed (rounds 0-9)
**Volt:** Not directly comparable (single-pass `onContextThresholdReached` + multi-round `compactUntilUnderLimit`)

---

### D9 [LOW] Token estimation comment is inaccurate

**Crush:** `config.go:47` states:
```go
// Uses ceiling division to match Volt's Math.ceil(content.length / CHARS_PER_TOKEN).
```
Volt's **primary** `Token.estimate()` (`util/token.ts:5`) uses `Math.round()`, not `Math.ceil()`. The comment only matches Volt's secondary `LargeFileThreshold.estimateTokenCount()`.

---

## MISSING FEATURES (8 issues)

### M1 [MEDIUM] ExpandSummaryToMessages: Go recursion vs Volt's recursive CTE

**Crush:** `retrieval.go:19-59` — Go-level recursion with N+1 SQL calls per DAG node (2 queries per node: `ExpandSummaryToMessages` + `GetSummaryParentIDs`).

**Volt:** `db.ts:1368-1399` — Single `WITH RECURSIVE` CTE:
```sql
WITH RECURSIVE walk(summary_id) AS (
    SELECT $1::text
    UNION
    SELECT sp.parent_summary_id FROM summary_parents sp
    JOIN walk w ON sp.summary_id = w.summary_id
),
leaf_messages AS (
    SELECT DISTINCT sm.message_id FROM walk w
    JOIN summary_messages sm ON sm.summary_id = w.summary_id
)
SELECT ... FROM leaf_messages lm JOIN messages m ON ...
```

**Impact:** For a DAG with depth D and branching B, Crush makes O(B^D) queries; Volt makes 1.

---

### M2 [MEDIUM] GetMessagesByIDs / GetSummariesByIDs: N+1 queries

**Crush:** `store.go:150-151` — Loops one-by-one with comment: "sqlc doesn't support sqlc.slice for SQLite"

**Volt:** `db.ts:859-877` — Uses `ANY()` for batch retrieval:
```typescript
SELECT * FROM message_parts WHERE message_id = ANY(${messageIds})
```

**Impact:** Performance degrades linearly with number of IDs.

---

### M3 [MEDIUM] Regex search: full-table scan vs CTE-scoped

**Crush:** `store.go:542-576` — Fetches all session messages, applies Go `regexp` in application code.

**Volt:** `db.ts:1562-1583` — Uses recursive CTE to scope regex search to messages within a summary's DAG, all in one query.

**Impact:** Crush scans the entire session; Volt scopes to the relevant summary subtree.

---

### M4 [MEDIUM] No integration-layer tests

Zero tests for `AfterMessageAppended`, `GetContext`, `Expand`, `Search` — the primary LCM API surface. All existing tests use mocks.

---

### M5 [MEDIUM] No SQLite integration tests

All 68 tests use `mockStore`. Transaction correctness, FTS5 search, and end-to-end compaction are untested against real SQLite.

---

### M6 [LOW] Summary struct missing `Parents` and `CreatedAt` fields

**Crush `Summary` struct** (`types.go:25-32`): 6 fields — `SummaryID`, `SessionID`, `Kind`, `Content`, `TokenCount`, `FileIDs`

**Volt `Summary.Info` type** (`summary.ts:27-50`): 8 fields — adds `parents: string[]` and `createdAt: number`

Volt carries parent IDs inline on the domain object for programmatic access (e.g., `formatForContext()` reads `summary.parents`). Crush fetches them separately via `GetSummaryParentIDs()`.

---

### M7 [LOW] Missing MIME type variants across explorers

| Explorer | Crush handles | Volt also handles |
|----------|--------------|-------------------|
| Python | `text/x-python` | `application/x-python` |
| YAML | `text/yaml` | `text/x-yaml` |
| JSON | `application/json` | `*/*+json` subtypes |
| XML | `application/xml`, `text/xml` | `*/*+xml` subtypes, SVG |
| CSV | `text/csv` | `text/tab-separated-values` |
| HTML | `text/html` | `application/xhtml+xml` |
| Executable | `application/x-executable`, `x-elf`, `x-mach-binary`, `x-dosexec` | `application/x-sharedlib` |

---

### M8 [LOW] Volt dispatcher uses 3-tier cascade; Crush uses flat CanExplore

**Volt:** `dispatcher.ts:1091-1160` — Three-tier cascade: extension first, then MIME, then magic bytes/content detection.

**Crush:** `explorer.go:105-119` — Flat loop: each explorer's `CanExplore(path, mimeType)` is checked in registration order. No magic byte detection.

**Impact:** Crush may misclassify files where MIME type is incorrect or missing. Volt's extension-first approach is more robust.

---

## SUMMARY

| Category | HIGH | MEDIUM | LOW | Total |
|----------|------|--------|-----|-------|
| Bugs | 1 | 4 | 0 | **5** |
| Divergences | 1 | 4 | 4 | **9** |
| Missing | 0 | 5 | 3 | **8** |
| **Total** | **2** | **13** | **7** | **22** |

### Top 3 priorities

1. **B1** — Fix compaction target (HIGH). Change `TargetFreePercent = 0` to match Volt's actual behavior.
2. **D1** — Decide on file ID strategy (HIGH divergence). Content-addressed (Volt) vs metadata-addressed (Crush) is a fundamental design choice.
3. **B2+B3** — Fix escalation behavior to match Volt: propagate API errors instead of escalating, remove MaxTokens hard caps.
