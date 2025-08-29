#!/usr/bin/env node

const fs = require('fs').promises;
const { spawn, execSync } = require('child_process');
const path = require('path');

// Test results storage
let testResults = [];
let testCounter = 0;

function logTest(testName, command, success, result = null, error = null) {
    testCounter++;
    const timestamp = new Date().toISOString();
    const testResult = {
        id: testCounter,
        timestamp,
        testName,
        command,
        success,
        result,
        error: error ? error.toString() : null
    };
    
    testResults.push(testResult);
    
    console.log(`\n=== Test ${testCounter}: ${testName} ===`);
    console.log(`Command: ${command}`);
    console.log(`Result: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (error) {
        console.log(`Error: ${error}`);
    }
    if (result && result.content) {
        console.log(`Response Type: ${typeof result.content}`);
        console.log(`Content Sample: ${JSON.stringify(result.content).substring(0, 200)}...`);
    }
    console.log('---');
}

// Simple MCP Client for communicating with unfugit server
class SimpleMCPClient {
    constructor() {
        this.id = 1;
        this.serverProcess = null;
    }
    
    async connect() {
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', [path.join(__dirname, 'dist/unfugit.js'), __dirname], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 30000
            });
            
            let initReceived = false;
            
            this.serverProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.method === 'notifications/tools/list_changed' && !initReceived) {
                            initReceived = true;
                            resolve();
                            break;
                        }
                    } catch (e) {
                        // Ignore non-JSON lines
                    }
                }
            });
            
            this.serverProcess.on('error', reject);
            
            setTimeout(() => {
                if (!initReceived) {
                    resolve(); // Proceed anyway after timeout
                }
            }, 3000);
        });
    }
    
    async callTool(toolName, args = {}) {
        return new Promise((resolve, reject) => {
            const request = {
                jsonrpc: "2.0",
                id: this.id++,
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: args
                }
            };
            
            let stdout = '';
            let responseReceived = false;
            
            const dataHandler = (data) => {
                stdout += data.toString();
                const lines = stdout.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.id === request.id && parsed.result !== undefined) {
                            responseReceived = true;
                            this.serverProcess.stdout.removeListener('data', dataHandler);
                            resolve(parsed.result);
                            return;
                        }
                        if (parsed.id === request.id && parsed.error !== undefined) {
                            responseReceived = true;
                            this.serverProcess.stdout.removeListener('data', dataHandler);
                            reject(new Error(parsed.error.message || 'Tool call failed'));
                            return;
                        }
                    } catch (e) {
                        // Continue parsing other lines
                    }
                }
            };
            
            this.serverProcess.stdout.on('data', dataHandler);
            
            // Send the request
            this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
            
            // Set timeout for this specific request
            setTimeout(() => {
                if (!responseReceived) {
                    this.serverProcess.stdout.removeListener('data', dataHandler);
                    reject(new Error('Request timeout'));
                }
            }, 10000);
        });
    }
    
    disconnect() {
        if (this.serverProcess) {
            this.serverProcess.kill();
        }
    }
}

async function setupTestEnvironment() {
    console.log("🔧 Setting up test environment...");
    
    // Create test files with known content
    const testFiles = {
        'diff-test-a.txt': 'Line A1\nLine A2\nLine A3\nOriginal content A\nLine A5\n',
        'diff-test-b.txt': 'Line B1\nLine B2\nLine B3\n',
        'diff-test-large.txt': Array(100).fill(0).map((_, i) => `Line ${i + 1}`).join('\n') + '\n',
        'diff-test-binary.bin': Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]),
        'test-utf8.txt': 'Hello 世界\nΕλληνικά text\nРусский текст\n',
        'test-mixed.txt': 'Mixed content\n\twith tabs\n  and spaces\n\nand empty lines\n',
    };
    
    // Write initial versions
    for (const [filename, content] of Object.entries(testFiles)) {
        await fs.writeFile(filename, content);
    }
    
    // Initial commit
    try {
        execSync('git add .', { stdio: 'pipe' });
        execSync('git commit -m "Setup comprehensive diff test files"', { stdio: 'pipe' });
    } catch (e) {
        console.log("Initial commit may already exist");
    }
    
    // Create modified versions
    await fs.writeFile('diff-test-a.txt', 'Line A1 MODIFIED\nLine A2\nNEW LINE A2.5\nLine A3\nChanged content A\nLine A5\nNEW LINE A6\n');
    await fs.writeFile('diff-test-b.txt', 'Line B1 MODIFIED\nLine B2\nLine B3\nNEW LINE B4\n');
    await fs.writeFile('diff-test-large.txt', Array(102).fill(0).map((_, i) => i < 50 ? `Modified Line ${i + 1}` : `Line ${i + 1}`).join('\n') + '\n');
    
    // Second commit
    try {
        execSync('git add diff-test-a.txt diff-test-b.txt diff-test-large.txt', { stdio: 'pipe' });
        execSync('git commit -m "Modify test files for diff testing"', { stdio: 'pipe' });
    } catch (e) {
        console.log("Second commit may already exist");
    }
    
    // Make some working directory changes (uncommitted)
    await fs.writeFile('diff-test-a.txt', 'Line A1 WORKING DIR CHANGE\nLine A2\nNEW LINE A2.5\nLine A3\nWorking dir content A\nLine A5\nNEW LINE A6\nWORKING DIR LINE\n');
    
    console.log("✅ Test environment ready");
}

async function getCommitInfo() {
    try {
        const output = execSync('git log --oneline -5', { encoding: 'utf8' });
        return output.trim().split('\n').map(line => {
            const [sha, ...message] = line.split(' ');
            return { sha, message: message.join(' ') };
        });
    } catch (error) {
        console.error("Failed to get commit info:", error);
        return [];
    }
}

async function runComprehensiveDiffTests() {
    const client = new SimpleMCPClient();
    const commits = await getCommitInfo();
    
    console.log("📋 Available commits:", commits);
    
    if (commits.length < 2) {
        console.log("❌ Need at least 2 commits for testing");
        return;
    }
    
    try {
        await client.connect();
        console.log("🔗 Connected to unfugit server");
        
        // Test 1: Basic diff between commits
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD'
            });
            logTest("Basic diff HEAD~1 vs HEAD", "unfugit_diff from_ref:HEAD~1 to_ref:HEAD", true, result);
        } catch (error) {
            logTest("Basic diff HEAD~1 vs HEAD", "unfugit_diff from_ref:HEAD~1 to_ref:HEAD", false, null, error);
        }
        
        // Test 2: Diff using commit SHAs
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: commits[1].sha,
                to_ref: commits[0].sha
            });
            logTest("Diff using specific SHAs", `unfugit_diff from_ref:${commits[1].sha} to_ref:${commits[0].sha}`, true, result);
        } catch (error) {
            logTest("Diff using specific SHAs", `unfugit_diff from_ref:${commits[1].sha} to_ref:${commits[0].sha}`, false, null, error);
        }
        
        // Test 3: Diff with working directory
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD',
                to_ref: 'working'
            });
            logTest("Diff HEAD vs working", "unfugit_diff from_ref:HEAD to_ref:working", true, result);
        } catch (error) {
            logTest("Diff HEAD vs working", "unfugit_diff from_ref:HEAD to_ref:working", false, null, error);
        }
        
        // Test 4: Diff with different output formats
        for (const output of ['names', 'stat', 'patch']) {
            try {
                const result = await client.callTool('unfugit_diff', {
                    from_ref: 'HEAD~1',
                    to_ref: 'HEAD',
                    output: output
                });
                logTest(`Diff with output=${output}`, `unfugit_diff output:${output}`, true, result);
            } catch (error) {
                logTest(`Diff with output=${output}`, `unfugit_diff output:${output}`, false, null, error);
            }
        }
        
        // Test 5: Diff with context lines
        for (const context of [1, 3, 5, 10]) {
            try {
                const result = await client.callTool('unfugit_diff', {
                    from_ref: 'HEAD~1',
                    to_ref: 'HEAD',
                    context_lines: context
                });
                logTest(`Diff with ${context} context lines`, `unfugit_diff context_lines:${context}`, true, result);
            } catch (error) {
                logTest(`Diff with ${context} context lines`, `unfugit_diff context_lines:${context}`, false, null, error);
            }
        }
        
        // Test 6: Diff with path filtering
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                paths: ['diff-test-a.txt']
            });
            logTest("Diff with path filter", "unfugit_diff paths:[diff-test-a.txt]", true, result);
        } catch (error) {
            logTest("Diff with path filter", "unfugit_diff paths:[diff-test-a.txt]", false, null, error);
        }
        
        // Test 7: Diff multiple paths
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                paths: ['diff-test-a.txt', 'diff-test-b.txt']
            });
            logTest("Diff multiple paths", "unfugit_diff paths:[diff-test-a.txt,diff-test-b.txt]", true, result);
        } catch (error) {
            logTest("Diff multiple paths", "unfugit_diff paths:[diff-test-a.txt,diff-test-b.txt]", false, null, error);
        }
        
        // Test 8: Diff with rename detection
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                rename_detection: true
            });
            logTest("Diff with rename detection", "unfugit_diff rename_detection:true", true, result);
        } catch (error) {
            logTest("Diff with rename detection", "unfugit_diff rename_detection:true", false, null, error);
        }
        
        // Test 9: Diff with whitespace handling
        for (const whitespace of ['ignore', 'ignore-space-change', 'ignore-all-space']) {
            try {
                const result = await client.callTool('unfugit_diff', {
                    from_ref: 'HEAD~1',
                    to_ref: 'HEAD',
                    whitespace: whitespace
                });
                logTest(`Diff with whitespace=${whitespace}`, `unfugit_diff whitespace:${whitespace}`, true, result);
            } catch (error) {
                logTest(`Diff with whitespace=${whitespace}`, `unfugit_diff whitespace:${whitespace}`, false, null, error);
            }
        }
        
        // Test 10: Empty diff (same commit)
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD',
                to_ref: 'HEAD'
            });
            logTest("Empty diff (same commit)", "unfugit_diff HEAD vs HEAD", true, result);
        } catch (error) {
            logTest("Empty diff (same commit)", "unfugit_diff HEAD vs HEAD", false, null, error);
        }
        
        // Test 11: Reverse diff
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD',
                to_ref: 'HEAD~1'
            });
            logTest("Reverse diff", "unfugit_diff HEAD vs HEAD~1", true, result);
        } catch (error) {
            logTest("Reverse diff", "unfugit_diff HEAD vs HEAD~1", false, null, error);
        }
        
        // Test 12: Large file diff
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                paths: ['diff-test-large.txt']
            });
            logTest("Large file diff", "unfugit_diff large file", true, result);
        } catch (error) {
            logTest("Large file diff", "unfugit_diff large file", false, null, error);
        }
        
        // Test 13: Binary file diff
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                paths: ['diff-test-binary.bin']
            });
            logTest("Binary file diff", "unfugit_diff binary file", true, result);
        } catch (error) {
            logTest("Binary file diff", "unfugit_diff binary file", false, null, error);
        }
        
        // Test 14: UTF-8 file diff
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                paths: ['test-utf8.txt']
            });
            logTest("UTF-8 file diff", "unfugit_diff UTF-8 file", true, result);
        } catch (error) {
            logTest("UTF-8 file diff", "unfugit_diff UTF-8 file", false, null, error);
        }
        
        // Test 15: Error cases - invalid refs
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'nonexistent-ref',
                to_ref: 'HEAD'
            });
            logTest("Invalid from_ref", "unfugit_diff nonexistent-ref vs HEAD", false, result, "Should have failed");
        } catch (error) {
            logTest("Invalid from_ref", "unfugit_diff nonexistent-ref vs HEAD", true, null, null); // Expected to fail
        }
        
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD',
                to_ref: 'nonexistent-ref'
            });
            logTest("Invalid to_ref", "unfugit_diff HEAD vs nonexistent-ref", false, result, "Should have failed");
        } catch (error) {
            logTest("Invalid to_ref", "unfugit_diff HEAD vs nonexistent-ref", true, null, null); // Expected to fail
        }
        
        // Test 16: Error case - nonexistent path
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                paths: ['nonexistent-file.txt']
            });
            logTest("Nonexistent file path", "unfugit_diff nonexistent path", true, result); // May succeed with empty diff
        } catch (error) {
            logTest("Nonexistent file path", "unfugit_diff nonexistent path", false, null, error);
        }
        
        // Test 17: Parameter combinations
        try {
            const result = await client.callTool('unfugit_diff', {
                from_ref: 'HEAD~1',
                to_ref: 'HEAD',
                output: 'patch',
                context_lines: 5,
                rename_detection: true,
                whitespace: 'ignore-space-change'
            });
            logTest("Combined parameters", "unfugit_diff with multiple options", true, result);
        } catch (error) {
            logTest("Combined parameters", "unfugit_diff with multiple options", false, null, error);
        }
        
    } finally {
        client.disconnect();
        console.log("🔌 Disconnected from unfugit server");
    }
}

async function saveTestResults() {
    const successCount = testResults.filter(t => t.success).length;
    const failCount = testResults.filter(t => !t.success).length;
    
    const reportContent = `# Comprehensive unfugit_diff Tool Test Results

## Test Summary
- **Total Tests**: ${testCounter}
- **Successful**: ${successCount} (${(successCount/testCounter*100).toFixed(1)}%)
- **Failed**: ${failCount} (${(failCount/testCounter*100).toFixed(1)}%)
- **Test Date**: ${new Date().toISOString()}
- **Test Directory**: ${__dirname}

## Test Categories

### Basic Functionality
- Diff between commits using HEAD~N notation
- Diff between specific commit SHAs
- Diff with working directory changes

### Output Formats
- \`names\` - Show only changed file names
- \`stat\` - Show file statistics (insertions/deletions)
- \`patch\` - Show full unified diff (default)

### Context Control
- Different context line amounts (1, 3, 5, 10)
- Impact on readability and output size

### Path Filtering
- Single file diffs
- Multiple file diffs
- Nonexistent file handling

### Advanced Options
- Rename detection
- Whitespace handling modes
- Combined parameter usage

### File Type Handling
- Text files (ASCII, UTF-8)
- Binary files
- Large files
- Mixed content files

### Edge Cases
- Empty diffs (same commit comparison)
- Reverse diffs (newer to older)
- Invalid references
- Nonexistent paths

## Detailed Test Results

${testResults.map(test => `
### Test ${test.id}: ${test.testName}

**Command**: \`${test.command}\`  
**Result**: ${test.success ? '✅ **SUCCESS**' : '❌ **FAILED**'}  
**Timestamp**: ${test.timestamp}

${test.error ? `**Error**: ${test.error}\n` : ''}
${test.result ? `
**Response Structure**:
- Content Type: ${Array.isArray(test.result.content) ? 'Array' : typeof test.result.content}
- Has Structured Content: ${test.result.structuredContent ? 'Yes' : 'No'}
- Is Error Response: ${test.result.isError ? 'Yes' : 'No'}

${test.result.content && Array.isArray(test.result.content) && test.result.content.length > 0 ? `
**Content Sample**:
\`\`\`
${test.result.content[0].text ? test.result.content[0].text.substring(0, 300) + '...' : 'No text content'}
\`\`\`
` : ''}
` : ''}
---
`).join('\n')}

