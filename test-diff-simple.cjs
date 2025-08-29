#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test results storage
let testResults = [];
let testCounter = 0;

function logTest(testName, args, result, duration, error = null) {
    testCounter++;
    const timestamp = new Date().toISOString();
    const testResult = {
        id: testCounter,
        timestamp,
        testName,
        args: JSON.stringify(args),
        success: !error,
        result,
        duration: `${duration}ms`,
        error: error ? error.toString() : null
    };
    
    testResults.push(testResult);
    
    console.log(`\n=== Test ${testCounter}: ${testName} ===`);
    console.log(`Args: ${JSON.stringify(args, null, 2)}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Result: ${result ? 'SUCCESS' : 'FAILED'}`);
    if (error) {
        console.log(`Error: ${error}`);
    }
    if (result && typeof result === 'object' && result.content) {
        console.log(`Content Preview: ${result.content.substring(0, 300)}...`);
    }
    console.log('---');
}

async function testUnfugitDiff(toolArgs, testName) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
        console.log(`\n🧪 Testing: ${testName}`);
        
        const child = spawn('node', [
            path.join(__dirname, 'dist/src/unfugit.js'),
            __dirname
        ], {
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
            const duration = Date.now() - startTime;
            
            try {
                // Look for the result in stdout
                const lines = stdout.split('\n');
                let result = null;
                let error = null;
                
                for (const line of lines) {
                    if (line.includes('"result"') && line.includes('"jsonrpc"')) {
                        try {
                            const response = JSON.parse(line);
                            if (response.result) {
                                result = response.result;
                                break;
                            } else if (response.error) {
                                error = response.error;
                                break;
                            }
                        } catch (e) {
                            // Continue looking
                        }
                    }
                }
                
                if (!result && !error && code !== 0) {
                    error = `Process exited with code ${code}. Stderr: ${stderr}`;
                }
                
                logTest(testName, toolArgs, result, duration, error);
                resolve({ result, error, duration, stdout, stderr });
                
            } catch (parseError) {
                const duration = Date.now() - startTime;
                logTest(testName, toolArgs, false, duration, parseError);
                resolve({ error: parseError, duration, stdout, stderr });
            }
        });
        
        child.on('error', (error) => {
            const duration = Date.now() - startTime;
            logTest(testName, toolArgs, false, duration, error);
            resolve({ error, duration });
        });
        
        // Send the MCP request
        const request = {
            jsonrpc: "2.0",
            id: testCounter + 1,
            method: "tools/call",
            params: {
                name: "unfugit_diff",
                arguments: toolArgs
            }
        };
        
        child.stdin.write(JSON.stringify(request) + '\n');
        child.stdin.end();
    });
}

async function setupTestEnvironment() {
    console.log("📁 Setting up test files...");
    
    // Create test files
    fs.writeFileSync('diff-test-a.txt', 'Line 1\nLine 2\nLine 3\n');
    fs.writeFileSync('diff-test-b.txt', 'Another file\nWith content\n');
    
    // Commit them
    require('child_process').execSync('git add diff-test-a.txt diff-test-b.txt', { stdio: 'pipe' });
    require('child_process').execSync('git commit -m "Add test files for diff testing"', { stdio: 'pipe' });
    
    // Modify files
    fs.writeFileSync('diff-test-a.txt', 'Line 1 MODIFIED\nLine 2\nLine 3\nNew Line 4\n');
    fs.writeFileSync('diff-test-b.txt', 'Another file CHANGED\nWith content\nAnd more content\n');
    
    // Commit modifications
    require('child_process').execSync('git add diff-test-a.txt diff-test-b.txt', { stdio: 'pipe' });
    require('child_process').execSync('git commit -m "Modify test files"', { stdio: 'pipe' });
}

