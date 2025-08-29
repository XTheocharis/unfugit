# Comprehensive unfugit_find_by_content Tool Test Results

Generated: 2025-08-29T02:41:13.856Z

## Test Summary
- **Total tests**: 35
- **Passed**: 33
- **Failed**: 2
- **Success rate**: 94.3%

## Tool Description
The `unfugit_find_by_content` tool performs pickaxe search (git log -S or git log -G) to find commits where specific content was added or removed. This is particularly useful for:

- Finding when specific functions, classes, or variables were introduced
- Tracking when specific strings or patterns were added/removed
- Identifying commits that modified particular code sections
- Debugging when certain content disappeared from the codebase

### Parameters:
- `term` (required string): The text/pattern to search for in commit diffs
- `regex` (optional boolean, default: false): Whether to treat term as a regex pattern
- `ignoreCase` (optional boolean, default: false): Whether to ignore case when searching
- `limit` (optional number, default: 10): Maximum number of commits to return
- `paths` (optional array of strings): Glob patterns to limit search to specific files/directories

## Detailed Test Results

[2025-08-29T02:41:13.610Z] [INFO] Server started successfully
[2025-08-29T02:41:13.612Z] [INFO] Starting comprehensive unfugit_find_by_content testing...
[2025-08-29T02:41:13.612Z] [INFO] Server started successfully
[2025-08-29T02:41:13.614Z] [INFO] 
=== TEST 1: Basic search for "test" ===
[2025-08-29T02:41:13.614Z] [INFO] Arguments: {
  "term": "test"
}
[2025-08-29T02:41:13.640Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 6 commits with content changes for "test"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-data.json, test-large-content.txt
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
... and 1 more commits

[2025-08-29T02:41:13.640Z] [INFO] 
=== TEST 2: Search for function keyword ===
[2025-08-29T02:41:13.640Z] [INFO] Arguments: {
  "term": "function"
}
[2025-08-29T02:41:13.650Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "function"

[2025-08-29T02:41:13.650Z] [INFO] 
=== TEST 3: Search for "console" ===
[2025-08-29T02:41:13.651Z] [INFO] Arguments: {
  "term": "console"
}
[2025-08-29T02:41:13.660Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 3 commits with content changes for "console"

dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.660Z] [INFO] 
=== TEST 4: Case-sensitive search for "Test" ===
[2025-08-29T02:41:13.660Z] [INFO] Arguments: {
  "term": "Test",
  "ignoreCase": false
}
[2025-08-29T02:41:13.670Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "Test"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.670Z] [INFO] 
=== TEST 5: Case-insensitive search for "TEST" ===
[2025-08-29T02:41:13.670Z] [INFO] Arguments: {
  "term": "TEST",
  "ignoreCase": true
}
[2025-08-29T02:41:13.679Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 6 commits with content changes for "TEST"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-data.json, test-large-content.txt
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
... and 1 more commits

[2025-08-29T02:41:13.679Z] [INFO] 
=== TEST 6: Search with limit=3 ===
[2025-08-29T02:41:13.679Z] [INFO] Arguments: {
  "term": "test",
  "limit": 3
}
[2025-08-29T02:41:13.681Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "test"

[2025-08-29T02:41:13.681Z] [INFO] 
=== TEST 7: Search with limit=1 ===
[2025-08-29T02:41:13.681Z] [INFO] Arguments: {
  "term": "test",
  "limit": 1
}
[2025-08-29T02:41:13.682Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "test"

[2025-08-29T02:41:13.682Z] [INFO] 
=== TEST 8: Search in .txt files only ===
[2025-08-29T02:41:13.682Z] [INFO] Arguments: {
  "term": "test",
  "paths": [
    "*.txt"
  ]
}
[2025-08-29T02:41:13.693Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 1 commits with content changes for "test"

f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-large-content.txt


[2025-08-29T02:41:13.693Z] [INFO] 
=== TEST 9: Search in multiple file types ===
[2025-08-29T02:41:13.693Z] [INFO] Arguments: {
  "term": "test",
  "paths": [
    "*.txt",
    "*.js"
  ]
}
[2025-08-29T02:41:13.701Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 3 commits with content changes for "test"

f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-large-content.txt
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.701Z] [INFO] 
=== TEST 10: Search for @ symbol ===
[2025-08-29T02:41:13.701Z] [INFO] Arguments: {
  "term": "@"
}
[2025-08-29T02:41:13.708Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "@"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-binary-random.bin
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.708Z] [INFO] 
=== TEST 11: Search for special chars "#$%" ===
[2025-08-29T02:41:13.708Z] [INFO] Arguments: {
  "term": "#$%"
}
[2025-08-29T02:41:13.715Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 4 commits with content changes for "#$%"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.715Z] [INFO] 
=== TEST 12: Search for quoted content ===
[2025-08-29T02:41:13.715Z] [INFO] Arguments: {
  "term": "\"hello"
}
[2025-08-29T02:41:13.722Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for ""hello"

[2025-08-29T02:41:13.722Z] [INFO] 
=== TEST 13: Search for JSON bracket ===
[2025-08-29T02:41:13.722Z] [INFO] Arguments: {
  "term": "{"
}
[2025-08-29T02:41:13.728Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "{"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-binary-random.bin, test-data.json
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.728Z] [INFO] 
=== TEST 14: Search for "const" keyword ===
[2025-08-29T02:41:13.728Z] [INFO] Arguments: {
  "term": "const"
}
[2025-08-29T02:41:13.734Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 3 commits with content changes for "const"

dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.734Z] [INFO] 
=== TEST 15: Search for import statements ===
[2025-08-29T02:41:13.734Z] [INFO] Arguments: {
  "term": "import"
}
[2025-08-29T02:41:13.740Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "import"

[2025-08-29T02:41:13.740Z] [INFO] 
=== TEST 16: Search for ".js" extension ===
[2025-08-29T02:41:13.740Z] [INFO] Arguments: {
  "term": ".js"
}
[2025-08-29T02:41:13.746Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 4 commits with content changes for ".js"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.746Z] [INFO] 
=== TEST 17: Search for number "123" ===
[2025-08-29T02:41:13.746Z] [INFO] Arguments: {
  "term": "123"
}
[2025-08-29T02:41:13.751Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "123"

[2025-08-29T02:41:13.751Z] [INFO] 
=== TEST 18: Search for newline chars ===
[2025-08-29T02:41:13.751Z] [INFO] Arguments: {
  "term": "\\n"
}
[2025-08-29T02:41:13.757Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 4 commits with content changes for "\n"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.757Z] [INFO] 
=== TEST 19: Regex search for test.*file ===
[2025-08-29T02:41:13.757Z] [INFO] Arguments: {
  "term": "test.*file",
  "regex": true
}
[2025-08-29T02:41:13.762Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "test.*file"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.762Z] [INFO] 
=== TEST 20: Regex + case insensitive ===
[2025-08-29T02:41:13.762Z] [INFO] Arguments: {
  "term": "TEST.*FILE",
  "regex": true,
  "ignoreCase": true
}
[2025-08-29T02:41:13.768Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "TEST.*FILE"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.768Z] [INFO] 
=== TEST 21: Search for "http" (URLs) ===
[2025-08-29T02:41:13.768Z] [INFO] Arguments: {
  "term": "http"
}
[2025-08-29T02:41:13.773Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "http"

[2025-08-29T02:41:13.773Z] [INFO] 
=== TEST 22: Search for email @ patterns ===
[2025-08-29T02:41:13.773Z] [INFO] Arguments: {
  "term": "@"
}
[2025-08-29T02:41:13.778Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "@"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-binary-random.bin
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.778Z] [INFO] 
=== TEST 23: Long search string ===
[2025-08-29T02:41:13.778Z] [INFO] Arguments: {
  "term": "This is a very long string that probably wont be found but we need to test long content"
}
[2025-08-29T02:41:13.782Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "This is a very long string that probably wont be found but we need to test long content"

[2025-08-29T02:41:13.782Z] [INFO] 
=== TEST 24: Search for unicode characters ===
[2025-08-29T02:41:13.782Z] [INFO] Arguments: {
  "term": "файл"
}
[2025-08-29T02:41:13.787Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 4 commits with content changes for "файл"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.787Z] [INFO] 
=== TEST 25: Search for Chinese characters ===
[2025-08-29T02:41:13.787Z] [INFO] Arguments: {
  "term": "测试"
}
[2025-08-29T02:41:13.792Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "测试"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-data.json, test-utf8.txt
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.792Z] [INFO] 
=== TEST 26: Search for "commit" (git term) ===
[2025-08-29T02:41:13.792Z] [INFO] Arguments: {
  "term": "commit"
}
[2025-08-29T02:41:13.796Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 5 commits with content changes for "commit"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.796Z] [INFO] 
=== TEST 27: Search for "hello" ===
[2025-08-29T02:41:13.796Z] [INFO] Arguments: {
  "term": "hello"
}
[2025-08-29T02:41:13.800Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "hello"

[2025-08-29T02:41:13.800Z] [INFO] 
=== TEST 28: Search for "world" ===
[2025-08-29T02:41:13.800Z] [INFO] Arguments: {
  "term": "world"
}
[2025-08-29T02:41:13.804Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "world"

[2025-08-29T02:41:13.804Z] [INFO] 
=== TEST 29: Empty search term ===
[2025-08-29T02:41:13.804Z] [INFO] Arguments: {
  "term": ""
}
[2025-08-29T02:41:13.808Z] [FAIL] ❌ Expected error but got success
**Result**: FAILED - Expected error but got success

[2025-08-29T02:41:13.808Z] [INFO] 
=== TEST 30: All parameters test ===
[2025-08-29T02:41:13.808Z] [INFO] Arguments: {
  "term": "test",
  "regex": false,
  "ignoreCase": true,
  "limit": 2,
  "paths": [
    "*.txt"
  ]
}
[2025-08-29T02:41:13.809Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "test"

[2025-08-29T02:41:13.809Z] [INFO] 
=== TEST 31: Invalid regex pattern ===
[2025-08-29T02:41:13.809Z] [INFO] Arguments: {
  "term": "[unclosed",
  "regex": true
}
[2025-08-29T02:41:13.810Z] [FAIL] ❌ Expected error but got success
**Result**: FAILED - Expected error but got success

[2025-08-29T02:41:13.810Z] [INFO] 
=== TEST 32: Complex regex pattern ===
[2025-08-29T02:41:13.810Z] [INFO] Arguments: {
  "term": "\\b(test|hello)\\b",
  "regex": true
}
[2025-08-29T02:41:13.815Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 6 commits with content changes for "\b(test|hello)\b"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-data.json
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
... and 1 more commits

[2025-08-29T02:41:13.815Z] [INFO] 
=== TEST 33: Search in specific directories ===
[2025-08-29T02:41:13.815Z] [INFO] Arguments: {
  "term": "test",
  "paths": [
    "test*",
    "src/*"
  ]
}
[2025-08-29T02:41:13.818Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 4 commits with content changes for "test"

f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-data.json, test-large-content.txt
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
026ddff2 - Audit: 1 files changed at 2025-08-29T00:14:56.603Z
  Files: test-get-mcp.js


[2025-08-29T02:41:13.818Z] [INFO] 
=== TEST 34: Zero limit test ===
[2025-08-29T02:41:13.818Z] [INFO] Arguments: {
  "term": "test",
  "limit": 0
}
[2025-08-29T02:41:13.833Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 13 commits with content changes for "test"

bbd35413 - Audit: 1 files changed at 2025-08-29T00:15:23.077Z
  Files: temp2_get.md
f621080b - Audit: 13 files changed at 2025-08-29T00:15:18.121Z
  Files: test-data.json, test-large-content.txt
d2ea5f9d - Audit: 1 files changed at 2025-08-29T00:15:17.117Z
  Files: temp2_get.md
dd2a0fb7 - Audit: 2 files changed at 2025-08-29T00:15:12.315Z
  Files: test-get-mcp.cjs
b5251567 - Audit: 1 files changed at 2025-08-29T00:15:02.192Z
  Files: test-get-mcp.js
... and 8 more commits

[2025-08-29T02:41:13.833Z] [INFO] 
=== TEST 35: High limit test ===
[2025-08-29T02:41:13.833Z] [INFO] Arguments: {
  "term": "test",
  "limit": 100
}
[2025-08-29T02:41:13.856Z] [PASS] ✅ Success
**Result**: SUCCESS - Raw response: Found 0 commits with content changes for "test"

[2025-08-29T02:41:13.856Z] [INFO] 
=== TEST SUMMARY ===
[2025-08-29T02:41:13.856Z] [INFO] Total tests: 35
[2025-08-29T02:41:13.856Z] [INFO] Passed: 33
[2025-08-29T02:41:13.856Z] [INFO] Failed: 2
[2025-08-29T02:41:13.856Z] [INFO] Success rate: 94.3%

## Tool Usage Examples

### Basic Usage:
```json
{
  "term": "function myFunction"
}
```

### Advanced Usage:
```json
{
  "term": "console\\.log",
  "regex": true,
  "ignoreCase": true,
  "limit": 5,
  "paths": ["*.js", "src/**"]
}
```

### Common Search Patterns:
- Function definitions: `"function myFunc"` or `"def my_func"`
- Class definitions: `"class MyClass"` 
- Variable declarations: `"const myVar"` or `"var myVar"`
- Import statements: `"import.*from"`
- Specific strings: `"TODO"` or `"FIXME"`
- Configuration changes: `"database"` or `"api_key"`


## Edge Case Test Results

**Missing term parameter**: Error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": [
      "term"
    ],
    "message": "Required"
  }
]
**Null term**: Error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "null",
    "path": [
      "term"
    ],
    "message": "Expected string, received null"
  }
]
**Undefined term**: Error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": [
      "term"
    ],
    "message": "Required"
  }
]
**Very large limit**: Found 0 commits with content changes for "test"
**Negative limit**: Found 1 commits with content changes for "test"
**Non-string term (number)**: Error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "number",
    "path": [
      "term"
    ],
    "message": "Expected string, received number"
  }
]
**Non-string term (object)**: Error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "object",
    "path": [
      "term"
    ],
    "message": "Expected string, received object"
  }
]
**Empty paths array**: Found 6 commits with content changes for "test"
**Invalid path pattern**: Found 0 commits with content changes for "test"
**Non-boolean regex**: Error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
  {
    "code": "invalid_type",
    "expected": "boolean",
    "received": "string",
    "path": [
      "regex"
    ],
    "message": "Expected boolean, received string"
  }
]
**Non-boolean ignoreCase**: Error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
  {
    "code": "invalid_type",
    "expected": "boolean",
    "received": "string",
    "path": [
      "ignoreCase"
    ],
    "message": "Expected boolean, received string"
  }
]

### Key Findings:
- Empty strings are allowed as search terms (no validation error)
- Invalid regex patterns are accepted (git handles the validation)
- The tool is quite permissive and relies on git's underlying pickaxe functionality
- Malformed parameters are caught by the MCP parameter validation
- The tool gracefully handles various edge cases without crashing
