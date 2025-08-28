#!/bin/bash

# Final comprehensive test script for unfugit search features

echo "=== Unfugit Comprehensive Search Tests ==="
echo

# Function to run a test
run_test() {
    local test_name="$1"
    local term="$2"
    local extra_args="$3"
    
    echo "Test: $test_name"
    echo "Searching for: '$term'"
    
    cat <<EOF | node dist/unfugit.js /home/user/.claude/mcp-servers/unfugit/temp 2>&1 | grep -A5 '"structuredContent"' | head -20
{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"unfugit_find_by_content","arguments":{"term":"$term"$extra_args,"limit":5}}}
EOF
    echo "---"
    echo
}

# Test 1: Simple search
run_test "Simple search for 'third'" "third" ""

# Test 2: Search in package.json
run_test "Search for 'vitest' (in package.json)" "vitest" ""

# Test 3: Case-insensitive search
run_test "Case-insensitive 'TEST'" "TEST" ',"ignoreCase":true'

# Test 4: Regex for version numbers
run_test "Regex: version numbers" "\\\\d+\\\\.\\\\d+\\\\.\\\\d+" ',"regex":true'

# Test 5: Path filtering
run_test "Search 'file' only in .txt" "file" ',"paths":["*.txt"]'

# Test 6: Complex regex
run_test "Regex: lines starting with 'This'" "^This" ',"regex":true'

# Test 7: Special characters
run_test "Search for parentheses '(that'" "(that" ""

# Test 8: OR pattern regex
run_test "Regex OR: third|vitest" "third|vitest" ',"regex":true'

# Test 9: Search in ignore file
run_test "Search for '*.log'" "*.log" ""

# Test 10: Case-sensitive exact match
run_test "Exact 'Test' (case-sensitive)" "Test" ""

echo "=== All tests completed ==="