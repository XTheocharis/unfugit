package lcm

// --- THRESHOLD CONFIGURATION ---

// DefaultCtxCutoffPercent: start compaction when context reaches this percentage
// of the model's total context window.
const DefaultCtxCutoffPercent = 60

// TargetFreePercent: continue compacting until this fraction of the soft threshold is free.
// Volt declares TARGET_FREE_PERCENTAGE = 0.25 but never uses it — compaction
// stops at 100% of softThreshold. We match Volt's actual behavior (0%).
const TargetFreePercent = 0

// MinMessagesToSummarize: minimum messages to summarize in one operation.
const MinMessagesToSummarize = 3

// MaxCompactionRounds: give up after this many rounds to prevent infinite loops.
const MaxCompactionRounds = 10

// --- LARGE FILE THRESHOLDS ---

// DefaultTokenThreshold: token count above which a file is considered "large".
const DefaultTokenThreshold = 25_000

// DefaultByteThreshold: byte size above which a file is considered "large" (100,000 bytes ≈ 97.7 KiB).
const DefaultByteThreshold = 100_000

// CharsPerToken: characters-per-token estimation ratio.
const CharsPerToken = 4

// --- ESCALATION CONSTANTS ---

// FallbackMaxTokens: hard token limit for deterministic Level 3 truncation.
const FallbackMaxTokens = 512

// FallbackMetadataReserve: tokens reserved for metadata lines in fallback output.
const FallbackMetadataReserve = 100

// --- ID FORMAT CONSTANTS ---

const (
	SummaryIDPrefix = "sum_"
	SummaryIDLength = 16
	FileIDPrefix    = "file_"
	FileIDLength    = 16
)

// EstimateTokenCount estimates token count from string content.
// Uses round-half-up to match Volt's primary Token.estimate() (util/token.ts:5):
//
//	Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
//
// Note: Volt uses UTF-16 code units (string.length); Go uses Unicode code points
// (len([]rune)). For BMP characters (the vast majority of LLM content) these are identical.
func EstimateTokenCount(content string) int {
	if content == "" {
		return 0
	}
	n := len([]rune(content))
	// Round half-up: equivalent to Math.round(n / 4) = floor(n/4 + 0.5) = (n + 2) / 4
	return (n + CharsPerToken/2) / CharsPerToken
}

// EstimateTokenCountFromBytes estimates tokens from a byte length.
// Uses ceiling division to match Volt's LargeFileThreshold.estimateTokenCount()
// (large-file-threshold.ts:54): Math.ceil(content.length / CHARS_PER_TOKEN).
// The byte-level estimator deliberately uses ceil (not round) to match Volt's
// secondary estimator used for large-file threshold checks.
func EstimateTokenCountFromBytes(byteLen int64) int64 {
	return (byteLen + CharsPerToken - 1) / CharsPerToken
}

// IsLargeFile checks if content exceeds large file thresholds (OR logic).
// Uses strict greater-than (>) consistent with Volt's reference implementation.
func IsLargeFile(content string) bool {
	if len(content) > DefaultByteThreshold {
		return true
	}
	return EstimateTokenCount(content) > DefaultTokenThreshold
}

// TokenBudget represents computed thresholds for a session.
type TokenBudget struct {
	Overhead         int
	Reserve          int
	HardLimit        int
	SoftThreshold    int
	ContextWindow    int
	SystemPromptToks int
	ToolToks         int
}

// DefaultOutputReserve is the default reserve for model output tokens.
const DefaultOutputReserve = 20_000

// ComputeTokenBudget calculates absolute token thresholds from model parameters.
// Phase 3.3: Added modelOutputLimit parameter for model-aware reserve.
func ComputeTokenBudget(
	contextWindow int,
	systemPromptToks int,
	toolToks int,
	softThresholdOverride *int,
	modelOutputLimit ...int,
) TokenBudget {
	overhead := systemPromptToks + toolToks

	// Phase 3.3: If a model-specific output limit is provided, use it for reserve.
	// Otherwise fall back to min(20000, contextWindow/4).
	reserve := min(DefaultOutputReserve, contextWindow/4)
	if len(modelOutputLimit) > 0 && modelOutputLimit[0] > 0 && modelOutputLimit[0] < reserve {
		reserve = modelOutputLimit[0]
	}

	hardLimit := contextWindow - overhead - reserve

	softRaw := contextWindow * DefaultCtxCutoffPercent / 100
	if softThresholdOverride != nil {
		softRaw = *softThresholdOverride
	}
	softRaw -= overhead
	softThreshold := min(softRaw, hardLimit)
	if softThreshold < 0 {
		softThreshold = 0
	}

	return TokenBudget{
		Overhead:         overhead,
		Reserve:          reserve,
		HardLimit:        hardLimit,
		SoftThreshold:    softThreshold,
		ContextWindow:    contextWindow,
		SystemPromptToks: systemPromptToks,
		ToolToks:         toolToks,
	}
}
