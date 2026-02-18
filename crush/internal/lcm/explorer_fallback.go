package lcm

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// --- FallbackExplorer ---

// FallbackExplorer matches any file and provides a hex dump of the first 64 bytes
// plus magic byte identification. It is intended as a last-resort explorer.
type FallbackExplorer struct{}

func (FallbackExplorer) Name() string { return "fallback" }

func (FallbackExplorer) CanExplore(_ string, _ string) bool { return true }

func (FallbackExplorer) Explore(_ context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	// Read first N bytes (up to maxTokens*CharsPerToken, but at least 64 for the hex dump)
	maxBytes := maxTokens * CharsPerToken
	if maxBytes < 64 {
		maxBytes = 64
	}
	if maxBytes > maxLargeFileRead {
		maxBytes = maxLargeFileRead
	}

	readSize := int(stat.Size())
	if readSize > maxBytes {
		readSize = maxBytes
	}

	buf := make([]byte, readSize)
	n, err := io.ReadFull(f, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	buf = buf[:n]

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if mimeType != "" {
		fmt.Fprintf(&summary, "[MIME: %s]\n", mimeType)
	}

	// Magic byte identification
	magic := identifyMagicBytes(buf)
	if magic != "" {
		fmt.Fprintf(&summary, "[Identified: %s]\n", magic)
	}

	// Hex dump of first 64 bytes
	hexDumpSize := 64
	if n < hexDumpSize {
		hexDumpSize = n
	}
	summary.WriteString("[Hex dump (first 64 bytes):]\n")
	for i := 0; i < hexDumpSize; i++ {
		if i > 0 && i%16 == 0 {
			summary.WriteString("\n")
		} else if i > 0 && i%8 == 0 {
			summary.WriteString("  ")
		} else if i > 0 {
			summary.WriteString(" ")
		}
		fmt.Fprintf(&summary, "%02x", buf[i])
	}
	summary.WriteString("\n")

	result := summary.String()
	return &ExplorationResult{
		Summary:      result,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "fallback",
	}, nil
}

// identifyMagicBytes attempts to identify a file type from its leading bytes.
func identifyMagicBytes(data []byte) string {
	if len(data) < 2 {
		return ""
	}
	// SQLite
	if len(data) >= 16 && string(data[:16]) == "SQLite format 3\x00" {
		return "SQLite Database"
	}
	// PDF
	if len(data) >= 4 && string(data[:4]) == "%PDF" {
		return "PDF Document"
	}
	// PNG
	if len(data) >= 4 && data[0] == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G' {
		return "PNG Image"
	}
	// JPEG
	if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return "JPEG Image"
	}
	// GIF
	if len(data) >= 3 && string(data[:3]) == "GIF" {
		return "GIF Image"
	}
	// BMP
	if data[0] == 'B' && data[1] == 'M' {
		return "BMP Image"
	}
	// WebP
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "WebP Image"
	}
	// ELF
	if len(data) >= 4 && data[0] == 0x7F && data[1] == 'E' && data[2] == 'L' && data[3] == 'F' {
		return "ELF Executable"
	}
	// Mach-O
	if len(data) >= 4 {
		if data[0] == 0xFE && data[1] == 0xED && data[2] == 0xFA {
			return "Mach-O Executable"
		}
		if data[0] == 0xCF && data[1] == 0xFA && data[2] == 0xED && data[3] == 0xFE {
			return "Mach-O Executable (64-bit)"
		}
		if data[0] == 0xCE && data[1] == 0xFA && data[2] == 0xED && data[3] == 0xFE {
			return "Mach-O Executable (32-bit)"
		}
	}
	// PE / DOS
	if data[0] == 'M' && data[1] == 'Z' {
		return "PE/DOS Executable"
	}
	// ZIP (also covers .jar, .docx, .xlsx, etc.)
	if len(data) >= 4 && data[0] == 'P' && data[1] == 'K' && data[2] == 0x03 && data[3] == 0x04 {
		return "ZIP Archive"
	}
	// Gzip
	if data[0] == 0x1F && data[1] == 0x8B {
		return "Gzip Compressed"
	}
	return ""
}

// --- LLMSummaryExplorer ---

