package lcm

import (
	"bufio"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// --- SQLiteExplorer ---

// SQLiteExplorer identifies SQLite database files by magic bytes and reports basic info.
type SQLiteExplorer struct{}

func (SQLiteExplorer) Name() string { return "sqlite" }

func (SQLiteExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "application/x-sqlite3" || mimeType == "application/vnd.sqlite3" {
		return true
	}
	// Extension matching (tier 1 of 3-tier cascade).
	ext := filepath.Ext(path)
	switch ext {
	case ".sqlite", ".sqlite3", ".db", ".db3", ".s3db", ".sl3":
		return true
	}
	// Magic bytes check — only when both path and mimeType are provided (tier 3).
	// Avoids file I/O during extension-only (tier 1) or MIME-only (tier 2) dispatch.
	if path != "" && mimeType != "" {
		f, err := os.Open(path)
		if err != nil {
			return false
		}
		defer f.Close()
		header := make([]byte, 16)
		n, err := f.Read(header)
		if err != nil || n < 16 {
			return false
		}
		return string(header[:16]) == "SQLite format 3\x00"
	}
	return false
}

func (SQLiteExplorer) Explore(_ context.Context, path string, _ string, _ int) (*ExplorationResult, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: SQLite Database]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	summary.WriteString("[Note: SQLite database file — use a database tool to inspect schema and contents]\n")

	result := summary.String()
	return &ExplorationResult{
		Summary:      result,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "sqlite",
	}, nil
}

// --- PDFExplorer ---

// PDFExplorer identifies PDF files and estimates page count.
type PDFExplorer struct{}

func (PDFExplorer) Name() string { return "pdf" }

func (PDFExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "application/pdf" {
		return true
	}
	if filepath.Ext(path) == ".pdf" {
		return true
	}
	// Check magic bytes
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	header := make([]byte, 4)
	n, err := f.Read(header)
	if err != nil || n < 4 {
		return false
	}
	return string(header[:4]) == "%PDF"
}

func (PDFExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: PDF]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())

	// Read file to estimate page count from %%EOF and /Type /Page markers
	maxBytes := int64(maxTokens * CharsPerToken)
	if maxBytes > int64(maxLargeFileRead) {
		maxBytes = int64(maxLargeFileRead)
	}
	if maxBytes > stat.Size() {
		maxBytes = stat.Size()
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	buf := make([]byte, maxBytes)
	n, err := io.ReadFull(f, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	content := string(buf[:n])

	// Count page objects: /Type /Page (not /Pages)
	pageCount := 0
	searchPos := 0
	for {
		idx := strings.Index(content[searchPos:], "/Type /Page")
		if idx < 0 {
			break
		}
		absPos := searchPos + idx + len("/Type /Page")
		// Make sure it's /Type /Page and not /Type /Pages
		if absPos < len(content) && content[absPos] == 's' {
			searchPos = absPos
			continue
		}
		pageCount++
		searchPos = absPos
	}

	if pageCount > 0 {
		fmt.Fprintf(&summary, "[Estimated pages: %d]\n", pageCount)
	}

	eofCount := strings.Count(content, "%%EOF")
	if eofCount > 0 {
		fmt.Fprintf(&summary, "[EOF markers: %d]\n", eofCount)
	}

	result := summary.String()
	return &ExplorationResult{
		Summary:      result,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "pdf",
	}, nil
}

// --- ImageExplorer ---

// ImageExplorer identifies image files and reports format, dimensions, and file size.
type ImageExplorer struct{}

func (ImageExplorer) Name() string { return "image" }

func (ImageExplorer) CanExplore(path string, mimeType string) bool {
	// B4: Exclude SVG — it's XML text, not a binary image (Volt's dispatcher excludes image/svg+xml).
	if mimeType == "image/svg+xml" {
		return false
	}
	if strings.HasPrefix(mimeType, "image/") {
		return true
	}
	ext := filepath.Ext(path)
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".ico", ".heic", ".heif", ".avif":
		return true
	}
	return false
}

