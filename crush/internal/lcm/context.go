package lcm

import (
	"context"
	"fmt"
	"strings"
)

// GetFormattedContext retrieves and formats the active context window.
func GetFormattedContext(
	ctx context.Context,
	store Store,
	sessionID string,
) ([]ContextEntry, error) {
	entries, err := store.GetCurrentContext(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	for i, entry := range entries {
		if entry.ItemType == "summary" && entry.SummaryID != nil {
			var parentIDs []string
			parentIDs, err = store.GetSummaryParentIDs(ctx, *entry.SummaryID)
			if err != nil {
				return nil, err
			}
			formatted := FormatSummaryForContext(*entry.SummaryID, entry.Content, parentIDs)
			overhead := GetSummaryFormattingOverhead(*entry.SummaryID, parentIDs)
			entries[i].Content = formatted
			entries[i].TokenCount += overhead
		}
	}

	return entries, nil
}

// FormatSummaryForContext injects metadata at the beginning of summary content.
func FormatSummaryForContext(summaryID string, content string, parentIDs []string) string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "[Summary ID: %s]\n", summaryID)
	if len(parentIDs) > 0 {
		fmt.Fprintf(&builder, "[Parent Summaries: %s]\n", strings.Join(parentIDs, ", "))
	}
	builder.WriteString("\n")
	builder.WriteString(content)
	return builder.String()
}

// GetSummaryFormattingOverhead calculates the token overhead from injected metadata.
func GetSummaryFormattingOverhead(summaryID string, parentIDs []string) int {
	var lines []string
	lines = append(lines, fmt.Sprintf("[Summary ID: %s]", summaryID))
	if len(parentIDs) > 0 {
		lines = append(lines, fmt.Sprintf("[Parent Summaries: %s]", strings.Join(parentIDs, ", ")))
	}
	lines = append(lines, "")
	return EstimateTokenCount(strings.Join(lines, "\n"))
}
