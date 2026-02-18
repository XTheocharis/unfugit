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
	Summary   string   // Human-readable summary of the file
	FileIDs   []string // Any file IDs referenced
	TokenCount int     // Estimated tokens of the summary
}

// Explorer processes a large file and produces a summarized representation.
type Explorer interface {
	// Name returns a unique identifier for this explorer.
	Name() string
	// CanExplore reports whether this explorer can handle the given MIME type.
	CanExplore(mimeType string) bool
	// Explore reads and summarizes the file content.
	Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error)
}

// ExplorerRegistry manages registered explorers and dispatches exploration requests.
type ExplorerRegistry struct {
	explorers []Explorer
}

// NewExplorerRegistry creates a registry with the default explorers.
func NewExplorerRegistry() *ExplorerRegistry {
	return &ExplorerRegistry{
		explorers: []Explorer{
			&TextExplorer{},
		},
	}
}

// Register adds a new explorer to the registry.
func (r *ExplorerRegistry) Register(e Explorer) {
	r.explorers = append(r.explorers, e)
}

// Explore finds a suitable explorer for the given MIME type and runs it.
// Returns nil, nil if no explorer can handle the MIME type.
func (r *ExplorerRegistry) Explore(ctx context.Context, path string, mimeType string, maxTokens int) (*ExplorationResult, error) {
	for _, e := range r.explorers {
		if e.CanExplore(mimeType) {
			return e.Explore(ctx, path, mimeType, maxTokens)
		}
	}
	return nil, nil
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

func (TextExplorer) CanExplore(mimeType string) bool {
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
