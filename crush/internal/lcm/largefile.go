package lcm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"time"
)

// CheckAndStoreLargeFile checks if a file is "large" and stores a path-only reference.
func CheckAndStoreLargeFile(
	ctx context.Context,
	store Store,
	sessionID string,
	filePath string,
	mimeType string,
) (*LargeFile, bool, error) {
	stat, err := os.Stat(filePath)
	if err != nil {
		return nil, false, fmt.Errorf("failed to stat file: %w", err)
	}
	fileSize := stat.Size()

	if fileSize <= DefaultByteThreshold {
		estimatedTokens := EstimateTokenCountFromBytes(fileSize)
		if estimatedTokens <= DefaultTokenThreshold {
			return nil, false, nil
		}
	}

	largeFile, err := store.InsertLargeFileFromPath(ctx, sessionID, filePath, mimeType)
	if err != nil {
		return nil, false, fmt.Errorf("failed to insert large file: %w", err)
	}
	return largeFile, true, nil
}

// maxLargeFileRead is the safety cap for large file reads (100 MB).
const maxLargeFileRead = 100 * 1024 * 1024

// GetLargeFileContent reads file content from disk, with optional size limit.
// A safety cap of 100 MB is always enforced to prevent OOM on huge files.
func GetLargeFileContent(originalPath string, maxBytes int64) (*LargeFileContent, error) {
	file, err := os.Open(originalPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}
	totalSize := stat.Size()

	// Apply safety cap: use maxBytes if specified, but always cap at 100 MB.
	effectiveMax := int64(maxLargeFileRead)
	if maxBytes > 0 && maxBytes < effectiveMax {
		effectiveMax = maxBytes
	}

	bytesToRead := totalSize
	truncated := false
	if totalSize > effectiveMax {
		bytesToRead = effectiveMax
		truncated = true
	}

	buffer := make([]byte, bytesToRead)
	n, err := io.ReadFull(file, buffer)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	return &LargeFileContent{
		Content:   string(buffer[:n]),
		Truncated: truncated,
		TotalSize: totalSize,
	}, nil
}

// GenerateFileIDFromPath creates a deterministic ID from file metadata.
func GenerateFileIDFromPath(sessionID string, filePath string, fileSize int64, mtime time.Time) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s|%s|%d|%d", sessionID, filePath, fileSize, mtime.Unix())
	hash := hex.EncodeToString(h.Sum(nil))
	return FileIDPrefix + hash[:FileIDLength]
}
