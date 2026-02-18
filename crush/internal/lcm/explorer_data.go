package lcm

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// --- JSONExplorer ---

// JSONExplorer analyzes JSON files by detecting top-level type, key names, and array lengths.
type JSONExplorer struct{}

func (JSONExplorer) Name() string { return "json" }

func (JSONExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "application/json" || strings.HasSuffix(mimeType, "+json") {
		return true
	}
	return filepath.Ext(path) == ".json"
}

func (JSONExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: JSON]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	trimmed := strings.TrimSpace(content)
	if strings.HasPrefix(trimmed, "{") {
		summary.WriteString("[Top-level type: object]\n")
		// Extract top-level keys by scanning for quoted strings after '{'
		keys := extractJSONObjectKeys(trimmed)
		if len(keys) > 0 {
			fmt.Fprintf(&summary, "[Keys: %s]\n", strings.Join(keys, ", "))
		}
	} else if strings.HasPrefix(trimmed, "[") {
		summary.WriteString("[Top-level type: array]\n")
		// Estimate array length by counting top-level commas
		arrayLen := estimateJSONArrayLength(trimmed)
		fmt.Fprintf(&summary, "[Estimated array length: %d]\n", arrayLen)
	} else {
		summary.WriteString("[Top-level type: scalar]\n")
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "json",
	}, nil
}

// extractJSONObjectKeys extracts top-level key names from a JSON object string
// using basic string scanning (no JSON parser dependency).
func extractJSONObjectKeys(s string) []string {
	var keys []string
	depth := 0
	inString := false
	escaped := false
	var currentKey strings.Builder
	collectingKey := false

	for i, ch := range s {
		if i == 0 && ch == '{' {
			depth = 1
			continue
		}

		if escaped {
			if collectingKey {
				currentKey.WriteRune(ch)
			}
			escaped = false
			continue
		}

		if ch == '\\' && inString {
			if collectingKey {
				currentKey.WriteRune(ch)
			}
			escaped = true
			continue
		}

		if ch == '"' {
			if !inString {
				inString = true
				if depth == 1 && !collectingKey {
					collectingKey = true
					currentKey.Reset()
				}
			} else {
				inString = false
				if collectingKey {
					collectingKey = false
					keys = append(keys, currentKey.String())
					if len(keys) >= 50 {
						break
					}
				}
			}
			continue
		}

		if inString {
			if collectingKey {
				currentKey.WriteRune(ch)
			}
			continue
		}

		switch ch {
		case '{', '[':
			depth++
		case '}', ']':
			depth--
			if depth <= 0 {
				return keys
			}
		}
	}
	return keys
}

// estimateJSONArrayLength estimates the number of elements in a JSON array
// by counting top-level commas.
func estimateJSONArrayLength(s string) int {
	if len(s) < 2 {
		return 0
	}
	depth := 0
	inString := false
	escaped := false
	count := 0
	hasContent := false

	for _, ch := range s {
		if escaped {
			escaped = false
			continue
		}
		if ch == '\\' && inString {
			escaped = true
			continue
		}
		if ch == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		switch ch {
		case '[', '{':
			depth++
		case ']', '}':
			depth--
		case ',':
			if depth == 1 {
				count++
			}
		default:
			if depth == 1 && ch != ' ' && ch != '\t' && ch != '\n' && ch != '\r' {
				hasContent = true
			}
		}
	}

	if hasContent || count > 0 {
		return count + 1
	}
	return 0
}

// --- CSVExplorer ---

// CSVExplorer analyzes CSV files by reading headers and sample rows.
type CSVExplorer struct{}

func (CSVExplorer) Name() string { return "csv" }

func (CSVExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/csv" || mimeType == "text/tab-separated-values" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".csv" || ext == ".tsv"
}

func (CSVExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: CSV]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	scanner := bufio.NewScanner(strings.NewReader(content))
	lineNum := 0
	var headerLine string
	var sampleRows []string

	for scanner.Scan() {
		line := scanner.Text()
		lineNum++
		if lineNum == 1 {
			headerLine = line
		} else if lineNum <= 6 { // header + 5 data rows
			sampleRows = append(sampleRows, line)
		}
	}

	totalLines := lineNum

	if headerLine != "" {
		columns := strings.Split(headerLine, ",")
		fmt.Fprintf(&summary, "[Columns: %d]\n", len(columns))
		fmt.Fprintf(&summary, "[Headers: %s]\n", headerLine)
	}

	fmt.Fprintf(&summary, "[Total lines: %d]\n", totalLines)

	if len(sampleRows) > 0 {
		summary.WriteString("\n[Sample rows:]\n")
		for _, row := range sampleRows {
			summary.WriteString(row)
			summary.WriteString("\n")
		}
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "csv",
	}, nil
}

