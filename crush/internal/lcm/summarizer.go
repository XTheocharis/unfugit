package lcm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"
)

// EscalationSummarizer implements three-level escalation for summarization.
type EscalationSummarizer struct {
	llmClient LLMClient
	model     string
	prompts   Prompts
}

// Prompts holds the prompt templates for each summarization level.
type Prompts struct {
	SummarizeNormal     string
	SummarizeAggressive string
	CondenseNormal      string
	CondenseAggressive  string
}

// NewEscalationSummarizer creates a new EscalationSummarizer.
func NewEscalationSummarizer(client LLMClient, model string, prompts Prompts) *EscalationSummarizer {
	return &EscalationSummarizer{llmClient: client, model: model, prompts: prompts}
}

// SummarizeMessages implements Summarizer with three-level escalation.
func (s *EscalationSummarizer) SummarizeMessages(
	ctx context.Context, messages []LCMMessage,
) (*Summary, error) {
	if len(messages) == 0 {
		return nil, fmt.Errorf("no messages to summarize")
	}
	inputTokens := calculateInputTokens(messages)

	// Level 1: Normal — API errors propagate (matching Volt's behavior where
	// generateText exceptions abort compaction rather than triggering escalation).
	summary, err := s.summarizeNormal(ctx, messages)
	if err != nil {
		return nil, fmt.Errorf("summarization failed: %w", err)
	}
	if summary.TokenCount < inputTokens {
		return summary, nil
	}
	log.Printf("Normal summary not smaller than input (%d >= %d), escalating to aggressive",
		summary.TokenCount, inputTokens)
	lastGoodOutput := summary

	// Level 2: Aggressive — API errors propagate, only size triggers fallback.
	summary, err = s.summarizeAggressive(ctx, messages)
	if err != nil {
		return nil, fmt.Errorf("aggressive summarization failed: %w", err)
	}
	if summary.TokenCount < inputTokens {
		return summary, nil
	}
	log.Printf("Aggressive summary not smaller than input (%d >= %d), escalating to fallback",
		summary.TokenCount, inputTokens)
	lastGoodOutput = summary

	// Level 3: Fallback (deterministic truncation, guaranteed smaller)
	return s.summarizeFallback(lastGoodOutput.Content, messages)
}

