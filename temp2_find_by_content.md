# Comprehensive unfugit_find_by_content Tool Test Results

Generated: 2025-08-29T02:39:53.236Z

## Test Summary
- **Total tests**: 15
- **Passed**: 1
- **Failed**: 14
- **Success rate**: 6.7%

## Tool Description
The `unfugit_find_by_content` tool performs pickaxe search (git log -S) to find commits where specific content was added or removed. This is useful for tracking when specific strings, functions, or patterns were introduced or deleted from the codebase.

### Parameters:
- `search_string` (required): The text to search for in commit diffs
- `ignore_case` (optional): Whether to ignore case when searching (default: false)
- `path_filter` (optional): Glob pattern to limit search to specific files (e.g., "*.js", "src/**")
- `limit` (optional): Maximum number of commits to return

## Detailed Test Results

[2025-08-29T02:39:53.231Z] [INFO] Server started successfully
[2025-08-29T02:39:53.231Z] [INFO] Starting unfugit_find_by_content testing...
[2025-08-29T02:39:53.231Z] [INFO] Server started successfully
[2025-08-29T02:39:53.233Z] [INFO] 
=== TEST 1: Basic search for "test" ===
[2025-08-29T02:39:53.233Z] [INFO] Arguments: {
  "search_string": "test"
}
[2025-08-29T02:39:53.233Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.233Z] [INFO] 
=== TEST 2: Search for "console" ===
[2025-08-29T02:39:53.233Z] [INFO] Arguments: {
  "search_string": "console"
}
[2025-08-29T02:39:53.234Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.234Z] [INFO] 
=== TEST 3: Case-sensitive search for "Test" ===
[2025-08-29T02:39:53.234Z] [INFO] Arguments: {
  "search_string": "Test",
  "ignore_case": false
}
[2025-08-29T02:39:53.234Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.234Z] [INFO] 
=== TEST 4: Case-insensitive search for "TEST" ===
[2025-08-29T02:39:53.234Z] [INFO] Arguments: {
  "search_string": "TEST",
  "ignore_case": true
}
[2025-08-29T02:39:53.234Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.234Z] [INFO] 
=== TEST 5: Search with limit=3 ===
[2025-08-29T02:39:53.234Z] [INFO] Arguments: {
  "search_string": "test",
  "limit": 3
}
[2025-08-29T02:39:53.234Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.234Z] [INFO] 
=== TEST 6: Search in .txt files ===
[2025-08-29T02:39:53.234Z] [INFO] Arguments: {
  "search_string": "test",
  "path_filter": "*.txt"
}
[2025-08-29T02:39:53.234Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.234Z] [INFO] 
=== TEST 7: Search for special chars "@" ===
[2025-08-29T02:39:53.234Z] [INFO] Arguments: {
  "search_string": "@"
}
[2025-08-29T02:39:53.235Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.235Z] [INFO] 
=== TEST 8: Empty search string ===
[2025-08-29T02:39:53.235Z] [INFO] Arguments: {
  "search_string": ""
}
[2025-08-29T02:39:53.235Z] [PASS] ✅ Expected error received: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: Expected error - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.235Z] [INFO] 
=== TEST 9: Long search string ===
[2025-08-29T02:39:53.235Z] [INFO] Arguments: {
  "search_string": "This is a very long string to test"
}
[2025-08-29T02:39:53.235Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.235Z] [INFO] 
=== TEST 10: Search with quotes ===
[2025-08-29T02:39:53.235Z] [INFO] Arguments: {
  "search_string": "\"hello world\""
}
[2025-08-29T02:39:53.235Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.235Z] [INFO] 
=== TEST 11: Search for numbers ===
[2025-08-29T02:39:53.235Z] [INFO] Arguments: {
  "search_string": "123"
}
[2025-08-29T02:39:53.235Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.235Z] [INFO] 
=== TEST 12: Search for JSON bracket ===
[2025-08-29T02:39:53.235Z] [INFO] Arguments: {
  "search_string": "{"
}
[2025-08-29T02:39:53.235Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.235Z] [INFO] 
=== TEST 13: Search for "const" ===
[2025-08-29T02:39:53.235Z] [INFO] Arguments: {
  "search_string": "const"
}
[2025-08-29T02:39:53.236Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.236Z] [INFO] 
=== TEST 14: Search for ".js" ===
[2025-08-29T02:39:53.236Z] [INFO] Arguments: {
  "search_string": ".js"
}
[2025-08-29T02:39:53.236Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.236Z] [INFO] 
=== TEST 15: All parameters test ===
[2025-08-29T02:39:53.236Z] [INFO] Arguments: {
  "search_string": "test",
  "path_filter": "*.txt",
  "ignore_case": true,
  "limit": 2
}
[2025-08-29T02:39:53.236Z] [FAIL] ❌ Unexpected error: MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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
**Result**: FAILED - MCP error -32602: Invalid arguments for tool unfugit_find_by_content: [
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

[2025-08-29T02:39:53.236Z] [INFO] 
=== TEST SUMMARY ===
[2025-08-29T02:39:53.236Z] [INFO] Total tests: 15
[2025-08-29T02:39:53.236Z] [INFO] Passed: 1
[2025-08-29T02:39:53.236Z] [INFO] Failed: 14
[2025-08-29T02:39:53.236Z] [INFO] Success rate: 6.7%