// --- YAMLExplorer ---

// YAMLExplorer analyzes YAML files by extracting top-level keys and structure depth.
type YAMLExplorer struct{}

func (YAMLExplorer) Name() string { return "yaml" }

func (YAMLExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "application/x-yaml" || mimeType == "text/yaml" || mimeType == "text/x-yaml" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".yaml" || ext == ".yml"
}

func (YAMLExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: YAML]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	var topLevelKeys []string
	maxDepth := 0
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) == 0 || strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		// Calculate indentation depth
		indent := 0
		for _, ch := range line {
			if ch == ' ' {
				indent++
			} else {
				break
			}
		}
		depth := indent/2 + 1
		if depth > maxDepth {
			maxDepth = depth
		}
		// Top-level keys have no indentation
		if indent == 0 && strings.Contains(line, ":") {
			key := strings.TrimSpace(strings.SplitN(line, ":", 2)[0])
			if key != "" && key != "---" && key != "..." {
				topLevelKeys = append(topLevelKeys, key)
			}
		}
	}

	if len(topLevelKeys) > 0 {
		fmt.Fprintf(&summary, "[Top-level keys: %s]\n", strings.Join(topLevelKeys, ", "))
	}
	fmt.Fprintf(&summary, "[Maximum depth: %d]\n", maxDepth)

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "yaml",
	}, nil
}

// --- TOMLExplorer ---

// TOMLExplorer analyzes TOML files by extracting section headers.
type TOMLExplorer struct{}

func (TOMLExplorer) Name() string { return "toml" }

func (TOMLExplorer) CanExplore(path string, mimeType string) bool {
	return mimeType == "application/toml" || mimeType == "text/x-toml" || filepath.Ext(path) == ".toml"
}

func (TOMLExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: TOML]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	var sections []string
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "[") && strings.Contains(line, "]") {
			section := strings.TrimRight(strings.TrimLeft(line, "["), "]")
			section = strings.TrimSpace(section)
			if section != "" {
				sections = append(sections, section)
			}
		}
	}

	if len(sections) > 0 {
		fmt.Fprintf(&summary, "[Sections: %s]\n", strings.Join(sections, ", "))
	}
	fmt.Fprintf(&summary, "[Section count: %d]\n", len(sections))

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "toml",
	}, nil
}

// --- INIExplorer ---

// INIExplorer analyzes INI/CFG files by extracting section headers and key counts.
type INIExplorer struct{}

func (INIExplorer) Name() string { return "ini" }

func (INIExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/x-ini" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".ini" || ext == ".cfg" || ext == ".conf" || ext == ".properties"
}

func (INIExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: INI]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	type sectionInfo struct {
		name     string
		keyCount int
	}
	var sections []sectionInfo
	currentSection := "global"
	keyCount := 0

	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			if keyCount > 0 || currentSection != "global" {
				sections = append(sections, sectionInfo{name: currentSection, keyCount: keyCount})
			}
			currentSection = strings.TrimRight(strings.TrimLeft(line, "["), "]")
			currentSection = strings.TrimSpace(currentSection)
			keyCount = 0
		} else if strings.Contains(line, "=") {
			keyCount++
		}
	}
	// Add the last section
	if keyCount > 0 || currentSection != "global" {
		sections = append(sections, sectionInfo{name: currentSection, keyCount: keyCount})
	}

	fmt.Fprintf(&summary, "[Section count: %d]\n", len(sections))
	for _, sec := range sections {
		fmt.Fprintf(&summary, "  [%s]: %d keys\n", sec.name, sec.keyCount)
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "ini",
	}, nil
}

// --- XMLExplorer ---

// XMLExplorer analyzes XML files by extracting root element, child elements, and attributes.
type XMLExplorer struct{}

func (XMLExplorer) Name() string { return "xml" }

func (XMLExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "application/xml" || mimeType == "text/xml" || strings.HasSuffix(mimeType, "+xml") {
		return true
	}
	ext := filepath.Ext(path)
	switch ext {
	case ".xml", ".xsl", ".xslt", ".xsd", ".wsdl", ".rss", ".atom", ".plist", ".svg":
		return true
	}
	return false
}

