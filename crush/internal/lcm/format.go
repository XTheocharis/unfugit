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
		parts = append(parts, fmt.Sprintf("[Message %s] (%s)", msg.ID, msg.Role))

		var msgParts []MessagePart
		if err := json.Unmarshal([]byte(msg.Content), &msgParts); err != nil {
			parts = append(parts, msg.Content)
			parts = append(parts, "")
			continue
		}
		for _, part := range msgParts {
			parts = append(parts, formatPart(part)...)
		}
		parts = append(parts, "")
	}
	return strings.Join(parts, "\n")
}

func formatPart(part MessagePart) []string {
	d := part.Data
	var out []string
	switch part.Type {
	case "text":
		if d.Text != "" {
			out = append(out, d.Text)
		}
	case "tool_call":
		out = append(out, fmt.Sprintf("[Tool: %s]", d.Name))
		if d.Input != "" {
			out = append(out, fmt.Sprintf("Input: %s", d.Input))
		}
		if !d.Finished {
			out = append(out, "[In Progress]")
		}
	case "tool_result":
		if d.IsError {
			if d.Name != "" {
				out = append(out, fmt.Sprintf("[Tool Error: %s]\n%s", d.Name, runeAwareTruncate(d.Content, 1000)))
			} else {
				out = append(out, fmt.Sprintf("[Tool Error]\n%s", runeAwareTruncate(d.Content, 1000)))
			}
		} else {
			out = append(out, fmt.Sprintf("[Tool Result]\n%s", runeAwareTruncate(d.Content, 1000)))
		}
		if d.MIMEType != "" { // FC-4
			out = append(out, fmt.Sprintf("[MIME: %s]", d.MIMEType))
		}
	case "reasoning":
		if d.Thinking != "" {
			out = append(out, fmt.Sprintf("[Reasoning] %s", d.Thinking))
		}
		if d.RedactedThinking { // FC-2
			out = append(out, "[Redacted Thinking]")
		}
	case "finish":
		if d.Reason != "" { // FC-1
			out = append(out, fmt.Sprintf("[Finish: %s]", d.Reason))
		}
	case "image_url":
		if d.URL != "" { // FC-5
			out = append(out, fmt.Sprintf("[Image: %s]", d.URL))
		}
	case "binary":
		if d.BinaryMIME != "" { // FC-6
			out = append(out, fmt.Sprintf("[Binary: %s]", d.BinaryMIME))
		}
		if d.BinaryCaption != "" {
			out = append(out, d.BinaryCaption)
		}
	}
	return out
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
// FC-1 through FC-6: All fields from Volt's part data types are included.
type partData struct {
	// TextContent
	Text string `json:"text,omitempty"`

	// ToolCall (FC-3: added ProviderExecuted)
	ID               string `json:"id,omitempty"`
	Name             string `json:"name,omitempty"`
	Input            string `json:"input,omitempty"`
	Finished         bool   `json:"finished,omitempty"`
	ProviderExecuted bool   `json:"provider_executed,omitempty"` // FC-3

	// ToolResult (FC-4: added Data, MIMEType, Metadata)
	ToolCallID string `json:"tool_call_id,omitempty"`
	Content    string `json:"content,omitempty"`
	IsError    bool   `json:"is_error,omitempty"`
	Data       string `json:"data,omitempty"`      // FC-4: binary/large tool result data
	MIMEType   string `json:"mime_type,omitempty"` // FC-4: MIME type of Data
	Metadata   string `json:"metadata,omitempty"`  // FC-4: arbitrary metadata JSON

	// ReasoningContent (FC-2: added Signature, RedactedThinking)
	Thinking         string `json:"thinking,omitempty"`
	Signature        string `json:"signature,omitempty"`         // FC-2
	RedactedThinking bool   `json:"redacted_thinking,omitempty"` // FC-2

	// Finish (FC-1: added Reason, Time, Message, Details)
	Reason  string `json:"reason,omitempty"`  // FC-1: stop reason (e.g., "end_turn", "max_tokens")
	Time    int64  `json:"time,omitempty"`    // FC-1: finish timestamp
	Message string `json:"message,omitempty"` // FC-1: optional finish message
	Details string `json:"details,omitempty"` // FC-1: optional finish details

	// ImageURLContent (FC-5)
	URL    string `json:"url,omitempty"`    // FC-5: image URL
	Detail string `json:"detail,omitempty"` // FC-5: detail level ("auto", "high", "low")

	// BinaryContent (FC-6)
	BinaryData    string `json:"binary_data,omitempty"`    // FC-6: base64-encoded binary
	BinaryMIME    string `json:"binary_mime,omitempty"`    // FC-6: MIME type of binary content
	BinaryCaption string `json:"binary_caption,omitempty"` // FC-6: optional caption
}

// FormatLargeFileForContext returns the marker string for large file references.
// E9: includes exploration hint when an exploration summary is available.
func FormatLargeFileForContext(f *LargeFile) string {
	base := fmt.Sprintf("[Large File ID: %s]\n[Path: %s]\n[Type: %s]\n[Tokens: %d]\n(File content stored externally - use file ID to retrieve)",
		f.FileID, f.OriginalPath, f.MimeType, f.TokenCount)
	if f.ExplorationSummary != "" {
		base += fmt.Sprintf("\n[Explored by: %s]\n%s", f.ExplorerUsed, f.ExplorationSummary)
	}
	return base
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
