package lcm

import (
	"context"
	"fmt"
	"log"
)

// Compactor performs synchronous compaction of a session's context window.
type Compactor struct {
	store      Store
	summarizer Summarizer
}

// NewCompactor creates a new Compactor.
func NewCompactor(store Store, summarizer Summarizer) *Compactor {
	return &Compactor{store: store, summarizer: summarizer}
}

// CompactContext reduces context size through iterative summarization.
func (c *Compactor) CompactContext(
	ctx context.Context,
	sessionID string,
	budget TokenBudget,
) (int, error) {
	for round := 1; round <= MaxCompactionRounds; round++ {
		currentTokens, err := c.store.GetContextTokenCount(ctx, sessionID)
		if err != nil {
			return round, fmt.Errorf("failed to get context token count: %w", err)
		}

		// Target must be below softThreshold to ensure compaction makes progress.
		target := budget.SoftThreshold * (100 - TargetFreePercent) / 100

		if currentTokens <= target {
			log.Printf("Compaction complete after %d rounds: %d tokens (target: %d)",
				round, currentTokens, target)
			return round, nil
		}

		lastTokenCount := currentTokens

		shouldSummarize, err := c.shouldSummarizeMessages(ctx, sessionID)
		if err != nil {
			return round, fmt.Errorf("failed to determine compaction strategy: %w", err)
		}

		if shouldSummarize {
			if err := c.summarizeMessagesOnce(ctx, sessionID, budget); err != nil {
				return round, fmt.Errorf("failed to summarize messages: %w", err)
			}
		} else {
			if err := c.condenseSummariesOnce(ctx, sessionID); err != nil {
				return round, fmt.Errorf("failed to condense summaries: %w", err)
			}
		}

		// Progress check — runs outside the compaction transaction. A concurrent
		// message append can make this appear higher than lastTokenCount even though
		// compaction succeeded. The window is narrow; accepted tradeoff.
		newTokenCount, err := c.store.GetContextTokenCount(ctx, sessionID)
		if err != nil {
			return round, fmt.Errorf("failed to get context token count after compaction: %w", err)
		}
		if newTokenCount >= lastTokenCount {
			return round, fmt.Errorf("compaction made no progress (stuck at %d tokens)", newTokenCount)
		}
	}
	return MaxCompactionRounds, fmt.Errorf("compaction did not converge after %d rounds", MaxCompactionRounds)
}

func (c *Compactor) summarizeMessagesOnce(
	ctx context.Context,
	sessionID string,
	budget TokenBudget,
) error {
	// Phase 3.2: Primary strategy — token-budget windowed selection.
	// Uses a window function query to select messages fitting within a token budget.
	tokenBudget := budget.SoftThreshold / 2 // summarize up to half the soft threshold
	if tokenBudget < 1000 {
		tokenBudget = 1000
	}
	messagesToSummarize, err := c.store.GetMessagesToSummarizeByTokenBudget(ctx, sessionID, tokenBudget)
	if err != nil {
		// Fallback to row-limit approach if windowed query fails (e.g., old SQLite without window functions)
		log.Printf("Token-budget windowed selection failed, falling back to row limit: %v", err)
		messagesToSummarize, err = c.store.GetMessagesToSummarize(ctx, sessionID, 50)
		if err != nil {
			return err
		}
	}

	if len(messagesToSummarize) < MinMessagesToSummarize {
		return fmt.Errorf("not enough messages to summarize (got %d, need %d)",
			len(messagesToSummarize), MinMessagesToSummarize)
	}

	messageIDs := make([]string, len(messagesToSummarize))
	for i, m := range messagesToSummarize {
		messageIDs[i] = *m.MessageID
	}

	messages, err := c.store.GetMessagesByIDs(ctx, messageIDs)
	if err != nil {
		return err
	}

	summary, err := c.summarizer.SummarizeMessages(ctx, messages)
	if err != nil {
		return err
	}

	// Two separate operations — crash between them leaves a dangling summary
	// but ON CONFLICT DO NOTHING handles re-execution cleanly.
	if err := c.store.InsertLeafSummary(ctx, summary, messageIDs); err != nil {
		return err
	}

	positions := make([]int, len(messagesToSummarize))
	for i, m := range messagesToSummarize {
		positions[i] = m.Position
	}
	return c.store.ReplacePositionsWithSummary(ctx, sessionID, positions, summary.SummaryID)
}

func (c *Compactor) condenseSummariesOnce(
	ctx context.Context,
	sessionID string,
) error {
	// Phase 4.1: Condense ALL summaries in context, not just oldest 5.
	// First count to know total, then fetch all.
	summaryCount, err := c.store.CountSummariesInContext(ctx, sessionID)
	if err != nil {
		return err
	}
	if summaryCount < 1 {
		return fmt.Errorf("no summaries available to condense")
	}
	summariesToCondense, err := c.store.GetOldestSummariesInContext(ctx, sessionID, summaryCount)
	if err != nil {
		return err
	}
	if len(summariesToCondense) < 1 {
		return fmt.Errorf("no summaries available to condense")
	}

	summaryIDs := make([]string, len(summariesToCondense))
	for i, s := range summariesToCondense {
		summaryIDs[i] = *s.SummaryID
	}

	summaries, err := c.store.GetSummariesByIDs(ctx, summaryIDs)
	if err != nil {
		return err
	}

	condensed, err := c.summarizer.CondenseSummaries(ctx, summaries)
	if err != nil {
		return err
	}

	if err := c.store.InsertCondensedSummary(ctx, condensed, summaryIDs); err != nil {
		return err
	}

	positions := make([]int, len(summariesToCondense))
	for i, s := range summariesToCondense {
		positions[i] = s.Position
	}
	return c.store.ReplacePositionsWithSummary(ctx, sessionID, positions, condensed.SummaryID)
}

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
		// Not enough messages to summarize and no summaries to condense.
		// Return false with no error; the progress check will detect the stall.
		log.Printf("Insufficient items for compaction: %d messages (need %d), %d summaries (need ≥1)",
			messageCount, MinMessagesToSummarize, summaryCount)
		return false, nil
	}
	return false, nil
}