func (XMLExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: XML]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	// Extract element names from opening tags using basic string scanning
	var elements []string
	var rootElement string
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Skip XML declarations and comments
		if strings.HasPrefix(line, "<?") || strings.HasPrefix(line, "<!--") {
			continue
		}
		// Find opening tags
		for i := 0; i < len(line); i++ {
			if line[i] == '<' && i+1 < len(line) && line[i+1] != '/' && line[i+1] != '!' && line[i+1] != '?' {
				end := strings.IndexAny(line[i+1:], " \t>/>")
				if end > 0 {
					tagName := line[i+1 : i+1+end]
					if rootElement == "" {
						rootElement = tagName
					}
					elements = append(elements, tagName)
				}
			}
		}
	}

	if rootElement != "" {
		fmt.Fprintf(&summary, "[Root element: <%s>]\n", rootElement)
	}

	// Deduplicate and show child elements
	seen := make(map[string]int)
	for _, elem := range elements {
		seen[elem]++
	}
	if len(seen) > 0 {
		fmt.Fprintf(&summary, "[Unique elements: %d]\n", len(seen))
		summary.WriteString("[Elements:]\n")
		count := 0
		for elem, n := range seen {
			if count >= 50 {
				fmt.Fprintf(&summary, "  ... and %d more\n", len(seen)-50)
				break
			}
			fmt.Fprintf(&summary, "  <%s> (%d occurrences)\n", elem, n)
			count++
		}
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "xml",
	}, nil
}

// --- HTMLExplorer ---

// HTMLExplorer analyzes HTML files by extracting title, headings, and meta tags.
type HTMLExplorer struct{}

func (HTMLExplorer) Name() string { return "html" }

func (HTMLExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/html" || mimeType == "application/xhtml+xml" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".html" || ext == ".htm" || ext == ".xhtml"
}

func (HTMLExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: HTML]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	lower := strings.ToLower(content)

	// Extract title
	if titleStart := strings.Index(lower, "<title>"); titleStart >= 0 {
		titleEnd := strings.Index(lower[titleStart:], "</title>")
		if titleEnd > 0 {
			titleContent := content[titleStart+7 : titleStart+titleEnd]
			fmt.Fprintf(&summary, "[Title: %s]\n", strings.TrimSpace(titleContent))
		}
	}

	// Extract headings
	var headings []string
	for _, level := range []string{"h1", "h2", "h3", "h4", "h5", "h6"} {
		openTag := "<" + level
		closeTag := "</" + level + ">"
		pos := 0
		for {
			idx := strings.Index(lower[pos:], openTag)
			if idx < 0 {
				break
			}
			idx += pos
			// Find the end of the opening tag
			tagEnd := strings.Index(lower[idx:], ">")
			if tagEnd < 0 {
				break
			}
			contentStart := idx + tagEnd + 1
			endIdx := strings.Index(lower[contentStart:], closeTag)
			if endIdx < 0 {
				break
			}
			headingText := strings.TrimSpace(content[contentStart : contentStart+endIdx])
			headings = append(headings, fmt.Sprintf("[%s] %s", strings.ToUpper(level), headingText))
			pos = contentStart + endIdx + len(closeTag)
			if len(headings) >= 30 {
				break
			}
		}
		if len(headings) >= 30 {
			break
		}
	}

	if len(headings) > 0 {
		summary.WriteString("[Headings:]\n")
		for _, h := range headings {
			fmt.Fprintf(&summary, "  %s\n", h)
		}
	}

	// Count meta tags
	metaCount := strings.Count(lower, "<meta ")
	if metaCount > 0 {
		fmt.Fprintf(&summary, "[Meta tags: %d]\n", metaCount)
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "html",
	}, nil
}

// --- Helper for data explorers ---

// readFileForExplorer opens a file and reads up to maxTokens*CharsPerToken bytes.
// Returns the content as a string, the file info, whether it was truncated, and any error.
func readFileForExplorer(path string, maxTokens int) (string, os.FileInfo, bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", nil, false, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return "", nil, false, fmt.Errorf("failed to stat file: %w", err)
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
		return "", nil, false, fmt.Errorf("failed to read file: %w", err)
	}

	return string(buf[:n]), stat, truncated, nil
}
