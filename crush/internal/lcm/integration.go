package lcm

import (
	"context"
	"log"
)

// LCM is the top-level coordinator that Crush's agent loop calls.
type LCM struct {
	Store             Store
	Summarizer        Summarizer
	CompactionManager *CompactionManager
	DefaultBudgetFunc func(sessionID string) (TokenBudget, error)
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
