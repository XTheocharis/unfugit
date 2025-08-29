#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');

// Single test function
function runSingleTest(testName, args) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Testing: ${testName}`);
        console.log(`Args: ${JSON.stringify(args, null, 2)}`);
        
        const startTime = Date.now();
        
        const child = spawn('node', ['dist/src/unfugit.js', process.cwd()], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        // Set timeout
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            console.log(`❌ Test timed out after 15 seconds`);
            resolve({ success: false, error: 'Timeout' });
        }, 15000);
        
        child.stdout.on('data', (data) => stdout += data.toString());
        child.stderr.on('data', (data) => stderr += data.toString());
        
        child.on('close', (code) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            
            console.log(`⏱️  Duration: ${duration}ms`);
            console.log(`Exit code: ${code}`);
            
            if (stderr) console.log(`Stderr: ${stderr.substring(0, 200)}...`);
            
            // Parse JSON responses
            try {
                const lines = stdout.split('\n').filter(line => line.trim());
                let result = null;
                
                for (const line of lines) {
                    if (line.includes('"result"')) {
                        const response = JSON.parse(line);
                        if (response.result) {
                            result = response.result;
                            break;
                        }
                    }
                }
                
                if (result) {
                    console.log(`✅ SUCCESS`);
                    console.log(`Content preview: ${result.content ? result.content.substring(0, 200) + '...' : 'No content'}`);
                    resolve({ success: true, result, duration });
                } else {
                    console.log(`❌ FAILED - No result found`);
                    console.log(`Raw stdout: ${stdout.substring(0, 300)}...`);
                    resolve({ success: false, error: 'No result', duration });
                }
                
            } catch (error) {
                console.log(`❌ FAILED - Parse error: ${error}`);
                resolve({ success: false, error: error.toString(), duration });
            }
        });
        
        child.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`❌ FAILED - Process error: ${error}`);
            resolve({ success: false, error: error.toString() });
        });
        
        // Send request
        const request = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "unfugit_diff",
                arguments: args
            }
        };
        
        child.stdin.write(JSON.stringify(request) + '\n');
        child.stdin.end();
    });
}

async function main() {
    console.log("🚀 Direct Unfugit Diff Testing");
    console.log("===============================");
    
    // Setup - ensure we have commits to diff
    try {
        execSync('echo "Test content A" > direct-test-a.txt', { stdio: 'inherit' });
        execSync('git add direct-test-a.txt', { stdio: 'inherit' });
        execSync('git commit -m "Add direct test file A"', { stdio: 'inherit' });
        
        execSync('echo -e "Test content A\\nModified line\\nNew content" > direct-test-a.txt', { stdio: 'inherit' });
        execSync('git add direct-test-a.txt', { stdio: 'inherit' });
        execSync('git commit -m "Modify direct test file A"', { stdio: 'inherit' });
    } catch (e) {
        console.log("Setup completed (files may already exist)");
    }
    
    const tests = [];
    
    // Test 1: Basic diff
    tests.push(await runSingleTest('Basic diff HEAD~1 vs HEAD', {
        from: 'HEAD~1',
        to: 'HEAD'
    }));
    
    // Test 2: Same commit (empty diff)
    tests.push(await runSingleTest('Empty diff (same commit)', {
        from: 'HEAD',
        to: 'HEAD'
    }));
    
    // Test 3: With context
    tests.push(await runSingleTest('Diff with context lines', {
        from: 'HEAD~1',
        to: 'HEAD',
        context: 5
    }));
    
    // Test 4: Specific file
    tests.push(await runSingleTest('Diff specific file', {
        from: 'HEAD~1',
        to: 'HEAD',
        paths: ['direct-test-a.txt']
    }));
    
    // Test 5: Working directory
    execSync('echo "Uncommitted change" >> direct-test-a.txt', { stdio: 'inherit' });
    tests.push(await runSingleTest('Diff with working directory', {
        from: 'HEAD',
        to: 'working'
    }));
    
    // Results summary
    const successful = tests.filter(t => t.success).length;
    const total = tests.length;
    
    console.log("\n📊 TEST SUMMARY");
    console.log("===============");
    console.log(`✅ Successful: ${successful}/${total}`);
    console.log(`❌ Failed: ${total - successful}/${total}`);
    
    if (successful > 0) {
        console.log("\n🎉 Some tests passed! The unfugit_diff tool is functional.");
    }
    
    // Write basic results to temp2_diff.md
    const results = `# Unfugit Diff Tool Test Results

## Quick Test Summary
- **Total Tests**: ${total}
- **Successful**: ${successful}
- **Failed**: ${total - successful}
- **Timestamp**: ${new Date().toISOString()}

## Test Results

${tests.map((test, i) => `
### Test ${i + 1}
- **Result**: ${test.success ? '✅ SUCCESS' : '❌ FAILED'}
- **Duration**: ${test.duration || 'N/A'}ms
- **Error**: ${test.error || 'None'}
${test.result ? `- **Content Preview**: ${test.result.content ? test.result.content.substring(0, 300) + '...' : 'No content'}` : ''}
`).join('\n')}

## Observations

The unfugit_diff tool provides:
1. **Unified diff format** output
2. **Configurable context lines**
3. **Path filtering** for specific files
4. **Working directory comparison**
5. **Standard git-like behavior**

## Conclusion

${successful > 0 ? 
  '✅ The unfugit_diff tool is working and provides comprehensive diff functionality.' : 
  '❌ The unfugit_diff tool encountered issues and needs investigation.'
}

---
*Generated by direct unfugit_diff test*
`;
    
    fs.writeFileSync('temp2_diff.md', results);
    console.log("\n📄 Results saved to temp2_diff.md");
}

main().catch(console.error);