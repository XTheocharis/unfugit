# unfugit_show MCP Tool Comprehensive Test Results

Generated: 2025-08-28T19:38:59.814381

## Tool Overview

The `unfugit_show` tool displays detailed commit information including:
- Commit hash, author, date, and message
- File changes and statistics
- Diff content showing what was modified

## Repository Analysis

**Recent Commits:**
```
b55a866 Modify diff test files
d76691c Add initial diff test files
abafbc9 Modify direct test file A
8d04e4f Add direct test file A
bb3ad6b Modify test files
b413516 Add test files for diff testing
8b73e7a Modify diff test files
7934b47 Add initial diff test files
5fb74fa Initial commit with basic project structure
7124837 Fix test path to compiled unfugit.js location
```

**Available Branches:**
```
* main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
```

## Test Cases and Expected Behavior

### 1. Show Recent Commits by Hash

**Test Case 1.1: Show latest commit**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "b55a866"
  }
}
```

**Expected Result:** 
- Success with detailed commit information
- Includes commit metadata (author, date, message)
- Shows file changes and diff content

**Test Case 1.2: Show second most recent commit**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "d76691c"
  }
}
```

**Expected Result:** Success with commit details

**Test Case 1.3: Show third most recent commit**  
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "abafbc9"
  }
}
```

### 2. Show HEAD Commit

**Test Case 2.1: Explicit HEAD reference**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "HEAD"
  }
}
```

**Expected Result:** Success showing the latest commit

**Test Case 2.2: No ref parameter (defaults to HEAD)**
```json
{
  "name": "unfugit_show",
  "arguments": {}
}
```

**Expected Result:** Success showing the latest commit (default behavior)

### 3. Relative References

**Test Case 3.1: HEAD~1 (parent of HEAD)**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "HEAD~1"
  }
}
```

**Expected Result:** Success showing the previous commit

**Test Case 3.2: HEAD~2 (grandparent of HEAD)**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "HEAD~2"
  }
}
```

**Test Case 3.3: HEAD^ (first parent of HEAD)**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "HEAD^"
  }
}
```

**Test Case 3.4: HEAD^^ (grandparent via first parent)**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "HEAD^^"
  }
}
```

### 4. Invalid Commit Hashes (Error Cases)

**Test Case 4.1: Completely invalid hash**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "invalid123"
  }
}
```

**Expected Result:** Error - "bad revision 'invalid123'"

**Test Case 4.2: Zero hash**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "0000000"
  }
}
```

**Expected Result:** Error - invalid object name

**Test Case 4.3: Non-existent but valid-looking hash**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "abcdef1234567890abcdef1234567890abcdef12"
  }
}
```

**Expected Result:** Error - unknown revision

### 5. Non-existent References (Error Cases)

**Test Case 5.1: Non-existent branch**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "nonexistent-branch"
  }
}
```

**Expected Result:** Error - bad revision 'nonexistent-branch'

**Test Case 5.2: Out of range relative reference**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "HEAD~999"
  }
}
```

**Expected Result:** Error - bad revision 'HEAD~999'

**Test Case 5.3: Invalid ref format**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": "refs/heads/missing"
  }
}
```

**Expected Result:** Error - bad revision

### 6. Edge Cases and Parameter Validation

**Test Case 6.1: Empty string ref**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": ""
  }
}
```

**Expected Result:** Error - empty revision name not allowed

**Test Case 6.2: Null ref**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": null
  }
}
```

**Expected Result:** Should default to HEAD or validation error

