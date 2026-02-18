package lcm

import "context"

// --- SUMMARY KINDS ---

const (
	SummaryKindLeaf      = "leaf"
	SummaryKindCondensed = "condensed"
)

// --- DOMAIN TYPES ---

// LCMMessage is the LCM view of a message for summarization.
type LCMMessage struct {
	ID         string
	SessionID  string
	CreatedAt  int64
	Role       string
	Content    string
	TokenCount int
}

// Summary represents a DAG node.
type Summary struct {
	SummaryID  string
	SessionID  string
	Kind       string
	Content    string
	TokenCount int64
	FileIDs    []string
}

// ContextEntry represents one item in the active context window.
type ContextEntry struct {
	Position    int
	ItemType    string
	MessageID   *string
	SummaryID   *string
	SummaryKind string
	Role        string
	Content     string
	TokenCount  int
}

// LargeFile represents a path-only reference to a large file.
type LargeFile struct {
	FileID       string
	SessionID    string
	OriginalPath string
	MimeType     string
	TokenCount   int64
	CreatedAt    int64
}

// LargeFileContent holds streamed file data.
type LargeFileContent struct {
	Content   string
	Truncated bool
	TotalSize int64
}

// CompactionResult is sent on the result channel after async compaction.
type CompactionResult struct {
	Success     bool
	Rounds      int
	FinalTokens int
	Error       error
}

// --- INTERFACES ---

// Summarizer abstracts LLM-based summarization (for testing).
type Summarizer interface {
	SummarizeMessages(ctx context.Context, messages []LCMMessage) (*Summary, error)
	CondenseSummaries(ctx context.Context, summaries []Summary) (*Summary, error)
}

// LLMClient abstracts the LLM API call.
type LLMClient interface {
	Generate(ctx context.Context, req LLMRequest) (*LLMResponse, error)
}

// LLMRequest is the input to an LLM generation call.
type LLMRequest struct {
	Model     string
	Prompt    string
	MaxTokens int
}

// LLMResponse is the output from an LLM generation call.
type LLMResponse struct {
	Text string
}

// Store abstracts all database operations for LCM.
type Store interface {
	GetCurrentContext(ctx context.Context, sessionID string) ([]ContextEntry, error)
	GetContextTokenCount(ctx context.Context, sessionID string) (int, error)
	ReplacePositionsWithSummary(ctx context.Context, sessionID string, positions []int, summaryID string) error
	AppendContextItem(ctx context.Context, sessionID string, itemType string, messageID *string, summaryID *string) error
	GetMessagesToSummarize(ctx context.Context, sessionID string, rowLimit int) ([]ContextEntry, error)
	GetMessagesByIDs(ctx context.Context, ids []string) ([]LCMMessage, error)
	CountMessagesInContext(ctx context.Context, sessionID string) (int, error)
	InsertLeafSummary(ctx context.Context, summary *Summary, messageIDs []string) error
	InsertCondensedSummary(ctx context.Context, summary *Summary, parentIDs []string) error
	GetSummariesByIDs(ctx context.Context, ids []string) ([]Summary, error)
	GetSummaryParentIDs(ctx context.Context, summaryID string) ([]string, error)
	GetOldestSummariesInContext(ctx context.Context, sessionID string, limit int) ([]ContextEntry, error)
	CountSummariesInContext(ctx context.Context, sessionID string) (int, error)
	ExpandSummaryToMessages(ctx context.Context, summaryID string) ([]LCMMessage, error)
	InsertLargeFileFromPath(ctx context.Context, sessionID string, filePath string, mimeType string) (*LargeFile, error)
	GetLargeFile(ctx context.Context, fileID string) (*LargeFile, error)
	SearchSummaries(ctx context.Context, sessionID string, query string, limit int) ([]Summary, error)
}

// EventBus publishes compaction lifecycle events.
type EventBus interface {
	Publish(event string, data any)
}
