package lcm

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// IT-26: File exploration framework — Volt has 30+ explorers for different
// file types (PDF, image, audio, video, etc.). This provides the framework
// and a text explorer; additional explorers can be registered at init time.

// ExplorationResult holds the output of a file exploration.
type ExplorationResult struct {
	Summary      string   // Human-readable summary of the file
	FileIDs      []string // Any file IDs referenced
	TokenCount   int      // Estimated tokens of the summary
	ExplorerUsed string   // Name of the explorer that produced this result
}

// Explorer processes a large file and produces a summarized representation.
type Explorer interface {
	// Name returns a unique identifier for this explorer.
	Name() string
	// CanExplore reports whether this explorer can handle the given path and MIME type.
	CanExplore(path string, mimeType string) bool
	// Explore reads and summarizes the file content.
	Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error)
}

// ExplorerRegistry manages registered explorers and dispatches exploration requests.
type ExplorerRegistry struct {
	explorers []Explorer
}

// NewExplorerRegistry creates a registry with all built-in explorers.
// Explorer order matters: dispatch returns first match (E21).
// Specific explorers come first, catch-alls (TextExplorer, FallbackExplorer) last.
func NewExplorerRegistry() *ExplorerRegistry {
	return &ExplorerRegistry{
		explorers: []Explorer{
			// Code explorers (most specific)
			&GoExplorer{},
			&PythonExplorer{},
			&RustExplorer{},
			&TypeScriptExplorer{},
			&JavaScriptExplorer{},
			&JavaExplorer{},
			&CExplorer{},
			&CppExplorer{},
			&CSharpExplorer{},
			&RubyExplorer{},
			&SwiftExplorer{},
			&ObjectiveCExplorer{},
			&CUDAExplorer{},
			&TclExplorer{},
			// Data format explorers
			&JSONExplorer{},
			&CSVExplorer{},
			&YAMLExplorer{},
			&TOMLExplorer{},
			&INIExplorer{},
			&XMLExplorer{},
			&HTMLExplorer{},
			// Text format explorers
			&MarkdownExplorer{},
			&LaTeXExplorer{},
			&CSSExplorer{},
			// Binary/media explorers
			&SQLiteExplorer{},
			&PDFExplorer{},
			&ImageExplorer{},
			&ExecutableExplorer{},
			&LogExplorer{},
			// Catch-all (must be last before fallback)
			&TextExplorer{},       // handles text/* and generic text
			&FallbackExplorer{},   // last resort for completely unknown types
		},
	}
}

// Register adds a new explorer to the registry.
func (r *ExplorerRegistry) Register(e Explorer) {
	r.explorers = append(r.explorers, e)
}

// RegisterLLMExplorer adds an LLM-based explorer when an LLMClient is available.
// E21: Must INSERT before TextExplorer/FallbackExplorer, not append — otherwise
// the catch-all explorers match first and the LLM explorer is never reached.
func (r *ExplorerRegistry) RegisterLLMExplorer(client LLMClient, model string) {
	llmExplorer := &LLMSummaryExplorer{client: client, model: model}
	// Insert before the last 2 entries (TextExplorer, FallbackExplorer)
	pos := len(r.explorers) - 2
	if pos < 0 {
		pos = 0
	}
	r.explorers = append(r.explorers[:pos], append([]Explorer{llmExplorer}, r.explorers[pos:]...)...)
}

// Explore finds a suitable explorer using Volt's 3-tier cascade (M8):
// extension → MIME type → magic bytes / catch-all.
// This ensures extension-specific explorers take priority over MIME-based ones.
func (r *ExplorerRegistry) Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
	ext := filepath.Ext(path)

	// Tier 1: Extension-based match.
	// Pass empty MIME to CanExplore so only extension/magic-byte logic triggers.
	// Catch-all explorers (text, fallback, llm-summary) are skipped.
	if ext != "" {
		for _, e := range r.explorers {
			if isCatchAllExplorer(e) {
				continue
			}
			if e.CanExplore(path, "") {
				return r.runExplorer(ctx, e, path, mimeType, maxTokens)
			}
		}
	}

	// Tier 2: MIME type match.
	// Pass empty path to CanExplore so only MIME logic triggers.
	if mimeType != "" {
		for _, e := range r.explorers {
			if isCatchAllExplorer(e) {
				continue
			}
			if e.CanExplore("", mimeType) {
				return r.runExplorer(ctx, e, path, mimeType, maxTokens)
			}
		}
	}

	// Tier 3: Full match (magic bytes, catch-all explorers).
	for _, e := range r.explorers {
		if e.CanExplore(path, mimeType) {
			return r.runExplorer(ctx, e, path, mimeType, maxTokens)
		}
	}

	return nil, nil
}

// isCatchAllExplorer returns true for generic explorers excluded from
// extension-only and MIME-only tiers to prevent premature matching.
func isCatchAllExplorer(e Explorer) bool {
	switch e.Name() {
	case "text", "fallback", "llm-summary":
		return true
	}
	return false
}

func (r *ExplorerRegistry) runExplorer(ctx context.Context, e Explorer, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
	result, err := e.Explore(ctx, path, mimeType, maxTokens)
	if err != nil {
		return nil, err
	}
	if result != nil {
		result.ExplorerUsed = e.Name()
	}
	return result, nil
}

// ListExplorers returns the names of all registered explorers.
func (r *ExplorerRegistry) ListExplorers() []string {
	names := make([]string, len(r.explorers))
	for i, e := range r.explorers {
		names[i] = e.Name()
	}
	return names
}

// --- Built-in Explorers ---

// TextExplorer handles text/* MIME types by reading and truncating content.
type TextExplorer struct{}

func (TextExplorer) Name() string { return "text" }

func (TextExplorer) CanExplore(_ string, mimeType string) bool {
	return strings.HasPrefix(mimeType, "text/") ||
		mimeType == "application/json" ||
		mimeType == "application/xml" ||
		mimeType == "application/javascript" ||
		mimeType == "application/typescript" ||
		mimeType == "application/x-yaml" ||
		mimeType == ""
}

func (TextExplorer) Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

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
	n, err := io.ReadFull(file, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	content := string(buf[:n])

	ext := filepath.Ext(path)
	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Type: %s, Size: %d bytes]\n", mimeType, stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated to first %d bytes of %d]\n", n, stat.Size())
	}
	summary.WriteString("\n")
	summary.WriteString(content)

	if truncated {
		// Ensure we don't break a partial line at the end
		if idx := strings.LastIndex(summary.String(), "\n"); idx > 0 {
			trimmed := summary.String()[:idx]
			summary.Reset()
			summary.WriteString(trimmed)
		}
		fmt.Fprintf(&summary, "\n\n[... truncated, %d bytes remaining]", stat.Size()-int64(n))
	}

	_ = ext // Available for future format-specific handling
	result := summary.String()
	return &ExplorationResult{
		Summary:    result,
		TokenCount: EstimateTokenCount(result),
	}, nil
}