**Test Case 6.3: Numeric ref**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": 123
  }
}
```

**Expected Result:** Error - invalid type

**Test Case 6.4: Object ref**
```json
{
  "name": "unfugit_show",
  "arguments": {
    "ref": {"invalid": true}
  }
}
```

**Expected Result:** Error - invalid type

### 7. Commit Types Testing

Based on the repository analysis, we should test:

#### Initial Commits
- Test showing the very first commit in the repository
- Should show creation of initial files

#### Modification Commits  
- Test commits that modify existing files
- Should show diff content with additions/deletions

#### File Addition Commits
- Test commits that add new files
- Should show new file creation

#### File Deletion Commits (if any)
- Test commits that delete files
- Should show file removal

#### Binary File Commits (if any)
- Test commits with binary files
- Should handle binary content appropriately

#### Renamed File Commits (if any)
- Test commits with file renames
- Should show rename detection

### 8. Response Format Validation

All successful responses should include:

```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "commit hash...\nAuthor: ...\nDate: ...\n\n    commit message\n\ndiff --git..."
      }
    ]
  }
}
```

Key elements to verify:
- `commit` line with full hash
- `Author:` line with name and email  
- `Date:` line with timestamp
- Commit message
- `diff --git` sections for file changes
- `@@` hunks showing line changes
- `+` and `-` prefixed lines showing additions/deletions

### 9. Error Response Format

All error responses should include:

```json
{
  "error": {
    "code": -32602,
    "message": "Git command failed: ...",
    "data": {
      "command": "git show <ref>",
      "exitCode": 128,
      "stderr": "..."
    }
  }
}
```

## Summary of Test Coverage

✅ **Successful Cases (should return commit details):**
- HEAD commit
- Recent commits by hash  
- Relative references (HEAD~1, HEAD~2, HEAD^, HEAD^^)
- Default behavior (no ref parameter)
- Initial commit
- Various commit types (adds, modifies, deletes)

❌ **Error Cases (should return errors):**
- Invalid commit hashes
- Non-existent references
- Out-of-range relative references
- Empty/null/invalid parameter types
- Non-existent branches

## Detailed Commit Information Sample

Here's what a successful response looks like with actual commit data:


### Sample Commit Details

**Commit b55a866:**
```
commit b55a8664e9e56976e2d21bd31183ae521dbad84f
Author: Test User <test@example.com>
Date:   Thu Aug 28 19:33:08 2025 -0700

    Modify diff test files

 diff-test-file1.txt | 5 +++--
 diff-test-file2.txt | 3 ++-
 2 files changed, 5 insertions(+), 3 deletions(-)
```

**Commit d76691c:**
```
commit d76691c04847c43b497a222ce687af37d7fd32b7
Author: Test User <test@example.com>
Date:   Thu Aug 28 19:33:08 2025 -0700

    Add initial diff test files

 diff-test-file1.txt | 5 ++---
 diff-test-file2.txt | 3 +--
 2 files changed, 3 insertions(+), 5 deletions(-)
```

**Commit abafbc9:**
```
commit abafbc9812cb7b11f1fe884e15a6ad5b1a9ce0ec
Author: Test User <test@example.com>
Date:   Thu Aug 28 18:26:10 2025 -0700

    Modify direct test file A

 direct-test-a.txt | 2 ++
 1 file changed, 2 insertions(+)
```


## Testing Methodology

1. **Functional Testing:** Verify each parameter combination works as expected
2. **Error Handling:** Confirm appropriate errors for invalid inputs  
3. **Response Format:** Validate JSON structure and content format
4. **Edge Cases:** Test boundary conditions and unusual inputs
5. **Performance:** Ensure reasonable response times
6. **Consistency:** Verify consistent behavior across different commit types

## Manual Testing Commands

To manually test the unfugit_show tool:

```bash
# Start the server
node dist/unfugit.js /path/to/project

# Send MCP requests via stdin:
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "unfugit_show", "arguments": {"ref": "HEAD"}}}
```

## Expected Behavior Summary

The unfugit_show tool should:
- ✅ Show detailed commit information for valid references
- ✅ Include author, date, message, and file changes  
- ✅ Display diff content with line-by-line changes
- ✅ Handle various reference formats (hash, HEAD, relative)
- ✅ Default to HEAD when no ref is provided
- ❌ Return appropriate errors for invalid references
- ❌ Handle malformed parameters gracefully
- 📊 Provide consistent response format
- ⚡ Respond within reasonable time limits

This comprehensive test suite covers all major functionality and edge cases for the unfugit_show MCP tool.


## Actual Git Command Output Examples

These examples show what the underlying git commands return, which should match the unfugit_show tool output:

### Successful Cases


#### Commit 1 B55A866

**Git Command:** `git show b55a866`

**Sample Output (637 total characters):**
```
commit b55a8664e9e56976e2d21bd31183ae521dbad84f
Author: Test User <test@example.com>
Date:   Thu Aug 28 19:33:08 2025 -0700

    Modify diff test files

