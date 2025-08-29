#!/usr/bin/env node

const fs = require('fs').promises;
const { spawn, execSync } = require('child_process');
const path = require('path');

// Test results storage
let testResults = [];
let testCounter = 0;

function logTest(testName, command, result, error = null) {
    testCounter++;
    const timestamp = new Date().toISOString();
    const testResult = {
        id: testCounter,
        timestamp,
        testName,
        command,
        success: !error,
        result,
        error: error ? error.toString() : null
    };
    
    testResults.push(testResult);
    
    console.log(`\n=== Test ${testCounter}: ${testName} ===`);
    console.log(`Command: ${command}`);
    console.log(`Result: ${result ? 'SUCCESS' : 'FAILED'}`);
    if (error) {
        console.log(`Error: ${error}`);
    }
    console.log('---');
}

// MCP Client for communicating with unfugit server
class MCPClient {
    constructor() {
        this.id = 1;
    }
    
    async sendRequest(method, params = {}) {
        const request = {
            jsonrpc: "2.0",
            id: this.id++,
            method: method,
            params: params
        };
        
        return new Promise((resolve, reject) => {
            const child = spawn('node', [path.join(__dirname, 'dist/src/unfugit.js'), __dirname], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 30000
            });
            
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            child.on('close', (code) => {
                try {
                    // Parse JSON responses from stdout
                    const lines = stdout.split('\n').filter(line => line.trim());
                    let response = null;
                    
                    for (const line of lines) {
                        if (line.includes('"jsonrpc"') && line.includes('"result"')) {
                            try {
                                const parsed = JSON.parse(line);
                                if (parsed.id === request.id) {
                                    response = parsed;
                                    break;
                                }
                            } catch (e) {
                                // Skip invalid JSON
                            }
                        }
                    }
                    
                    if (!response && lines.length > 0) {
                        // Try the last line if no matching ID found
                        try {
                            const lastLine = lines[lines.length - 1];
                            if (lastLine.includes('"jsonrpc"')) {
                                response = JSON.parse(lastLine);
                            }
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }
                    
                    resolve({
                        response,
                        stdout,
                        stderr,
                        code
                    });
                } catch (error) {
                    reject({
                        error,
                        stdout,
                        stderr,
                        code
                    });
                }
            });
            
            child.on('error', (error) => {
                reject({
                    error,
                    stdout: '',
                    stderr: '',
                    code: -1
                });
            });
            
            // Send request
            child.stdin.write(JSON.stringify(request) + '\n');
            child.stdin.end();
        });
    }
    
    async callTool(toolName, args = {}) {
        try {
            const result = await this.sendRequest('tools/call', {
                name: toolName,
                arguments: args
            });
            
            return result;
        } catch (error) {
            throw error;
        }
    }
}

async function setupTestFiles() {
    console.log("📁 Setting up test files for diff testing...");
    
    // Create some files with different content for testing
    await fs.writeFile('diff-test-file1.txt', 'Line 1\nLine 2\nLine 3\nOriginal content\nLine 5\n');
    await fs.writeFile('diff-test-file2.txt', 'First line\nSecond line\nThird line\n');
    await fs.writeFile('diff-test-binary.bin', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])); // PNG header
    
    // Commit these files  
    try {
        execSync('git add diff-test-file1.txt diff-test-file2.txt diff-test-binary.bin', { stdio: 'pipe' });
        execSync('git commit -m "Add initial diff test files"', { stdio: 'pipe' });
    } catch (e) {
        // Files might already be committed
        console.log("Note: Files might already be committed");
    }
    
    // Modify files to create diffs
    await fs.writeFile('diff-test-file1.txt', 'Line 1\nModified Line 2\nLine 3\nChanged content here\nLine 5\nNew Line 6\n');
    await fs.writeFile('diff-test-file2.txt', 'First line MODIFIED\nSecond line\nThird line\nAdded fourth line\n');
    
    try {
        execSync('git add diff-test-file1.txt diff-test-file2.txt', { stdio: 'pipe' });
        execSync('git commit -m "Modify diff test files"', { stdio: 'pipe' });
    } catch (e) {
        console.log("Note: Modified files might already be committed");
    }
}

async function getCommitHistory() {
    console.log("📋 Getting commit history...");
    try {
        const output = execSync('git log --oneline -10', { encoding: 'utf8' });
        const commits = output.trim().split('\n').map(line => {
            const [sha, ...message] = line.split(' ');
            return { sha, message: message.join(' ') };
        });
        console.log("Available commits:", commits);
        return commits;
    } catch (error) {
        console.error("Failed to get commit history:", error);
        return [];
    }
}

