#!/bin/bash

# Comprehensive unfugit_get testing script
# This script creates various test files and scenarios then tests unfugit_get tool

set -e

TEST_LOG="/home/user/.claude/mcp-servers/unfugit/temp2_get.md"
PROJECT_DIR="/home/user/.claude/mcp-servers/unfugit"

# Function to log test results
log_test() {
    echo "### $1" >> "$TEST_LOG"
    echo "" >> "$TEST_LOG"
    echo '```' >> "$TEST_LOG"
    echo "$2" >> "$TEST_LOG"  
    echo '```' >> "$TEST_LOG"
    echo "" >> "$TEST_LOG"
}

# Function to make MCP call
call_unfugit_get() {
    local path="$1"
    local ref="${2:-HEAD}"
    
    cat << EOF | node "$PROJECT_DIR/dist/src/unfugit.js" "$PROJECT_DIR" 2>/dev/null | tail -n 1
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"unfugit_get","arguments":{"path":"$path","ref":"$ref"}}}
EOF
}

cd "$PROJECT_DIR"

echo "## Test Execution Log" >> "$TEST_LOG"
echo "Started at: $(date)" >> "$TEST_LOG"
echo "" >> "$TEST_LOG"

# Create diverse test content first
echo "Creating test content for comprehensive unfugit_get testing..."

# 1. Text files with different encodings
echo "Hello World - ASCII text" > test-ascii.txt
echo "UTF-8: Héllo Wörld 🌍 测试" > test-utf8.txt
printf "Binary mixed: \x00\x01\x02Hello\xFF\xFE" > test-mixed.bin

# 2. Large text file
seq 1 1000 | awk '{print "Line " $1 ": This is a large text file for testing purposes. Lorem ipsum dolor sit amet, consectetur adipiscing elit."}' > test-large-content.txt

# 3. JSON file
cat > test-data.json << 'EOF'
{
  "name": "unfugit test",
  "version": "1.0.0",
  "features": ["get", "history", "diff"],
  "metadata": {
    "created": "2025-08-29",
    "unicode": "测试数据 🚀"
  }
}
EOF

# 4. Files with special characters in names
echo "Special filename content" > "test file with spaces.txt"
echo "Unicode filename content" > "test-файл-测试.txt"
echo "Symbols content" > "test@#$%^&()_+.txt"

# 5. Create subdirectory structure
mkdir -p deep/nested/structure
echo "Deep nested file content" > deep/nested/structure/file.txt
echo "Subdirectory file 1" > deep/file1.txt
echo "Subdirectory file 2" > deep/file2.txt

# 6. Binary files
dd if=/dev/urandom of=test-binary-random.bin bs=1024 count=1 2>/dev/null
echo -e "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02" > test-fake-png.png

# Wait a moment for unfugit to commit these changes
sleep 2

# Now start comprehensive testing
log_test "Test Setup Complete" "Created various test files for comprehensive unfugit_get testing"

# Test 1: Get commit history first to identify available refs
echo "Getting commit history..."
HISTORY_RESULT=$(call_unfugit_get "nonexistent" "HEAD" | head -1)
log_test "Test 1: Getting available commits for testing" "$HISTORY_RESULT"

# Test 2: Basic file retrieval from HEAD
echo "Testing basic file retrieval..."
RESULT=$(call_unfugit_get "test-ascii.txt" "HEAD")
log_test "Test 2: Get ASCII text file from HEAD" "Path: test-ascii.txt, Ref: HEAD\nResult: $RESULT"

# Test 3: UTF-8 encoded file
RESULT=$(call_unfugit_get "test-utf8.txt" "HEAD")  
log_test "Test 3: Get UTF-8 encoded file" "Path: test-utf8.txt, Ref: HEAD\nResult: $RESULT"

# Test 4: Large text file
RESULT=$(call_unfugit_get "test-large-content.txt" "HEAD")
log_test "Test 4: Get large text file" "Path: test-large-content.txt, Ref: HEAD\nResult: $RESULT"

# Test 5: JSON file
RESULT=$(call_unfugit_get "test-data.json" "HEAD")
log_test "Test 5: Get JSON file" "Path: test-data.json, Ref: HEAD\nResult: $RESULT"

# Test 6: Binary file
RESULT=$(call_unfugit_get "test-mixed.bin" "HEAD")
log_test "Test 6: Get mixed binary file" "Path: test-mixed.bin, Ref: HEAD\nResult: $RESULT"

# Test 7: Random binary file
RESULT=$(call_unfugit_get "test-binary-random.bin" "HEAD")
log_test "Test 7: Get random binary file" "Path: test-binary-random.bin, Ref: HEAD\nResult: $RESULT"

# Test 8: File with spaces in name
RESULT=$(call_unfugit_get "test file with spaces.txt" "HEAD")
log_test "Test 8: Get file with spaces in name" "Path: 'test file with spaces.txt', Ref: HEAD\nResult: $RESULT"

# Test 9: Unicode filename
RESULT=$(call_unfugit_get "test-файл-测试.txt" "HEAD")
log_test "Test 9: Get file with unicode filename" "Path: test-файл-测试.txt, Ref: HEAD\nResult: $RESULT"

# Test 10: File with special symbols in name
RESULT=$(call_unfugit_get "test@#$%^&()_+.txt" "HEAD")
log_test "Test 10: Get file with special symbols in name" "Path: test@#\$%^&()_+.txt, Ref: HEAD\nResult: $RESULT"

# Test 11: Subdirectory file
RESULT=$(call_unfugit_get "deep/file1.txt" "HEAD")
log_test "Test 11: Get file from subdirectory" "Path: deep/file1.txt, Ref: HEAD\nResult: $RESULT"

# Test 12: Deep nested file
RESULT=$(call_unfugit_get "deep/nested/structure/file.txt" "HEAD")
log_test "Test 12: Get deeply nested file" "Path: deep/nested/structure/file.txt, Ref: HEAD\nResult: $RESULT"

# Test 13: Non-existent file
RESULT=$(call_unfugit_get "does-not-exist.txt" "HEAD")
log_test "Test 13: Get non-existent file" "Path: does-not-exist.txt, Ref: HEAD\nResult: $RESULT"

# Test 14: Invalid path  
RESULT=$(call_unfugit_get "../../../etc/passwd" "HEAD")
log_test "Test 14: Get invalid path (security test)" "Path: ../../../etc/passwd, Ref: HEAD\nResult: $RESULT"

# Test 15: Empty path
RESULT=$(call_unfugit_get "" "HEAD")  
log_test "Test 15: Get empty path" "Path: (empty), Ref: HEAD\nResult: $RESULT"

echo "" >> "$TEST_LOG"
echo "Test execution completed at: $(date)" >> "$TEST_LOG"

echo "✅ Comprehensive unfugit_get testing completed. Results logged to: $TEST_LOG"