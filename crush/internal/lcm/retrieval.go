package lcm

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
)

// ExpandSummary recursively expands a summary ID to its original messages.
func ExpandSummary(
	ctx context.Context,
	store Store,
	summaryID string,
) ([]LCMMessage, error) {
	return expandSummaryWithVisited(ctx, store, summaryID, make(map[string]bool))
}

func expandSummaryWithVisited(
	ctx context.Context,
	store Store,
	summaryID string,
	visited map[string]bool,
) ([]LCMMessage, error) {
	if visited[summaryID] {
		return nil, fmt.Errorf("cycle detected in summary DAG at node %s", summaryID)
	}
	visited[summaryID] = true

	messages, err := store.ExpandSummaryToMessages(ctx, summaryID)
	if err != nil {
		return nil, fmt.Errorf("failed to expand summary %s to messages: %w", summaryID, err)
	}
	if len(messages) > 0 {
		return messages, nil
	}

	parentIDs, err := store.GetSummaryParentIDs(ctx, summaryID)
	if err != nil {
		return nil, fmt.Errorf("failed to get parents for %s: %w", summaryID, err)
	}
	if len(parentIDs) == 0 {
		// Orphaned summary with no messages and no parents (e.g., from a crash
		// during insert). Return empty slice instead of erroring, consistent
		// with Volt's CTE which silently returns an empty result set.
		log.Printf("Warning: summary %s has no messages and no parents — possible orphaned data", summaryID)
		return nil, nil
	}

	var allMessages []LCMMessage
	for _, parentID := range parentIDs {
		msgs, err := expandSummaryWithVisited(ctx, store, parentID, visited)
		if err != nil {
			return nil, err
		}
		allMessages = append(allMessages, msgs...)
	}
	// Volt's expandSummaryToMessages uses ORDER BY m.seq to maintain
	// chronological conversation order. Sort by CreatedAt as the Go equivalent.
	sort.Slice(allMessages, func(i, j int) bool {
		return allMessages[i].CreatedAt < allMessages[j].CreatedAt
	})
	return allMessages, nil
}

// SearchSummaries performs full-text search across summaries using FTS5.
func SearchSummaries(
	ctx context.Context,
	store Store,
	sessionID string,
	query string,
	limit int,
) ([]Summary, error) {
	return store.SearchSummaries(ctx, sessionID, query, limit)
}

// FormatExpandedMessages formats expanded messages for display.
func FormatExpandedMessages(messages []LCMMessage) string {
	var builder strings.Builder
	for _, msg := range messages {
		fmt.Fprintf(&builder, "[%s] (%s)\n%s\n\n", msg.ID, msg.Role, msg.Content)
	}
	return builder.String()
}