func (ImageExplorer) Explore(_ context.Context, path string, mimeType string, _ int) (*ExplorationResult, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	// Read the first 32 bytes for magic byte detection
	header := make([]byte, 32)
	n, err := f.Read(header)
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("failed to read file header: %w", err)
	}
	header = header[:n]

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())

	format := detectImageFormat(header, filepath.Ext(path), mimeType)
	fmt.Fprintf(&summary, "[Format: %s]\n", format)

	// Try to get dimensions for PNG (stored in IHDR chunk starting at offset 16)
	if format == "PNG" && n >= 24 {
		width := binary.BigEndian.Uint32(header[16:20])
		height := binary.BigEndian.Uint32(header[20:24])
		fmt.Fprintf(&summary, "[Dimensions: %dx%d]\n", width, height)
	}

	result := summary.String()
	return &ExplorationResult{
		Summary:      result,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "image",
	}, nil
}

// detectImageFormat detects image format from magic bytes, falling back to extension/MIME.
func detectImageFormat(header []byte, ext string, mimeType string) string {
	if len(header) >= 8 {
		// PNG: \x89PNG\r\n\x1a\n
		if header[0] == 0x89 && header[1] == 'P' && header[2] == 'N' && header[3] == 'G' {
			return "PNG"
		}
		// JPEG: \xff\xd8\xff
		if header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF {
			return "JPEG"
		}
		// GIF: GIF87a or GIF89a
		if string(header[:3]) == "GIF" {
			return "GIF"
		}
		// BMP: BM
		if header[0] == 'B' && header[1] == 'M' {
			return "BMP"
		}
		// WebP: RIFF....WEBP
		if string(header[:4]) == "RIFF" && len(header) >= 12 && string(header[8:12]) == "WEBP" {
			return "WebP"
		}
	}
	// SVG detection via text content
	if ext == ".svg" || mimeType == "image/svg+xml" {
		return "SVG"
	}
	// Fallback to extension
	switch ext {
	case ".png":
		return "PNG"
	case ".jpg", ".jpeg":
		return "JPEG"
	case ".gif":
		return "GIF"
	case ".bmp":
		return "BMP"
	case ".webp":
		return "WebP"
	}
	return "Unknown Image"
}

// --- ExecutableExplorer ---

// ExecutableExplorer identifies executable binary files by magic bytes and reports type/size.
type ExecutableExplorer struct{}

func (ExecutableExplorer) Name() string { return "executable" }

func (ExecutableExplorer) CanExplore(path string, mimeType string) bool {
	switch mimeType {
	case "application/x-executable", "application/x-mach-binary",
		"application/x-dosexec", "application/x-elf",
		"application/x-sharedlib", "application/x-object",
		"application/wasm", "application/vnd.microsoft.portable-executable":
		return true
	}
	// Extension matching (tier 1 of 3-tier cascade).
	ext := filepath.Ext(path)
	switch ext {
	case ".exe", ".dll", ".so", ".dylib", ".wasm", ".o", ".a", ".lib":
		return true
	}
	// Magic bytes check — only when both path and mimeType are provided (tier 3).
	// Avoids file I/O during extension-only (tier 1) or MIME-only (tier 2) dispatch.
	if path != "" && mimeType != "" {
		return checkExecutableMagicBytes(path)
	}
	return false
}

// checkExecutableMagicBytes reads the first 4 bytes and checks for known binary signatures.
func checkExecutableMagicBytes(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	header := make([]byte, 4)
	n, err := f.Read(header)
	if err != nil || n < 2 {
		return false
	}
	// ELF: \x7fELF
	if n >= 4 && header[0] == 0x7F && header[1] == 'E' && header[2] == 'L' && header[3] == 'F' {
		return true
	}
	// Mach-O: \xfe\xed\xfa\xce or \xfe\xed\xfa\xcf (big-endian)
	if n >= 4 && header[0] == 0xFE && header[1] == 0xED && header[2] == 0xFA {
		return true
	}
	// Mach-O: \xcf\xfa\xed\xfe or \xce\xfa\xed\xfe (little-endian)
	if n >= 4 && (header[0] == 0xCF || header[0] == 0xCE) && header[1] == 0xFA && header[2] == 0xED && header[3] == 0xFE {
		return true
	}
	// Mach-O FAT/Universal: \xca\xfe\xba\xbe (big-endian) or \xbe\xba\xfe\xca (little-endian)
	if n >= 4 && header[0] == 0xCA && header[1] == 0xFE && header[2] == 0xBA && header[3] == 0xBE {
		return true
	}
	if n >= 4 && header[0] == 0xBE && header[1] == 0xBA && header[2] == 0xFE && header[3] == 0xCA {
		return true
	}
	// PE: MZ
	if n >= 2 && header[0] == 'M' && header[1] == 'Z' {
		return true
	}
	return false
}

