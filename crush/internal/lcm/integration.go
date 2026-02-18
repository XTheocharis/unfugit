package lcm

import (
	"context"
	"database/sql"
	"log"

	"github.com/charmbracelet/crush/internal/db"
)

// LCM is the top-level coordinator that Crush's agent loop calls.
type LCM struct {
	Store             Store
	Summarizer        Summarizer
	CompactionManager *CompactionManager
	ExplorerRegistry  *ExplorerRegistry
	AgenticMapManager *AgenticMapManager
	LlmMapManager     *LlmMapManager
	DefaultBudgetFunc func(sessionID string) (TokenBudget, error)
}

// NewLCM creates a fully-wired LCM instance (E10, E15).
// E15: param renamed from db to sqlDB to avoid shadowing the db package.
func NewLCM(
	sqlDB *sql.DB,
	queries *db.Queries,
	llmClient LLMClient,
	model string,
	prompts Prompts,
) *LCM {
	store := NewSQLiteStore(queries, sqlDB)
	summarizer := NewEscalationSummarizer(llmClient, model, prompts)
	eventBus := NewChannelEventBus(16)
	compactionMgr := NewCompactionManager(eventBus)
	registry := NewExplorerRegistry()
	if llmClient != nil {
		registry.RegisterLLMExplorer(llmClient, model)
	}
	agenticMap := NewAgenticMapManager(store)
	llmMap := NewLlmMapManager(store, llmClient)

	return &LCM{
		Store:             store,
		Summarizer:        summarizer,
		CompactionManager: compactionMgr,
		ExplorerRegistry:  registry,
		AgenticMapManager: agenticMap,
		LlmMapManager:     llmMap,
		DefaultBudgetFunc: func(sessionID string) (TokenBudget, error) {
			config, err := store.GetSessionConfig(context.Background(), sessionID)
			if err != nil {
				// No config stored — use sensible defaults.
				return ComputeTokenBudget(128_000, 0, 0, nil), nil
			}
			return ComputeTokenBudget(
				int(config.ModelCtxMaxTokens),
				0, 0,
				config.CtxCutoffThreshold,
			), nil
		},
	}
}

// AfterMessageAppended should be called after a new message is added to
// the session. It appends a context item and triggers compaction if needed.
func (l *LCM) AfterMessageAppended(
	ctx context.Context,
	sessionID string,
	messageID string,
) error {
	if err := l.Store.AppendContextItem(ctx, sessionID, "message", &messageID, nil); err != nil {
		return err
	}

	budget, err := l.DefaultBudgetFunc(sessionID)
	if err != nil {
		return err
	}
	currentTokens, err := l.Store.GetContextTokenCount(ctx, sessionID)
	if err != nil {
		return err
	}

	if currentTokens > budget.SoftThreshold {
		compactor := NewCompactor(l.Store, l.Summarizer)
		ch := l.CompactionManager.ScheduleCompaction(ctx, sessionID, compactor, budget)
		if ch != nil {
			go func() {
				result, ok := <-ch
				if ok && result.Error != nil {
					log.Printf("Background compaction error for %s: %v", sessionID, result.Error)
				}
			}()
		}
	}
	return nil
}

// GetContext returns the formatted context window for an LLM call.
func (l *LCM) GetContext(ctx context.Context, sessionID string) ([]ContextEntry, error) {
	return GetFormattedContext(ctx, l.Store, sessionID)
}

// Expand returns the original messages for a given summary ID.
func (l *LCM) Expand(ctx context.Context, summaryID string) ([]LCMMessage, error) {
	return ExpandSummary(ctx, l.Store, summaryID)
}

// Search performs full-text search across session summaries.
func (l *LCM) Search(ctx context.Context, sessionID string, query string, limit int) ([]Summary, error) {
	return SearchSummaries(ctx, l.Store, sessionID, query, limit)
}

// SearchMessages performs full-text search across session messages.
func (l *LCM) SearchMessages(ctx context.Context, sessionID string, query string, limit int) ([]LCMMessage, error) {
	return l.Store.SearchMessages(ctx, sessionID, query, limit)
}

// SearchMessagesRegex performs regex-based search across session messages.
func (l *LCM) SearchMessagesRegex(ctx context.Context, sessionID string, pattern string, limit int) ([]LCMMessage, error) {
	return l.Store.SearchMessagesRegex(ctx, sessionID, pattern, limit)
}

// ExploreFile explores a large file using the explorer registry, with caching.
func (l *LCM) ExploreFile(ctx context.Context, fileID string, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
	// Check cache first
	cached, err := l.Store.GetLargeFileExploration(ctx, fileID)
	if err == nil && cached != nil {
		return cached, nil
	}

	// Run exploration
	if l.ExplorerRegistry == nil {
		return nil, nil
	}
	result, err := l.ExplorerRegistry.Explore(ctx, path, mimeType, maxTokens)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	// Cache the result
	if cacheErr := l.Store.SetLargeFileExploration(ctx, fileID, result); cacheErr != nil {
		log.Printf("Failed to cache exploration for %s: %v", fileID, cacheErr)
	}

	return result, nil
}

// CreateAgenticMapRun creates a new agentic map run from the given config.
func (l *LCM) CreateAgenticMapRun(ctx context.Context, config MapRunConfig) (string, error) {
	return l.AgenticMapManager.CreateRun(ctx, config)
}

// CreateLlmMapRun creates a new LLM map run from the given config.
func (l *LCM) CreateLlmMapRun(ctx context.Context, config LlmMapRunConfig) (string, error) {
	return l.LlmMapManager.CreateRun(ctx, config)
}