diff --git a/diff-test-file1.txt b/diff-test-file1.txt
index 74e4856..19f1187 100644
--- a/diff-test-file1.txt
+++ b/diff-test-file1.txt
@@ -1,5 +1,6 @@
 Line 1
-Line 2
+Modified Line 2
 Line 3
-Original content
+Changed content here
 Line 5
+New Line 6
diff --git a/diff-test-file2.txt b/diff-test-file2.txt
index 6da4d3e..a417cad 100644
--- a/diff-test-file2.txt
+++ b/diff-test-file2.txt
@@ -1,3 +1,4 @@
-First line
+First line MODIFIED
 Second line
 Third line
+Added fourth line

```

**Expected unfugit_show Response:**
```json
{
  "result": {
    "content": [
      {
        "type": "text", 
        "text": "commit b55a8664e9e56976e2d21bd31183ae521dbad84f\nAuthor: Test User <test@example.com>\nDate:   Thu Aug 28 19:33:08 2025 -0700\n\n    Modify diff test files\n\ndiff --git a/diff-test-file1.txt b/diff-test-fi..."
      }
    ]
  }
}
```


#### Commit 2 D76691C

**Git Command:** `git show d76691c`

**Sample Output (642 total characters):**
```
commit d76691c04847c43b497a222ce687af37d7fd32b7
Author: Test User <test@example.com>
Date:   Thu Aug 28 19:33:08 2025 -0700

    Add initial diff test files

diff --git a/diff-test-file1.txt b/diff-test-file1.txt
index 19f1187..74e4856 100644
--- a/diff-test-file1.txt
+++ b/diff-test-file1.txt
@@ -1,6 +1,5 @@
 Line 1
-Modified Line 2
+Line 2
 Line 3
-Changed content here
+Original content
 Line 5
-New Line 6
diff --git a/diff-test-file2.txt b/diff-test-file2.txt
index a417cad..6da4d3e 100644
--- a/diff-test-file2.txt
+++ b/diff-test-file2.txt
@@ -1,4 +1,3 @@
-First line MODIFIED
+First line
 Second line
 Third line
-Added fourth line

```

**Expected unfugit_show Response:**
```json
{
  "result": {
    "content": [
      {
        "type": "text", 
        "text": "commit d76691c04847c43b497a222ce687af37d7fd32b7\nAuthor: Test User <test@example.com>\nDate:   Thu Aug 28 19:33:08 2025 -0700\n\n    Add initial diff test files\n\ndiff --git a/diff-test-file1.txt b/diff-te..."
      }
    ]
  }
}
```


#### Commit 3 Abafbc9

**Git Command:** `git show abafbc9`

**Sample Output (343 total characters):**
```
commit abafbc9812cb7b11f1fe884e15a6ad5b1a9ce0ec
Author: Test User <test@example.com>
Date:   Thu Aug 28 18:26:10 2025 -0700

    Modify direct test file A

diff --git a/direct-test-a.txt b/direct-test-a.txt
index 38ffdaf..ff4f30f 100644
--- a/direct-test-a.txt
+++ b/direct-test-a.txt
@@ -1 +1,3 @@
 Test content A
+Modified line
+New content

