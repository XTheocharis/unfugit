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

// codeExplore is the common helper for all code explorers. It reads the file
// up to maxTokens*CharsPerToken bytes, scans lines, and collects those whose
// trimmed form starts with any of the given pattern prefixes.
func codeExplore(path string, maxTokens int, language string, patterns []string) (*ExplorationResult, error) {
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

	var structuralLines []string
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		for _, pattern := range patterns {
			if strings.HasPrefix(trimmed, pattern) {
				structuralLines = append(structuralLines, line)
				break
			}
		}
	}

	var summary strings.Builder
	fmt.Fprintf(&summary, "[File: %s]\n", filepath.Base(path))
	fmt.Fprintf(&summary, "[Language: %s]\n", language)
	fmt.Fprintf(&summary, "[Size: %d bytes]\n", stat.Size())
	if truncated {
		fmt.Fprintf(&summary, "[Truncated to first %d bytes of %d]\n", n, stat.Size())
	}
	fmt.Fprintf(&summary, "[Structural lines: %d]\n\n", len(structuralLines))

	for _, line := range structuralLines {
		summary.WriteString(line)
		summary.WriteString("\n")
	}

	result := summary.String()
	fileIDs := extractFileIDs(content)
	return &ExplorationResult{
		Summary:      result,
		FileIDs:      fileIDs,
		TokenCount:   EstimateTokenCount(result),
		ExplorerUsed: language,
	}, nil
}

// --- GoExplorer ---

// GoExplorer analyzes Go source files by extracting structural elements.
type GoExplorer struct{}

func (GoExplorer) Name() string { return "go" }

func (GoExplorer) CanExplore(path string, mimeType string) bool {
	return mimeType == "text/x-go" || filepath.Ext(path) == ".go"
}

func (GoExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "go", []string{
		"package ", "import ", "import (", "func ", "type ", "struct ", "interface ",
	})
}

// --- PythonExplorer ---

// PythonExplorer analyzes Python source files by extracting structural elements.
type PythonExplorer struct{}

func (PythonExplorer) Name() string { return "python" }

func (PythonExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/x-python" || mimeType == "application/x-python" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".py" || ext == ".pyi" || ext == ".pyw" || ext == ".pyx" || ext == ".pxd"
}

func (PythonExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "python", []string{
		"import ", "from ", "def ", "class ", "@",
	})
}

// --- RustExplorer ---

// RustExplorer analyzes Rust source files by extracting structural elements.
type RustExplorer struct{}

func (RustExplorer) Name() string { return "rust" }

func (RustExplorer) CanExplore(path string, mimeType string) bool {
	return mimeType == "text/x-rust" || filepath.Ext(path) == ".rs"
}

func (RustExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "rust", []string{
		"use ", "mod ", "fn ", "pub fn ", "struct ", "pub struct ",
		"enum ", "pub enum ", "trait ", "pub trait ", "impl ",
	})
}

// --- TypeScriptExplorer ---

// TypeScriptExplorer analyzes TypeScript source files by extracting structural elements.
type TypeScriptExplorer struct{}

func (TypeScriptExplorer) Name() string { return "typescript" }

func (TypeScriptExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "application/typescript" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".ts" || ext == ".tsx" || ext == ".mts" || ext == ".cts"
}

func (TypeScriptExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "typescript", []string{
		"import ", "export ", "function ", "class ", "interface ", "type ",
		"export default ", "export function ", "export class ", "export interface ", "export type ",
	})
}

// --- JavaScriptExplorer ---

// JavaScriptExplorer analyzes JavaScript source files by extracting structural elements.
type JavaScriptExplorer struct{}

func (JavaScriptExplorer) Name() string { return "javascript" }

func (JavaScriptExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "application/javascript" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".js" || ext == ".jsx" || ext == ".mjs" || ext == ".cjs"
}

func (JavaScriptExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "javascript", []string{
		"import ", "export ", "function ", "class ", "const ",
		"export default ", "export function ", "export class ", "export const ",
	})
}

// --- JavaExplorer ---

// JavaExplorer analyzes Java source files by extracting structural elements.
type JavaExplorer struct{}

func (JavaExplorer) Name() string { return "java" }

func (JavaExplorer) CanExplore(path string, mimeType string) bool {
	return mimeType == "text/x-java" || filepath.Ext(path) == ".java"
}

func (JavaExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "java", []string{
		"import ", "package ", "class ", "interface ", "public ", "private ",
		"public class ", "public interface ", "public static ", "private static ",
	})
}

// --- CExplorer ---

// CExplorer analyzes C source and header files by extracting structural elements.
type CExplorer struct{}

func (CExplorer) Name() string { return "c" }