func (s *EscalationSummarizer) summarizeNormal(
	ctx context.Context, messages []LCMMessage,
) (*Summary, error) {
	formattedInput := FormatMessagesForSummary(messages)
	prompt := buildPrompt(s.prompts.SummarizeNormal, formattedInput)
	response, err := s.llmClient.Generate(ctx, LLMRequest{
		Model:  s.model,
		Prompt: prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("level 1 summarization failed: %w", err)
	}
	fileIDs := extractFileIDs(formattedInput)
	content := appendFileIDMarkers(response.Text, fileIDs)
	return &Summary{
		SummaryID:  generateSummaryID(content),
		SessionID:  messages[0].SessionID,
		Kind:       SummaryKindLeaf,
		Content:    content,
		TokenCount: int64(EstimateTokenCount(content)),
		FileIDs:    fileIDs,
	}, nil
}

func (s *EscalationSummarizer) summarizeAggressive(
	ctx context.Context, messages []LCMMessage,
) (*Summary, error) {
	formattedInput := FormatMessagesForSummary(messages)
	prompt := buildPrompt(s.prompts.SummarizeAggressive, formattedInput)
	// Volt omits maxTokens for all levels — brevity is prompt-guided, not API-enforced.
	response, err := s.llmClient.Generate(ctx, LLMRequest{
		Model:  s.model,
		Prompt: prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("level 2 aggressive summarization failed: %w", err)
	}
	fileIDs := extractFileIDs(formattedInput)
	content := appendFileIDMarkers(response.Text, fileIDs)
	return &Summary{
		SummaryID:  generateSummaryID(content),
		SessionID:  messages[0].SessionID,
		Kind:       SummaryKindLeaf,
		Content:    content,
		TokenCount: int64(EstimateTokenCount(content)),
		FileIDs:    fileIDs,
	}, nil
}

func (s *EscalationSummarizer) summarizeFallback(
	bestOutput string, originalMessages []LCMMessage,
) (*Summary, error) {
	maxRunes := (FallbackMaxTokens - FallbackMetadataReserve) * CharsPerToken
	runes := []rune(bestOutput)
	truncated := string(runes)
	if len(runes) > maxRunes {
		truncated = string(runes[:maxRunes])
	}

	fileIDs := extractFileIDsFromMessages(originalMessages)
	var metadata strings.Builder
	if len(fileIDs) > 0 {
		fmt.Fprintf(&metadata, "\n[LCM File IDs: %s]", strings.Join(fileIDs, ", "))
	}
	fmt.Fprintf(&metadata, "\n[Truncated from %d tokens to ≤%d tokens]",
		EstimateTokenCount(bestOutput), FallbackMaxTokens)

	finalContent := truncated + metadata.String()
	return &Summary{
		SummaryID:  generateSummaryID(finalContent),
		SessionID:  originalMessages[0].SessionID,
		Kind:       SummaryKindLeaf,
		Content:    finalContent,
		TokenCount: int64(EstimateTokenCount(finalContent)),
		FileIDs:    fileIDs,
	}, nil
}

// CondenseSummaries compresses summaries into a single condensed node.
func (s *EscalationSummarizer) CondenseSummaries(
	ctx context.Context, summaries []Summary,
) (*Summary, error) {
	if len(summaries) == 0 {
		return nil, fmt.Errorf("need at least 1 summary to condense, got 0")
	}
	inputTokens := calculateSummaryTokens(summaries)

	// Level 1: Normal — API errors propagate (matching Volt).
	condensed, err := s.condenseNormal(ctx, summaries)
	if err != nil {
		return nil, fmt.Errorf("condensation failed: %w", err)
	}
	if condensed.TokenCount < inputTokens {
		return condensed, nil
	}
	lastGoodOutput := condensed

	// Level 2: Aggressive — API errors propagate, only size triggers fallback.
	condensed, err = s.condenseAggressive(ctx, summaries)
	if err != nil {
		return nil, fmt.Errorf("aggressive condensation failed: %w", err)
	}
	if condensed.TokenCount < inputTokens {
		return condensed, nil
	}
	lastGoodOutput = condensed

	// Level 3: Fallback (deterministic truncation, guaranteed smaller)
	return s.condenseFallback(lastGoodOutput.Content, summaries)
}

func (s *EscalationSummarizer) condenseNormal(
	ctx context.Context, summaries []Summary,
) (*Summary, error) {
	prompt := buildCondensePrompt(s.prompts.CondenseNormal, summaries)
	response, err := s.llmClient.Generate(ctx, LLMRequest{
		Model:  s.model,
		Prompt: prompt,
	})
	if err != nil {
		return nil, err
	}
	parentIDs := getSummaryIDs(summaries)
	fileIDs := aggregateFileIDs(summaries)
	content := EnsureParentIDsPresent(response.Text, parentIDs)
	content = appendFileIDMarkers(content, fileIDs)
	return &Summary{
		SummaryID:  generateCondensedID(content),
		SessionID:  summaries[0].SessionID,
		Kind:       SummaryKindCondensed,
		Content:    content,
		TokenCount: int64(EstimateTokenCount(content)),
		FileIDs:    fileIDs,
	}, nil
}

func (s *EscalationSummarizer) condenseAggressive(
	ctx context.Context, summaries []Summary,
) (*Summary, error) {
	prompt := buildCondensePrompt(s.prompts.CondenseAggressive, summaries)
	// Volt omits maxTokens for all levels — brevity is prompt-guided, not API-enforced.
	response, err := s.llmClient.Generate(ctx, LLMRequest{
		Model:  s.model,
		Prompt: prompt,
	})
	if err != nil {
		return nil, err
	}
	parentIDs := getSummaryIDs(summaries)
	fileIDs := aggregateFileIDs(summaries)
	content := EnsureParentIDsPresent(response.Text, parentIDs)
	content = appendFileIDMarkers(content, fileIDs)
	return &Summary{
		SummaryID:  generateCondensedID(content),
		SessionID:  summaries[0].SessionID,
		Kind:       SummaryKindCondensed,
		Content:    content,
		TokenCount: int64(EstimateTokenCount(content)),
		FileIDs:    fileIDs,
	}, nil
}

func (s *EscalationSummarizer) condenseFallback(
	bestOutput string, originalSummaries []Summary,
) (*Summary, error) {
	maxRunes := (FallbackMaxTokens - FallbackMetadataReserve) * CharsPerToken
	runes := []rune(bestOutput)
	truncated := string(runes)
	if len(runes) > maxRunes {
		truncated = string(runes[:maxRunes])
	}

	parentIDs := getSummaryIDs(originalSummaries)
	fileIDs := aggregateFileIDs(originalSummaries)
	var metadata strings.Builder
	fmt.Fprintf(&metadata, "[Condensed from: %s]", strings.Join(parentIDs, ", "))
	if len(fileIDs) > 0 {
		fmt.Fprintf(&metadata, "\n[LCM File IDs: %s]", strings.Join(fileIDs, ", "))
	}
	fmt.Fprintf(&metadata, "\n[Truncated from %d tokens to ≤%d tokens]",
		EstimateTokenCount(bestOutput), FallbackMaxTokens)

	finalContent := truncated + "\n" + metadata.String()
	return &Summary{
		SummaryID:  generateCondensedID(finalContent),
		SessionID:  originalSummaries[0].SessionID,
		Kind:       SummaryKindCondensed,
		Content:    finalContent,
		TokenCount: int64(EstimateTokenCount(finalContent)),
		FileIDs:    fileIDs,
	}, nil
}

// condensedFromPattern matches the [Condensed from: ...] header line.
var condensedFromPattern = regexp.MustCompile(`(?m)^\[Condensed from:.*?\]`)

// EnsureParentIDsPresent ensures all parent IDs appear in the content.
func EnsureParentIDsPresent(content string, parentIDs []string) string {
	fullHeader := fmt.Sprintf("[Condensed from: %s]", strings.Join(parentIDs, ", "))
	if !condensedFromPattern.MatchString(content) {
		return fullHeader + "\n" + content
	}
	for _, id := range parentIDs {
		if !strings.Contains(content, id) {
			return condensedFromPattern.ReplaceAllString(content, fullHeader)
		}
	}
	return content
}

// generateSummaryID creates a summary ID from output content + timestamp (SC-2, E3).
// Phase 4.2: Changed from hashing input messages to hashing output content,
// matching Volt's behavior where the same messages can produce different summaries.
func generateSummaryID(content string) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s%d", content, time.Now().UnixMilli())
	hash := hex.EncodeToString(h.Sum(nil))
	return SummaryIDPrefix + hash[:SummaryIDLength]
}

// generateCondensedID creates an ID for condensed summaries using the same
// content + timestamp pattern as generateSummaryID (E3).
func generateCondensedID(content string) string {
	return generateSummaryID(content)
}

func calculateInputTokens(messages []LCMMessage) int64 {
	var total int64
	for _, msg := range messages {
		total += int64(msg.TokenCount)
	}
	return total
}

func calculateSummaryTokens(summaries []Summary) int64 {
	var total int64
	for _, s := range summaries {
		total += s.TokenCount
	}
	return total
}

func buildPrompt(template, input string) string {
	return strings.ReplaceAll(template, "{{messages}}", input)
}

func buildCondensePrompt(template string, summaries []Summary) string {
	var builder strings.Builder
	for i, summary := range summaries {
		fmt.Fprintf(&builder, "--- Summary %d (ID: %s) ---\n%s\n",
			i+1, summary.SummaryID, summary.Content)
	}
	return strings.ReplaceAll(template, "{{summaries}}", builder.String())
}

func getSummaryIDs(summaries []Summary) []string {
	ids := make([]string, len(summaries))
	for i, s := range summaries {
		ids[i] = s.SummaryID
	}
	return ids
}

// appendFileIDMarkers appends Volt's plural [LCM File IDs: ...] marker to content.
// Volt format (summarize.ts:103): [LCM File IDs: file_xxx, file_yyy]
func appendFileIDMarkers(content string, fileIDs []string) string {
	if len(fileIDs) == 0 {
		return content
	}
	return content + fmt.Sprintf("\n[LCM File IDs: %s]", strings.Join(fileIDs, ", "))
}

func aggregateFileIDs(summaries []Summary) []string {
	seen := make(map[string]bool)
	var fileIDs []string
	for _, summary := range summaries {
		for _, fileID := range summary.FileIDs {
			if !seen[fileID] {
				seen[fileID] = true
				fileIDs = append(fileIDs, fileID)
			}
		}
		for _, fileID := range extractFileIDs(summary.Content) {
			if !seen[fileID] {
				seen[fileID] = true
				fileIDs = append(fileIDs, fileID)
			}
		}
	}
	sort.Strings(fileIDs)
	return fileIDs
}
