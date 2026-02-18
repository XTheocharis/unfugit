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

	// Level 1: Normal
	summary, err := s.summarizeNormal(ctx, messages)
	if err == nil && summary.TokenCount < inputTokens {
		return summary, nil
	}
	if err != nil {
		log.Printf("Level 1 summarization failed, escalating: %v", err)
	}
	lastGoodOutput := summary

	// Level 2: Aggressive
	summary, err = s.summarizeAggressive(ctx, messages)
	if err == nil && summary.TokenCount < inputTokens {
		return summary, nil
	}
	if err != nil {
		log.Printf("Level 2 summarization failed, escalating to fallback: %v", err)
	}
	if err == nil {
		lastGoodOutput = summary
	}

	// Level 3: Fallback
	if lastGoodOutput == nil {
		return nil, fmt.Errorf("all summarization levels failed (no output produced)")
	}
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
		SummaryID:  generateSummaryID(messages),
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
	response, err := s.llmClient.Generate(ctx, LLMRequest{
		Model:     s.model,
		Prompt:    prompt,
		MaxTokens: 500,
	})
	if err != nil {
		return nil, fmt.Errorf("level 2 aggressive summarization failed: %w", err)
	}
	fileIDs := extractFileIDs(formattedInput)
	content := appendFileIDMarkers(response.Text, fileIDs)
	return &Summary{
		SummaryID:  generateSummaryID(messages),
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
	for _, id := range fileIDs {
		fmt.Fprintf(&metadata, "\n[LCM File ID: %s]", id)
	}
	fmt.Fprintf(&metadata, "\n[Truncated from %d tokens to ≤%d tokens]",
		EstimateTokenCount(bestOutput), FallbackMaxTokens)

	finalContent := truncated + metadata.String()
	return &Summary{
		SummaryID:  generateSummaryID(originalMessages),
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

	condensed, err := s.condenseNormal(ctx, summaries)
	if err == nil && condensed.TokenCount < inputTokens {
		return condensed, nil
	}
	lastGoodOutput := condensed

	condensed, err = s.condenseAggressive(ctx, summaries)
	if err == nil && condensed.TokenCount < inputTokens {
		return condensed, nil
	}
	if err == nil {
		lastGoodOutput = condensed
	}

	if lastGoodOutput == nil {
		return nil, fmt.Errorf("all condensation levels failed (no output produced)")
	}
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
		SummaryID:  generateCondensedID(summaries),
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
	response, err := s.llmClient.Generate(ctx, LLMRequest{
		Model:     s.model,
		Prompt:    prompt,
		MaxTokens: 600,
	})
	if err != nil {
		return nil, err
	}
	parentIDs := getSummaryIDs(summaries)
	fileIDs := aggregateFileIDs(summaries)
	content := EnsureParentIDsPresent(response.Text, parentIDs)
	content = appendFileIDMarkers(content, fileIDs)
	return &Summary{
		SummaryID:  generateCondensedID(summaries),
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
	for _, id := range fileIDs {
		fmt.Fprintf(&metadata, "\n[LCM File ID: %s]", id)
	}
	fmt.Fprintf(&metadata, "\n[Truncated from %d tokens to ≤%d tokens]",
		EstimateTokenCount(bestOutput), FallbackMaxTokens)

	finalContent := truncated + "\n" + metadata.String()
	return &Summary{
		SummaryID:  generateCondensedID(originalSummaries),
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

func generateSummaryID(messages []LCMMessage) string {
	h := sha256.New()
	for _, msg := range messages {
		fmt.Fprintf(h, "%d|%s|%s", msg.CreatedAt, msg.Role, msg.Content)
	}
	hash := hex.EncodeToString(h.Sum(nil))
	return SummaryIDPrefix + hash[:SummaryIDLength]
}

func generateCondensedID(summaries []Summary) string {
	h := sha256.New()
	for _, summary := range summaries {
		h.Write([]byte(summary.SummaryID))
	}
	hash := hex.EncodeToString(h.Sum(nil))
	return SummaryIDPrefix + hash[:SummaryIDLength]
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

// appendFileIDMarkers appends [LCM File ID: ...] markers to content,
// matching Volt's behavior of embedding file IDs in all summarization levels.
func appendFileIDMarkers(content string, fileIDs []string) string {
	if len(fileIDs) == 0 {
		return content
	}
	var b strings.Builder
	b.WriteString(content)
	for _, id := range fileIDs {
		fmt.Fprintf(&b, "\n[LCM File ID: %s]", id)
	}
	return b.String()
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