// LLMSummaryExplorer uses an LLM client to generate a structured summary of file content.
// It falls back to truncation if the LLM call fails. It only explores files under 50000 tokens.
type LLMSummaryExplorer struct {
	client LLMClient
	model  string
}

// NewLLMSummaryExplorer creates a new LLMSummaryExplorer with the given LLM client and model.
func NewLLMSummaryExplorer(client LLMClient, model string) *LLMSummaryExplorer {
	return &LLMSummaryExplorer{client: client, model: model}
}

func (e *LLMSummaryExplorer) Name() string { return "llm-summary" }

func (e *LLMSummaryExplorer) CanExplore(_ string, _ string) bool { return true }

// llmSummaryMaxTokens is the token limit for files the LLM summary explorer will process.
const llmSummaryMaxTokens = 50000

func (e *LLMSummaryExplorer) Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	// Token limit check: only explore files under 50000 tokens
	estimatedTokens := EstimateTokenCountFromBytes(stat.Size())
	if estimatedTokens > llmSummaryMaxTokens {
		return nil, fmt.Errorf("file too large for LLM summary: estimated %d tokens exceeds limit of %d", estimatedTokens, llmSummaryMaxTokens)
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	maxBytes := int64(maxTokens * CharsPerToken)
	if maxBytes > int64(maxLargeFileRead) {
		maxBytes = int64(maxLargeFileRead)
	}

	readSize := stat.Size()
	truncated := false
	if readSize > maxBytes {
		readSize = maxBytes
		truncated = true
	}

	buf := make([]byte, readSize)
	n, err := io.ReadFull(f, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	content := string(buf[:n])

	// Build prompt for LLM
	prompt := buildLLMExplorerPrompt(filepath.Base(path), mimeType, content, truncated)

	// Attempt LLM summarization
	resp, err := e.client.Generate(ctx, LLMRequest{
		Model:     e.model,
		Prompt:    prompt,
		MaxTokens: maxTokens,
	})
	if err != nil {
		// Fall back to truncation
		return e.fallbackTruncation(path, mimeType, content, stat, truncated)
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if mimeType != "" {
		fmt.Fprintf(&summary, "[MIME: %s]\n", mimeType)
	}
	fmt.Fprintf(&summary, "[Explorer: LLM Summary]\n\n")
	summary.WriteString(resp.Text)

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "llm-summary",
	}, nil
}

// fallbackTruncation produces a truncated summary when the LLM call fails.
func (e *LLMSummaryExplorer) fallbackTruncation(path string, mimeType string, content string, stat os.FileInfo, truncated bool) (*ExplorationResult, error) {
	maxRunes := (FallbackMaxTokens - FallbackMetadataReserve) * CharsPerToken
	runes := []rune(content)
	truncatedContent := string(runes)
	if len(runes) > maxRunes {
		truncatedContent = string(runes[:maxRunes])
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if mimeType != "" {
		fmt.Fprintf(&summary, "[MIME: %s]\n", mimeType)
	}
	fmt.Fprintf(&summary, "[Explorer: LLM Summary (fallback — LLM unavailable)]\n")
	if truncated {
		fmt.Fprintf(&summary, "[Truncated to first %d characters]\n", maxRunes)
	}
	summary.WriteString("\n")
	summary.WriteString(truncatedContent)

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "llm-summary",
	}, nil
}

// buildLLMExplorerPrompt constructs the prompt sent to the LLM for file summarization.
func buildLLMExplorerPrompt(filename string, mimeType string, content string, truncated bool) string {
	var prompt strings.Builder
	prompt.WriteString("Analyze the following file and produce a structured summary.\n\n")
	fmt.Fprintf(&prompt, "File: %s\n", filename)
	if mimeType != "" {
		fmt.Fprintf(&prompt, "MIME type: %s\n", mimeType)
	}
	if truncated {
		prompt.WriteString("Note: The file content has been truncated.\n")
	}
	prompt.WriteString("\nPlease provide:\n")
	prompt.WriteString("1. A brief description of the file's purpose\n")
	prompt.WriteString("2. Key structural elements (functions, classes, sections, etc.)\n")
	prompt.WriteString("3. Notable patterns or dependencies\n")
	prompt.WriteString("4. Any file references or identifiers\n\n")
	prompt.WriteString("File content:\n```\n")
	prompt.WriteString(content)
	prompt.WriteString("\n```\n")
	return prompt.String()
}
