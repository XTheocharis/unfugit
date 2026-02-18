package lcm

import (
	"bufio"
	"context"
	"fmt"
	"path/filepath"
	"strings"
)

// --- MarkdownExplorer ---

// MarkdownExplorer analyzes Markdown files by extracting heading hierarchy,
// code block languages, and link counts.
type MarkdownExplorer struct{}

func (MarkdownExplorer) Name() string { return "markdown" }

func (MarkdownExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/markdown" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".md" || ext == ".markdown"
}

func (MarkdownExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: Markdown]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	var headings []string
	codeBlockLangs := make(map[string]int)
	linkCount := 0
	inCodeBlock := false

	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		// Track code blocks
		if strings.HasPrefix(trimmed, "```") {
			if !inCodeBlock {
				inCodeBlock = true
				lang := strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
				if lang != "" {
					// Remove any additional attributes after language name
					if spaceIdx := strings.IndexAny(lang, " \t"); spaceIdx > 0 {
						lang = lang[:spaceIdx]
					}
					codeBlockLangs[lang]++
				} else {
					codeBlockLangs["(unlabeled)"]++
				}
			} else {
				inCodeBlock = false
			}
			continue
		}

		if inCodeBlock {
			continue
		}

		// Extract headings (ATX-style: # through ######)
		if strings.HasPrefix(trimmed, "#") {
			level := 0
			for _, ch := range trimmed {
				if ch == '#' {
					level++
				} else {
					break
				}
			}
			if level >= 1 && level <= 6 {
				headingText := strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
				headings = append(headings, fmt.Sprintf("%s %s", strings.Repeat("#", level), headingText))
			}
		}

		// Count markdown links: [text](url) and [text][ref]
		pos := 0
		for pos < len(line) {
			idx := strings.Index(line[pos:], "](")
			if idx < 0 {
				break
			}
			linkCount++
			pos += idx + 2
		}
	}

	// Output heading hierarchy
	if len(headings) > 0 {
		summary.WriteString("[Heading hierarchy:]\n")
		for _, h := range headings {
			fmt.Fprintf(&summary, "  %s\n", h)
		}
	}

	// Output code block languages
	if len(codeBlockLangs) > 0 {
		summary.WriteString("[Code blocks:]\n")
		for lang, count := range codeBlockLangs {
			fmt.Fprintf(&summary, "  %s: %d\n", lang, count)
		}
	}

	fmt.Fprintf(&summary, "[Links: %d]\n", linkCount)

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "markdown",
	}, nil
}

// --- LaTeXExplorer ---

// LaTeXExplorer analyzes LaTeX files by extracting sections, subsections,
// usepackage directives, and document class.
type LaTeXExplorer struct{}

func (LaTeXExplorer) Name() string { return "latex" }

func (LaTeXExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/x-latex" || mimeType == "application/x-latex" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".tex" || ext == ".latex"
}

func (LaTeXExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: LaTeX]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	var documentClass string
	var packages []string
	var sections []string

	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Extract document class
		if strings.HasPrefix(line, "\\documentclass") {
			documentClass = extractLaTeXArg(line)
		}

		// Extract usepackage
		if strings.HasPrefix(line, "\\usepackage") {
			pkg := extractLaTeXArg(line)
			if pkg != "" {
				packages = append(packages, pkg)
			}
		}

		// Extract sections and subsections
		if strings.HasPrefix(line, "\\section{") || strings.HasPrefix(line, "\\section*{") {
			arg := extractLaTeXArg(line)
			if arg != "" {
				sections = append(sections, fmt.Sprintf("\\section{%s}", arg))
			}
		}
		if strings.HasPrefix(line, "\\subsection{") || strings.HasPrefix(line, "\\subsection*{") {
			arg := extractLaTeXArg(line)
			if arg != "" {
				sections = append(sections, fmt.Sprintf("  \\subsection{%s}", arg))
			}
		}
		if strings.HasPrefix(line, "\\subsubsection{") || strings.HasPrefix(line, "\\subsubsection*{") {
			arg := extractLaTeXArg(line)
			if arg != "" {
				sections = append(sections, fmt.Sprintf("    \\subsubsection{%s}", arg))
			}
		}
		if strings.HasPrefix(line, "\\chapter{") || strings.HasPrefix(line, "\\chapter*{") {
			arg := extractLaTeXArg(line)
			if arg != "" {
				sections = append(sections, fmt.Sprintf("\\chapter{%s}", arg))
			}
		}
	}

	if documentClass != "" {
		fmt.Fprintf(&summary, "[Document class: %s]\n", documentClass)
	}
	if len(packages) > 0 {
		fmt.Fprintf(&summary, "[Packages: %s]\n", strings.Join(packages, ", "))
	}
	if len(sections) > 0 {
		summary.WriteString("[Structure:]\n")
		for _, s := range sections {
			fmt.Fprintf(&summary, "  %s\n", s)
		}
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "latex",
	}, nil
}

// extractLaTeXArg extracts the content of the last {braced} argument in a LaTeX command line.
func extractLaTeXArg(line string) string {
	// Find the last { ... } pair
	lastOpen := strings.LastIndex(line, "{")
	if lastOpen < 0 {
		return ""
	}
	lastClose := strings.Index(line[lastOpen:], "}")
	if lastClose < 0 {
		return ""
	}
	return line[lastOpen+1 : lastOpen+lastClose]
}

// --- CSSExplorer ---

// CSSExplorer analyzes CSS files by counting selectors, @media queries,
// and @import directives.
type CSSExplorer struct{}

func (CSSExplorer) Name() string { return "css" }

func (CSSExplorer) CanExplore(path string, mimeType string) bool {
	return mimeType == "text/css" || filepath.Ext(path) == ".css"
}

func (CSSExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: CSS]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	selectorCount := 0
	mediaQueryCount := 0
	importCount := 0
	inComment := false

	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		// Handle multi-line comments
		if inComment {
			if strings.Contains(trimmed, "*/") {
				inComment = false
				// Process rest of line after comment end
				idx := strings.Index(trimmed, "*/")
				trimmed = strings.TrimSpace(trimmed[idx+2:])
				if trimmed == "" {
					continue
				}
			} else {
				continue
			}
		}

		if strings.Contains(trimmed, "/*") {
			if !strings.Contains(trimmed, "*/") {
				inComment = true
			}
		}

		if trimmed == "" || strings.HasPrefix(trimmed, "//") {
			continue
		}

		// Count @import directives
		if strings.HasPrefix(trimmed, "@import ") {
			importCount++
		}

		// Count @media queries
		if strings.HasPrefix(trimmed, "@media ") {
			mediaQueryCount++
		}

		// Count selectors: lines that contain '{' and aren't @-rules (roughly)
		if strings.Contains(trimmed, "{") && !strings.HasPrefix(trimmed, "@") {
			selectorCount++
		}
	}

	fmt.Fprintf(&summary, "[Selectors: %d]\n", selectorCount)
	fmt.Fprintf(&summary, "[Media queries: %d]\n", mediaQueryCount)
	fmt.Fprintf(&summary, "[Import directives: %d]\n", importCount)

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "css",
	}, nil
}