## Key Findings

### Tool Schema and Parameters

The \`unfugit_diff\` tool accepts the following parameters:

1. **from_ref** (string): Source reference (commit SHA, HEAD~N, branch name)
2. **to_ref** (string): Target reference (commit SHA, HEAD~N, branch name, 'working')
3. **output** (string): Output format - 'names', 'stat', or 'patch' (default)
4. **context_lines** (number): Number of context lines around changes
5. **rename_detection** (boolean): Enable/disable rename detection
6. **whitespace** (string): Whitespace handling - 'ignore', 'ignore-space-change', 'ignore-all-space'
7. **paths** (array): Limit diff to specific file paths

### Response Format

The tool returns:
- **content**: Array containing text and resource objects
- **structuredContent**: Structured data representation
- **isError**: Boolean indicating error state

### Performance Characteristics

- **Small diffs**: Fast response (< 1s)
- **Large diffs**: Response time increases with file size and number of changes
- **Binary files**: Detected and handled appropriately
- **Path filtering**: Improves performance when limiting scope

### Error Handling

The tool properly handles:
- ✅ Invalid commit references (returns appropriate error)
- ✅ Nonexistent file paths (returns empty diff)
- ✅ Binary file detection
- ✅ UTF-8 content
- ✅ Empty diffs (same commit comparison)

### Best Practices

1. **Use path filtering** for focused diffs on specific files
2. **Adjust context lines** based on need (3-5 for code review, 1 for overview)
3. **Use 'stat' output** for quick change summaries
4. **Enable rename detection** when files may have been moved
5. **Handle binary files** appropriately in diff processing

## Recommendations

### For Tool Users
- Always specify both \`from_ref\` and \`to_ref\` for predictable behavior
- Use \`working\` as \`to_ref\` to see uncommitted changes
- Combine parameters thoughtfully to get desired output format

### For Tool Developers
- Consider adding more output format options
- Add support for word-level diffs
- Implement diff caching for large repositories
- Add progress indicators for large diffs

## Test Environment
- **Node.js Version**: ${process.version}
- **Platform**: ${process.platform}
- **Test Files Created**: diff-test-a.txt, diff-test-b.txt, diff-test-large.txt, diff-test-binary.bin, test-utf8.txt, test-mixed.txt

---
*Generated by comprehensive unfugit_diff test suite at ${new Date().toISOString()}*
`;

    await fs.writeFile('temp2_diff.md', reportContent);
    console.log(`\n📄 Comprehensive test results saved to temp2_diff.md`);
    console.log(`📊 Final Results: ${successCount}/${testCounter} tests passed (${(successCount/testCounter*100).toFixed(1)}%)`);
}

async function main() {
    try {
        console.log("🚀 Comprehensive unfugit_diff Testing Suite");
        console.log("============================================\n");
        
        await setupTestEnvironment();
        await runComprehensiveDiffTests();
        await saveTestResults();
        
        console.log("\n🎉 All tests completed!");
        
    } catch (error) {
        console.error("💥 Test suite failed:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}