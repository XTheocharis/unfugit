package lcm

// --- THRESHOLD CONFIGURATION ---

// DefaultCtxCutoffPercent: start compaction when context reaches this percentage
// of the model's total context window.
const DefaultCtxCutoffPercent = 60

// TargetFreePercent: continue compacting until this fraction of the soft threshold is free.
const TargetFreePercent = 25

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

// EstimateTokenCount estimates token count from string content using rune count.
// Uses ceiling division to match Volt's Math.ceil(content.length / CHARS_PER_TOKEN).
func EstimateTokenCount(content string) int {
	if content == "" {
		return 0
	}
	n := len([]rune(content))
	return (n + CharsPerToken - 1) / CharsPerToken
}

// EstimateTokenCountFromBytes estimates tokens from a byte length.
// Uses ceiling division to match Volt's BigInt(Math.ceil(fileSize / 4)).
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
	if len(modelOutputLimit) > 0 && modelOutputLimit[0] > 0 {
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
