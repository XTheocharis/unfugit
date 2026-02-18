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
	FileID             string
	SessionID          string
	OriginalPath       string
	MimeType           string
	TokenCount         int64
	CreatedAt          int64
	ExplorationSummary string // E6: exploration cache fields
	ExplorerUsed       string // E6: which explorer produced the summary
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

// --- MAP/REDUCE DOMAIN TYPES ---

// AgenticMapRun represents an agentic map operation.
type AgenticMapRun struct {
	MapID          string
	RunStartedAt   int64
	Status         string
	InputPath      string
	InputLcmID     string
	OutputPath     string
	OutputLcmID    string
	Prompt         string
	OutputSchema   string
	ReadOnly       bool
	Concurrency    int
	TimeoutSeconds int
	MaxAttempts    int
}

// AgenticMapItem represents a single item in an agentic map operation.
type AgenticMapItem struct {
	MapID        string
	ItemIndex    int
	Item         string
	Status       string
	AttemptsUsed int
	StartedAt    int64
	FinishedAt   int64
	Result       string
	Error        string
}

// LlmMapRun represents an LLM map operation (E18).
type LlmMapRun struct {
	MapID                    string
	RunStartedAt             int64
	Status                   string
	InputPath                string
	InputLcmID               string
	OutputPath               string
	OutputLcmID              string
	Prompt                   string
	OutputSchema             string
	Model                    string
	Concurrency              int
	TimeoutSeconds           int
	MaxAttempts              int
	ResolvedProvider         string
	ResolvedModel            string
	ResolvedRequestOverrides string
}

// LlmMapItem represents a single item in an LLM map operation.
type LlmMapItem struct {
	MapID        string
	ItemIndex    int
	Item         string
	Status       string
	AttemptsUsed int
	StartedAt    int64
	FinishedAt   int64
	Result       string
	Error        string
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

// SessionConfig holds per-session LCM settings (DB-15/DB-16).
type SessionConfig struct {
	SessionID          string
	ModelName          string
	ModelCtxMaxTokens  int64
	CtxCutoffThreshold *int
	CreatedAt          int64
	UpdatedAt          int64
}

// Store abstracts all database operations for LCM.
type Store interface {
	// --- Context window operations ---
	GetCurrentContext(ctx context.Context, sessionID string) ([]ContextEntry, error)
	GetContextTokenCount(ctx context.Context, sessionID string) (int, error)
	ReplacePositionsWithSummary(ctx context.Context, sessionID string, positions []int, summaryID string) error
	AppendContextItem(ctx context.Context, sessionID string, itemType string, messageID *string, summaryID *string) error
	GetMessagesToSummarize(ctx context.Context, sessionID string, rowLimit int) ([]ContextEntry, error)
	GetMessagesToSummarizeByTokenBudget(ctx context.Context, sessionID string, tokenBudget int) ([]ContextEntry, error) // Phase 3.2
	CountMessagesInContext(ctx context.Context, sessionID string) (int, error)
	CountSummariesInContext(ctx context.Context, sessionID string) (int, error)

	// --- Message operations ---
	GetMessagesByIDs(ctx context.Context, ids []string) ([]LCMMessage, error)

	// --- Summary CRUD ---
	InsertLeafSummary(ctx context.Context, summary *Summary, messageIDs []string) error
	InsertCondensedSummary(ctx context.Context, summary *Summary, parentIDs []string) error
	GetSummariesByIDs(ctx context.Context, ids []string) ([]Summary, error)
	GetSummaryParentIDs(ctx context.Context, summaryID string) ([]string, error)
	GetOldestSummariesInContext(ctx context.Context, sessionID string, limit int) ([]ContextEntry, error)
	ExpandSummaryToMessages(ctx context.Context, summaryID string) ([]LCMMessage, error)
	GetAllSummaries(ctx context.Context, sessionID string) ([]Summary, error)             // SQ-2
	DeleteSummary(ctx context.Context, summaryID string) error                             // SQ-2
	GetChildSummaryIDs(ctx context.Context, summaryID string) ([]string, error)            // DB-26
	GetCoveringSummary(ctx context.Context, sessionID string, minMessages int) (*Summary, error) // DB-25
	GetAncestorSessionIDs(ctx context.Context, summaryID string) ([]string, error)         // DB-27

	// --- Large file operations ---
	InsertLargeFileFromPath(ctx context.Context, sessionID string, filePath string, mimeType string) (*LargeFile, error)
	GetLargeFile(ctx context.Context, fileID string) (*LargeFile, error)
	GetLargeFileExploration(ctx context.Context, fileID string) (*ExplorationResult, error)    // Phase 5.2
	SetLargeFileExploration(ctx context.Context, fileID string, result *ExplorationResult) error // Phase 5.2

	// --- Search operations ---
	SearchSummaries(ctx context.Context, sessionID string, query string, limit int) ([]Summary, error)
	SearchMessages(ctx context.Context, sessionID string, query string, limit int) ([]LCMMessage, error)      // DB-23
	SearchMessagesRegex(ctx context.Context, sessionID string, pattern string, limit int) ([]LCMMessage, error) // DB-24

	// --- Session config (DB-15/DB-16) ---
	GetSessionConfig(ctx context.Context, sessionID string) (*SessionConfig, error)
	SetSessionConfig(ctx context.Context, config *SessionConfig) error

	// --- Agentic map operations (Phase 6) ---
	CreateAgenticMapRun(ctx context.Context, run *AgenticMapRun) error
	GetAgenticMapRun(ctx context.Context, mapID string) (*AgenticMapRun, error)
	UpdateAgenticMapRunStatus(ctx context.Context, mapID, status string) error
	CreateAgenticMapItem(ctx context.Context, item *AgenticMapItem) error
	UpdateAgenticMapItem(ctx context.Context, item *AgenticMapItem) error
	GetAgenticMapItemsByStatus(ctx context.Context, mapID, status string) ([]AgenticMapItem, error)

	// --- LLM map operations (Phase 6) ---
	CreateLlmMapRun(ctx context.Context, run *LlmMapRun) error
	GetLlmMapRun(ctx context.Context, mapID string) (*LlmMapRun, error)
	UpdateLlmMapRunStatus(ctx context.Context, mapID, status string) error
	CreateLlmMapItem(ctx context.Context, item *LlmMapItem) error
	UpdateLlmMapItem(ctx context.Context, item *LlmMapItem) error
	GetLlmMapItemsByStatus(ctx context.Context, mapID, status string) ([]LlmMapItem, error)
}

// EventBus publishes compaction lifecycle events.
type EventBus interface {
	Publish(event string, data any)
}

// NoOpEventBus is a silent EventBus for when no event handling is needed.
type NoOpEventBus struct{}

func (NoOpEventBus) Publish(string, any) {}

// ChannelEventBus delivers events via a buffered channel for consumers.
type ChannelEventBus struct {
	C chan Event
}

// Event is a typed event delivered through ChannelEventBus.
type Event struct {
	Name string
	Data any
}

// NewChannelEventBus creates an event bus with the given buffer size.
func NewChannelEventBus(bufSize int) *ChannelEventBus {
	return &ChannelEventBus{C: make(chan Event, bufSize)}
}

func (b *ChannelEventBus) Publish(event string, data any) {
	select {
	case b.C <- Event{Name: event, Data: data}:
	default:
		// Drop event if channel is full to avoid blocking compaction.
	}
}