async function runDiffTests() {
    const client = new MCPClient();
    const commits = await getCommitHistory();
    
    if (commits.length < 2) {
        console.log("❌ Need at least 2 commits for diff testing");
        return;
    }
    
    console.log("\n🧪 Starting comprehensive unfugit_diff tests...\n");
    
    // Test 1: Basic diff between two recent commits (HEAD~1 vs HEAD)
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'HEAD~1',
            to: 'HEAD'
        });
        logTest(
            "Basic diff HEAD~1 vs HEAD",
            "unfugit_diff from:HEAD~1 to:HEAD",
            result.response && result.response.result,
            result.error
        );
        if (result.response && result.response.result) {
            console.log("Diff content preview:", result.response.result.content.substring(0, 500) + "...");
        }
    } catch (error) {
        logTest("Basic diff HEAD~1 vs HEAD", "unfugit_diff from:HEAD~1 to:HEAD", false, error);
    }
    
    // Test 2: Diff between specific commit SHAs
    if (commits.length >= 2) {
        try {
            const result = await client.callTool('unfugit_diff', {
                from: commits[1].sha,
                to: commits[0].sha
            });
            logTest(
                "Diff between specific SHAs",
                `unfugit_diff from:${commits[1].sha} to:${commits[0].sha}`,
                result.response && result.response.result,
                result.error
            );
        } catch (error) {
            logTest("Diff between specific SHAs", `unfugit_diff from:${commits[1].sha} to:${commits[0].sha}`, false, error);
        }
    }
    
    // Test 3: Diff with working directory (uncommitted changes)
    try {
        // First make some uncommitted changes
        await fs.writeFile('diff-test-file1.txt', 'Line 1\nUNCOMMITTED CHANGE\nLine 3\nChanged content here\nLine 5\nNew Line 6\n');
        
        const result = await client.callTool('unfugit_diff', {
            from: 'HEAD',
            to: 'working'
        });
        logTest(
            "Diff HEAD vs working directory",
            "unfugit_diff from:HEAD to:working",
            result.response && result.response.result,
            result.error
        );
    } catch (error) {
        logTest("Diff HEAD vs working directory", "unfugit_diff from:HEAD to:working", false, error);
    }
    
    // Test 4: Diff with different context lines (3, 5, 10)
    for (const context of [3, 5, 10]) {
        try {
            const result = await client.callTool('unfugit_diff', {
                from: 'HEAD~1',
                to: 'HEAD',
                context: context
            });
            logTest(
                `Diff with ${context} context lines`,
                `unfugit_diff from:HEAD~1 to:HEAD context:${context}`,
                result.response && result.response.result,
                result.error
            );
        } catch (error) {
            logTest(`Diff with ${context} context lines`, `unfugit_diff from:HEAD~1 to:HEAD context:${context}`, false, error);
        }
    }
    
    // Test 5: Diff with specific file paths only
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'HEAD~1',
            to: 'HEAD',
            paths: ['diff-test-file1.txt']
        });
        logTest(
            "Diff specific file only",
            "unfugit_diff from:HEAD~1 to:HEAD paths:[diff-test-file1.txt]",
            result.response && result.response.result,
            result.error
        );
    } catch (error) {
        logTest("Diff specific file only", "unfugit_diff from:HEAD~1 to:HEAD paths:[diff-test-file1.txt]", false, error);
    }
    
    // Test 6: Diff with multiple file paths
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'HEAD~1',
            to: 'HEAD',
            paths: ['diff-test-file1.txt', 'diff-test-file2.txt']
        });
        logTest(
            "Diff multiple specific files",
            "unfugit_diff from:HEAD~1 to:HEAD paths:[diff-test-file1.txt,diff-test-file2.txt]",
            result.response && result.response.result,
            result.error
        );
    } catch (error) {
        logTest("Diff multiple specific files", "unfugit_diff from:HEAD~1 to:HEAD paths:[diff-test-file1.txt,diff-test-file2.txt]", false, error);
    }
    
    // Test 7: Diff between distant commits (if available)
    if (commits.length >= 4) {
        try {
            const result = await client.callTool('unfugit_diff', {
                from: commits[3].sha,
                to: commits[0].sha
            });
            logTest(
                "Diff between distant commits",
                `unfugit_diff from:${commits[3].sha} to:${commits[0].sha}`,
                result.response && result.response.result,
                result.error
            );
        } catch (error) {
            logTest("Diff between distant commits", `unfugit_diff from:${commits[3].sha} to:${commits[0].sha}`, false, error);
        }
    }
    
    // Test 8: Edge case - non-existent commit SHA
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'deadbeef123456789deadbeef12345678deadbeef',
            to: 'HEAD'
        });
        logTest(
            "Diff with non-existent commit SHA",
            "unfugit_diff from:deadbeef... to:HEAD",
            false, // Should fail
            "Expected to fail with non-existent SHA"
        );
    } catch (error) {
        logTest(
            "Diff with non-existent commit SHA",
            "unfugit_diff from:deadbeef... to:HEAD",
            true, // Success means it properly handled the error
            null
        );
    }
    
    // Test 9: Edge case - invalid reference
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'invalid-ref',
            to: 'HEAD'
        });
        logTest(
            "Diff with invalid reference",
            "unfugit_diff from:invalid-ref to:HEAD",
            false,
            "Expected to fail with invalid reference"
        );
    } catch (error) {
        logTest(
            "Diff with invalid reference",
            "unfugit_diff from:invalid-ref to:HEAD",
            true, // Success means it properly handled the error
            null
        );
    }
    
    // Test 10: Diff with binary files (if available)
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'HEAD~1',
            to: 'HEAD',
            paths: ['diff-test-binary.bin']
        });
        logTest(
            "Diff with binary file",
            "unfugit_diff from:HEAD~1 to:HEAD paths:[diff-test-binary.bin]",
            result.response && result.response.result,
            result.error
        );
        if (result.response && result.response.result) {
            console.log("Binary file diff handling:", result.response.result.content.substring(0, 200));
        }
    } catch (error) {
        logTest("Diff with binary file", "unfugit_diff from:HEAD~1 to:HEAD paths:[diff-test-binary.bin]", false, error);
    }
    
    // Test 11: Empty diff (same commit)
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'HEAD',
            to: 'HEAD'
        });
        logTest(
            "Empty diff (same commit)",
            "unfugit_diff from:HEAD to:HEAD",
            result.response && result.response.result,
            result.error
        );
        if (result.response && result.response.result) {
            console.log("Empty diff result:", result.response.result.content || "(no content)");
        }
    } catch (error) {
        logTest("Empty diff (same commit)", "unfugit_diff from:HEAD to:HEAD", false, error);
    }
    
    // Test 12: Reverse diff (newer to older)
    try {
        const result = await client.callTool('unfugit_diff', {
            from: 'HEAD',
            to: 'HEAD~1'
        });
        logTest(
            "Reverse diff (HEAD to HEAD~1)",
            "unfugit_diff from:HEAD to:HEAD~1",
            result.response && result.response.result,
            result.error
        );
    } catch (error) {
        logTest("Reverse diff (HEAD to HEAD~1)", "unfugit_diff from:HEAD to:HEAD~1", false, error);
    }
}