func (CExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/x-c" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".c" || ext == ".h"
}

func (CExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "c", []string{
		"#include ", "#define ", "struct ", "typedef ",
		"int ", "void ", "char ", "float ", "double ", "long ",
		"unsigned ", "static ", "extern ",
	})
}

// --- CppExplorer ---

// CppExplorer analyzes C++ source files by extracting structural elements.
type CppExplorer struct{}

func (CppExplorer) Name() string { return "cpp" }

func (CppExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/x-c++" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".cpp" || ext == ".cc" || ext == ".hpp" || ext == ".cxx" || ext == ".hxx" || ext == ".hh" || ext == ".ipp"
}

func (CppExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "cpp", []string{
		"#include ", "#define ", "struct ", "typedef ",
		"class ", "namespace ", "template ",
		"int ", "void ", "char ", "float ", "double ", "long ",
		"unsigned ", "static ", "extern ", "virtual ",
	})
}

// --- CSharpExplorer ---

// CSharpExplorer analyzes C# source files by extracting structural elements.
type CSharpExplorer struct{}

func (CSharpExplorer) Name() string { return "csharp" }

func (CSharpExplorer) CanExplore(path string, mimeType string) bool {
	ext := filepath.Ext(path)
	return mimeType == "text/x-csharp" || ext == ".cs" || ext == ".csx"
}

func (CSharpExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "csharp", []string{
		"using ", "namespace ", "class ", "interface ", "public ", "private ",
		"public class ", "public interface ", "public static ", "internal ",
		"protected ", "abstract ", "sealed ",
	})
}

// --- RubyExplorer ---

// RubyExplorer analyzes Ruby source files by extracting structural elements.
type RubyExplorer struct{}

func (RubyExplorer) Name() string { return "ruby" }

func (RubyExplorer) CanExplore(path string, mimeType string) bool {
	ext := filepath.Ext(path)
	return mimeType == "text/x-ruby" || ext == ".rb" || ext == ".rake" || ext == ".gemspec"
}

func (RubyExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "ruby", []string{
		"require ", "require_relative ", "module ", "class ", "def ",
		"attr_accessor ", "attr_reader ", "attr_writer ", "include ", "extend ",
	})
}

// --- SwiftExplorer ---

// SwiftExplorer analyzes Swift source files by extracting structural elements.
type SwiftExplorer struct{}

func (SwiftExplorer) Name() string { return "swift" }

func (SwiftExplorer) CanExplore(path string, mimeType string) bool {
	return mimeType == "text/x-swift" || filepath.Ext(path) == ".swift"
}

func (SwiftExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "swift", []string{
		"import ", "class ", "struct ", "protocol ", "func ", "enum ",
		"public ", "private ", "internal ", "open ", "extension ",
	})
}

// --- ObjectiveCExplorer ---

// ObjectiveCExplorer analyzes Objective-C source files by extracting structural elements.
type ObjectiveCExplorer struct{}

func (ObjectiveCExplorer) Name() string { return "objective-c" }

func (ObjectiveCExplorer) CanExplore(path string, mimeType string) bool {
	if mimeType == "text/x-objective-c" {
		return true
	}
	ext := filepath.Ext(path)
	return ext == ".m" || ext == ".mm"
}

func (ObjectiveCExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "objective-c", []string{
		"#import ", "@interface ", "@implementation ", "@protocol ",
		"#include ", "@property ", "@end", "@class ",
	})
}

// --- CUDAExplorer ---

// CUDAExplorer analyzes CUDA source files by extracting structural elements.
type CUDAExplorer struct{}

func (CUDAExplorer) Name() string { return "cuda" }

func (CUDAExplorer) CanExplore(path string, mimeType string) bool {
	ext := filepath.Ext(path)
	return mimeType == "text/x-cuda" || ext == ".cu" || ext == ".cuh"
}

func (CUDAExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "cuda", []string{
		"__global__", "__device__", "__host__", "#include ",
		"__shared__", "__constant__", "cudaMalloc", "cudaMemcpy",
	})
}

// --- TclExplorer ---

// TclExplorer analyzes Tcl source files by extracting structural elements.
type TclExplorer struct{}

func (TclExplorer) Name() string { return "tcl" }

func (TclExplorer) CanExplore(path string, mimeType string) bool {
	ext := filepath.Ext(path)
	return mimeType == "text/x-tcl" || ext == ".tcl" || ext == ".tk"
}

func (TclExplorer) Explore(_ context.Context, path string, _ string, maxTokens int) (*ExplorationResult, error) {
	return codeExplore(path, maxTokens, "tcl", []string{
		"proc ", "package ", "namespace ",
	})
}