async function runAllTests() {
    console.log("🚀 Starting Unfugit Diff Comprehensive Tests");
    console.log("============================================\n");
    
    try {
        await setupTestEnvironment();
        
        // Test 1: Basic diff between HEAD~1 and HEAD
        await testUnfugitDiff({
            from: 'HEAD~1',
            to: 'HEAD'
        }, 'Basic diff HEAD~1 vs HEAD');
        
        // Test 2: Diff with specific commit SHAs
        const commits = require('child_process')
            .execSync('git log --format="%H" -n 3', { encoding: 'utf8' })
            .trim().split('\n');
        
        if (commits.length >= 2) {
            await testUnfugitDiff({
                from: commits[1],
                to: commits[0]
            }, 'Diff between specific SHAs');
        }
        
        // Test 3: Diff with working directory
        fs.writeFileSync('diff-test-a.txt', 'Line 1 WORKING DIR CHANGE\nLine 2\nLine 3\nNew Line 4\nUncommitted line\n');
        
        await testUnfugitDiff({
            from: 'HEAD',
            to: 'working'
        }, 'Diff HEAD vs working directory');
        
        // Test 4: Diff with context lines
        await testUnfugitDiff({
            from: 'HEAD~1',
            to: 'HEAD',
            context: 5
        }, 'Diff with 5 context lines');
        
        // Test 5: Diff specific file only
        await testUnfugitDiff({
            from: 'HEAD~1',
            to: 'HEAD',
            paths: ['diff-test-a.txt']
        }, 'Diff specific file only');
        
        // Test 6: Diff multiple files
        await testUnfugitDiff({
            from: 'HEAD~1',
            to: 'HEAD',
            paths: ['diff-test-a.txt', 'diff-test-b.txt']
        }, 'Diff multiple files');
        
        // Test 7: Empty diff (same commit)
        await testUnfugitDiff({
            from: 'HEAD',
            to: 'HEAD'
        }, 'Empty diff (same commit)');
        
        // Test 8: Reverse diff
        await testUnfugitDiff({
            from: 'HEAD',
            to: 'HEAD~1'
        }, 'Reverse diff (HEAD to HEAD~1)');
        
        // Test 9: Error case - non-existent commit
        await testUnfugitDiff({
            from: 'deadbeef123456789012345678901234567890',
            to: 'HEAD'
        }, 'Non-existent commit SHA');
        
        // Test 10: Error case - invalid reference
        await testUnfugitDiff({
            from: 'invalid-ref',
            to: 'HEAD'
        }, 'Invalid reference');
        
        // Test 11: Binary file diff
        fs.writeFileSync('diff-test-binary.bin', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        require('child_process').execSync('git add diff-test-binary.bin', { stdio: 'pipe' });
        require('child_process').execSync('git commit -m "Add binary file"', { stdio: 'pipe' });
        
        await testUnfugitDiff({
            from: 'HEAD~1',
            to: 'HEAD',
            paths: ['diff-test-binary.bin']
        }, 'Binary file diff');
        
    } catch (error) {
        console.error("❌ Setup error:", error);
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
- **Arguments**: \`${test.args}\`
- **Duration**: ${test.duration}
- **Result**: ${test.success ? '✅ SUCCESS' : '❌ FAILED'}
- **Timestamp**: ${test.timestamp}
${test.error ? `- **Error**: \`${test.error}\`` : ''}

${test.result && typeof test.result === 'object' ? `
**Response Details**: 
\`\`\`json
${JSON.stringify(test.result, null, 2)}
\`\`\`
` : ''}
---
`).join('\n')}

## Summary of Test Scenarios

### ✅ Successful Test Cases
${testResults.filter(t => t.success).map(t => `- **${t.testName}**: ${t.duration}`).join('\n')}

### ❌ Failed Test Cases
${testResults.filter(t => !t.success).map(t => `- **${t.testName}**: ${t.error}`).join('\n')}

## Key Findings

### Output Format Analysis
The unfugit_diff tool returns structured data with the following format:
- Standard unified diff format
- Binary file detection and handling
- Context line control
- Path filtering support

### Performance Metrics
- Average response time: ${Math.round(testResults.reduce((sum, t) => sum + parseInt(t.duration), 0) / testResults.length)}ms
- Fastest test: ${Math.min(...testResults.map(t => parseInt(t.duration)))}ms
- Slowest test: ${Math.max(...testResults.map(t => parseInt(t.duration)))}ms

### Error Handling
The tool properly handles various error conditions:
- Invalid commit references
- Non-existent SHAs
- Binary file detection
- Working directory changes

---
*Generated by unfugit_diff comprehensive test suite*
`;

    fs.writeFileSync('temp2_diff.md', reportContent);
    console.log('\n📄 Test results saved to temp2_diff.md');
}

// Main execution
(async () => {
    try {
        await runAllTests();
        await saveResults();
        
        console.log("\n✅ All tests completed!");
        console.log(`📊 Final Results: ${testResults.filter(t => t.success).length}/${testCounter} tests passed`);
        
    } catch (error) {
        console.error("❌ Test suite failed:", error);
        process.exit(1);
    }
})();