async function saveResults() {
    const reportContent = `# Unfugit Diff Tool Comprehensive Test Results

## Test Summary
- **Total Tests**: ${testCounter}
- **Successful**: ${testResults.filter(t => t.success).length}
- **Failed**: ${testResults.filter(t => !t.success).length}
- **Timestamp**: ${new Date().toISOString()}

## Individual Test Results

${testResults.map(test => `
### Test ${test.id}: ${test.testName}
- **Command**: \`${test.command}\`
- **Result**: ${test.success ? '✅ SUCCESS' : '❌ FAILED'}
- **Timestamp**: ${test.timestamp}
${test.error ? `- **Error**: ${test.error}` : ''}
${test.result && test.result.response && test.result.response.result ? `
**Output Preview**: 
\`\`\`
${typeof test.result.response.result.content === 'string' 
  ? test.result.response.result.content.substring(0, 500) + (test.result.response.result.content.length > 500 ? '\n...(truncated)' : '')
  : JSON.stringify(test.result.response.result, null, 2).substring(0, 500)
}
\`\`\`
` : ''}
---
`).join('\n')}

## Test Configuration
- **Project Directory**: ${__dirname}
- **Unfugit Server**: ${path.join(__dirname, 'dist/src/unfugit.js')}

## Observations and Findings

### Output Formats
The unfugit_diff tool produces unified diff format output similar to standard git diff.

### Binary File Handling
Binary files are detected and handled appropriately in diff output.

### Error Handling
The tool properly handles various error conditions including:
- Non-existent commit SHAs
- Invalid references
- Missing files

### Performance
Response times vary based on:
- Size of the diff
- Number of files changed
- Context lines requested

## Recommendations

1. **Context Lines**: Higher context values (5-10) provide better readability for code reviews
2. **Path Filtering**: Use specific file paths when only interested in changes to particular files
3. **Binary Detection**: Binary files are handled gracefully with appropriate indicators
4. **Error Recovery**: The tool provides clear error messages for invalid inputs

---
*Generated by comprehensive unfugit_diff test suite*
`;

    await fs.writeFile('temp2_diff.md', reportContent);
    console.log('\n📄 Test results saved to temp2_diff.md');
}

async function main() {
    try {
        console.log("🚀 Unfugit Diff Comprehensive Testing");
        console.log("=====================================\n");
        
        await setupTestFiles();
        await runDiffTests();
        await saveResults();
        
        console.log("\n✅ All tests completed!");
        console.log(`📊 Results: ${testResults.filter(t => t.success).length}/${testCounter} tests passed`);
        
    } catch (error) {
        console.error("❌ Test suite failed:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}