package lcm

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// FormatMessagesForSummary formats messages for LLM summarization.
//
// Crush serializes Message.Parts as a JSON array of wrapper objects:
//
//	[{"type": "text", "data": {"text": "Hello"}}, ...]
func FormatMessagesForSummary(messages []LCMMessage) string {
	var parts []string
	for _, msg := range messages {
		parts = append(parts, fmt.Sprintf("[Message %s (%s)]", msg.ID, msg.Role))

		var msgParts []MessagePart
		if err := json.Unmarshal([]byte(msg.Content), &msgParts); err != nil {
			parts = append(parts, msg.Content)
			parts = append(parts, "")
			continue
		}
		for _, part := range msgParts {
			d := part.Data
			switch part.Type {
			case "text":
				if d.Text != "" {
					parts = append(parts, d.Text)
				}
			case "tool_call":
				parts = append(parts, fmt.Sprintf("[Tool Call: %s]", d.Name))
				if d.Input != "" {
					parts = append(parts, fmt.Sprintf("Input: %s", d.Input))
				}
				if !d.Finished {
					parts = append(parts, "[In Progress]")
				}
			case "tool_result":
				if d.IsError {
					parts = append(parts, fmt.Sprintf("[Tool Error]\n%s", runeAwareTruncate(d.Content, 1000)))
				} else {
					parts = append(parts, fmt.Sprintf("[Tool Result]\n%s", runeAwareTruncate(d.Content, 1000)))
				}
			case "reasoning":
				if d.Thinking != "" {
					parts = append(parts, fmt.Sprintf("[Reasoning] %s", d.Thinking))
				}
			case "finish":
				// End-of-turn marker
			case "image_url":
				// Skip for summarization
			case "binary":
				// Skip, handled via large file storage
			}
		}
		parts = append(parts, "")
	}
	return strings.Join(parts, "\n")
}

func runeAwareTruncate(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes]) + "..."
}

// MessagePart is the top-level wrapper Crush uses when serializing Message.Parts.
type MessagePart struct {
	Type string   `json:"type"`
	Data partData `json:"data"`
}

// partData holds the union of fields for all content part types.
type partData struct {
	// TextContent
	Text string `json:"text,omitempty"`
	// ToolCall
	ID       string `json:"id,omitempty"`
	Name     string `json:"name,omitempty"`
	Input    string `json:"input,omitempty"`
	Finished bool   `json:"finished,omitempty"`
	// ToolResult
	ToolCallID string `json:"tool_call_id,omitempty"`
	Content    string `json:"content,omitempty"`
	IsError    bool   `json:"is_error,omitempty"`
	// ReasoningContent — field is "thinking", NOT "text"
	Thinking string `json:"thinking,omitempty"`
}

// FormatLargeFileForContext returns the marker string for large file references.
func FormatLargeFileForContext(f *LargeFile) string {
	return fmt.Sprintf("[Large File Stored: %s]\n[Path: %s]\n[Type: %s]\n[Tokens: %d]",
		f.FileID, f.OriginalPath, f.MimeType, f.TokenCount)
}

// FormatLargeUserTextForContext is the marker for inline user text stored as a large file.
func FormatLargeUserTextForContext(f *LargeFile) string {
	return fmt.Sprintf("[Large User Text Stored: %s]\n[Path: %s]\n[Tokens: %d]",
		f.FileID, f.OriginalPath, f.TokenCount)
}

// fileIDPattern matches all LCM file ID marker formats.
// Patterns cover: [Large File Stored: ...], [Large User Text Stored: ...],
// [LCM File ID: ...] (with brackets), LCM File ID: ... (bare, Volt-style),
// [Large File ID: ...] (Volt's large-file.ts format), and file_id "..." (JSON-like).
var fileIDPattern = regexp.MustCompile(
	`(?:` +
		`\[Large File Stored:\s*(file_[0-9a-f]{16})\]` + `|` +
		`\[Large User Text Stored:\s*(file_[0-9a-f]{16})\]` + `|` +
		`\[LCM File ID:\s*(file_[0-9a-f]{16})\]` + `|` +
		`\[Large File ID:\s*(file_[0-9a-f]{16})\]` + `|` +
		`(?:^|[^[])LCM File ID:\s*(file_[0-9a-f]{16})` + `|` +
		`file_id\s+"(file_[0-9a-f]{16})"` +
		`)`,
)

// fileIDInline matches individual file IDs within Volt's plural format
// [LCM File IDs: file_xxx, file_yyy] and anywhere else a bare file_ID appears.
var fileIDInline = regexp.MustCompile(`file_[0-9a-f]{16}`)

func extractFileIDs(content string) []string {
	seen := make(map[string]bool)
	var fileIDs []string

	// Primary: structured patterns with context
	matches := fileIDPattern.FindAllStringSubmatch(content, -1)
	for _, match := range matches {
		for i := 1; i < len(match); i++ {
			if match[i] != "" && !seen[match[i]] {
				seen[match[i]] = true
				fileIDs = append(fileIDs, match[i])
			}
		}
	}

	// Secondary: handle Volt's plural format [LCM File IDs: file_xxx, file_yyy]
	// and any other inline file ID references not caught by the primary patterns.
	for _, id := range fileIDInline.FindAllString(content, -1) {
		if !seen[id] {
			seen[id] = true
			fileIDs = append(fileIDs, id)
		}
	}

	sort.Strings(fileIDs)
	return fileIDs
}

func extractFileIDsFromMessages(messages []LCMMessage) []string {
	var allContent strings.Builder
	for _, msg := range messages {
		allContent.WriteString(msg.Content)
		allContent.WriteString("\n")
	}
	return extractFileIDs(allContent.String())
}