func (ExecutableExplorer) Explore(_ context.Context, path string, _ string, _ int) (*ExplorationResult, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	header := make([]byte, 4)
	n, err := f.Read(header)
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("failed to read file header: %w", err)
	}
	header = header[:n]

	binaryType := "Unknown Binary"
	if n >= 4 && header[0] == 0x7F && header[1] == 'E' && header[2] == 'L' && header[3] == 'F' {
		binaryType = "ELF (Linux/Unix executable)"
	} else if n >= 4 && header[0] == 0xFE && header[1] == 0xED && header[2] == 0xFA {
		binaryType = "Mach-O (macOS executable)"
	} else if n >= 4 && (header[0] == 0xCF || header[0] == 0xCE) && header[1] == 0xFA && header[2] == 0xED && header[3] == 0xFE {
		binaryType = "Mach-O (macOS executable, reverse byte order)"
	} else if n >= 4 && header[0] == 0xCA && header[1] == 0xFE && header[2] == 0xBA && header[3] == 0xBE {
		binaryType = "Mach-O FAT/Universal (multi-architecture)"
	} else if n >= 4 && header[0] == 0xBE && header[1] == 0xBA && header[2] == 0xFE && header[3] == 0xCA {
		binaryType = "Mach-O FAT/Universal (multi-architecture, reverse)"
	} else if n >= 2 && header[0] == 'M' && header[1] == 'Z' {
		binaryType = "PE (Windows executable)"
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: %s]\n", binaryType)
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())

	result := summary.String()
	return &ExplorationResult{
		Summary:      result,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "executable",
	}, nil
}

// --- LogExplorer ---

// LogExplorer analyzes log files by counting lines, detecting timestamps,
// and counting error/warning patterns.
type LogExplorer struct{}

func (LogExplorer) Name() string { return "log" }

func (LogExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/x-log" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".log" || ext == ".logs" || ext == ".out" || ext == ".err"
}

func (LogExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	content, stat, truncated, err := readFileForExplorer(path, maxTokens)
	if err != nil {
		return nil, err
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Format: Log]\n")
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated]\n")
	}

	lineCount := 0
	errorCount := 0
	warnCount := 0
	timestampCount := 0

	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := scanner.Text()
		lineCount++
		lower := strings.ToLower(line)

		// Detect error patterns
		if strings.Contains(lower, "error") || strings.Contains(lower, "fatal") ||
			strings.Contains(lower, "panic") || strings.Contains(lower, "exception") {
			errorCount++
		}

		// Detect warning patterns
		if strings.Contains(lower, "warn") || strings.Contains(lower, "warning") {
			warnCount++
		}

		// Simple timestamp detection: look for common date/time patterns
		// e.g., 2024-01-01, [2024-01-01], Jan 01, 00:00:00
		if len(line) >= 10 {
			c := line[0]
			// Check for YYYY-MM-DD pattern
			if c >= '0' && c <= '9' && len(line) >= 10 && line[4] == '-' && line[7] == '-' {
				timestampCount++
			} else if c == '[' && len(line) >= 11 && line[1] >= '0' && line[1] <= '9' && line[5] == '-' {
				timestampCount++
			}
		}
	}

	fmt.Fprintf(&summary, "[Lines: %d]\n", lineCount)
	fmt.Fprintf(&summary, "[Errors/Fatals: %d]\n", errorCount)
	fmt.Fprintf(&summary, "[Warnings: %d]\n", warnCount)
	if timestampCount > 0 {
		fmt.Fprintf(&summary, "[Lines with timestamps: %d]\n", timestampCount)
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: "log",
	}, nil
}