```

**Expected unfugit_show Response:**
```json
{
  "result": {
    "content": [
      {
        "type": "text", 
        "text": "commit abafbc9812cb7b11f1fe884e15a6ad5b1a9ce0ec\nAuthor: Test User <test@example.com>\nDate:   Thu Aug 28 18:26:10 2025 -0700\n\n    Modify direct test file A\n\ndiff --git a/direct-test-a.txt b/direct-test..."
      }
    ]
  }
}
```


### Error Cases

#### Error: invalid123

**Git Command:** `git show invalid123`
**Exit Code:** 128
**STDERR:** fatal: ambiguous argument 'invalid123': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'


**Expected unfugit_show Response:**
```json
{
  "error": {
    "code": -32602,
    "message": "Git command failed: fatal: ambiguous argument 'invalid123': unknown revision or path not in the working tree. Use '--' t",
    "data": {
      "command": "git show invalid123",
      "exitCode": 128,
      "stderr": "fatal: ambiguous argument 'invalid123': unknown revision or path not in the working tree. Use '--' t"
    }
  }
}
```


#### Error: HEAD~999

**Git Command:** `git show HEAD~999`
**Exit Code:** 128
**STDERR:** fatal: ambiguous argument 'HEAD~999': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'


**Expected unfugit_show Response:**
```json
{
  "error": {
    "code": -32602,
    "message": "Git command failed: fatal: ambiguous argument 'HEAD~999': unknown revision or path not in the working tree. Use '--' to ",
    "data": {
      "command": "git show HEAD~999",
      "exitCode": 128,
      "stderr": "fatal: ambiguous argument 'HEAD~999': unknown revision or path not in the working tree. Use '--' to "
    }
  }
}
```


#### Error: nonexistent-branch

**Git Command:** `git show nonexistent-branch`
**Exit Code:** 128
**STDERR:** fatal: ambiguous argument 'nonexistent-branch': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'


**Expected unfugit_show Response:**
```json
{
  "error": {
    "code": -32602,
    "message": "Git command failed: fatal: ambiguous argument 'nonexistent-branch': unknown revision or path not in the working tree. Us",
    "data": {
      "command": "git show nonexistent-branch",
      "exitCode": 128,
      "stderr": "fatal: ambiguous argument 'nonexistent-branch': unknown revision or path not in the working tree. Us"
    }
  }
}
```



## Practical Testing Steps

Since the MCP server communication is complex, here are practical steps to test unfugit_show:

### Method 1: Direct MCP Testing with curl/echo

1. Start the server:
```bash
cd /home/user/.claude/mcp-servers/unfugit
node dist/unfugit.js .
```

2. In another terminal, send MCP messages:
```bash
# Initialize MCP
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/unfugit.js .

# Test unfugit_show
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"unfugit_show","arguments":{"ref":"HEAD"}}}' | node dist/unfugit.js .
```

### Method 2: Using the Claude MCP Integration

If unfugit is installed as an MCP server in Claude, you can test directly:

```
Test unfugit_show with HEAD
Test unfugit_show with a specific commit hash
Test unfugit_show with invalid references
```

### Method 3: Programmatic Testing

Use the test script created (test-show-comprehensive.mjs) with proper MCP handshake:

```bash
chmod +x test-show-comprehensive.mjs
node test-show-comprehensive.mjs
```

## Verification Checklist

For each test case, verify:

- [ ] **Response Format**: JSON-RPC 2.0 compliant response
- [ ] **Content Structure**: Result contains 'content' array with 'text' type
- [ ] **Commit Data**: Includes hash, author, date, message
- [ ] **Diff Content**: Shows file changes with +/- lines  
- [ ] **Error Handling**: Invalid refs return proper error responses
- [ ] **Performance**: Response time under 5 seconds for normal commits
- [ ] **Edge Cases**: Empty/null parameters handled gracefully

## Common Issues and Troubleshooting

1. **Server Timeout**: The MCP server may take time to initialize
2. **Git Repository**: Ensure you're in a valid git repository
3. **Permissions**: Check file permissions for git operations
4. **Binary Files**: Large binary files may cause response truncation
5. **Network**: Ensure no network operations are interfering

## Test Results Summary

**Status**: Test framework created ✅
**Documentation**: Comprehensive ✅ 
**Real Examples**: Included ✅
**Error Cases**: Documented ✅
**Manual Testing**: Instructions provided ✅

**Next Steps**: 
- Run actual MCP tests with proper handshake
- Validate response formats match expectations
- Test edge cases and error conditions
- Document any discrepancies or issues found

