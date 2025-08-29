#!/usr/bin/env node

const { spawn } = require('child_process');

// Direct MCP communication test
async function testDirectMCP() {
    console.log("🔍 Testing direct MCP communication with unfugit_diff\n");
    
    const server = spawn('node', ['dist/unfugit.js', '.'], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let allOutput = '';
    
    server.stdout.on('data', (data) => {
        allOutput += data.toString();
        console.log('📤 Server output:', data.toString().trim());
    });
    
    server.stderr.on('data', (data) => {
        console.log('⚠️  Server stderr:', data.toString().trim());
    });
    
    server.on('close', (code) => {
        console.log(`\n🏁 Server process exited with code ${code}`);
        console.log('\n📋 Full output analysis:');
        
        const lines = allOutput.split('\n').filter(line => line.trim());
        lines.forEach((line, index) => {
            try {
                const parsed = JSON.parse(line);
                console.log(`${index + 1}. ${parsed.method || 'Response'}: ${JSON.stringify(parsed).substring(0, 100)}...`);
            } catch (e) {
                console.log(`${index + 1}. Raw: ${line.substring(0, 100)}...`);
            }
        });
    });
    
    // Wait for initialization
    setTimeout(() => {
        console.log('\n📨 Sending unfugit_diff request...');
        
        const request = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "unfugit_diff",
                arguments: {
                    base: "HEAD~1",
                    head: "HEAD"
                }
            }
        };
        
        server.stdin.write(JSON.stringify(request) + '\n');
        
        // Give it time to respond
        setTimeout(() => {
            console.log('\n🔚 Closing server...');
            server.kill();
        }, 3000);
        
    }, 2000);
}

// Also test with git commands to see if there are actual differences
async function testGitDiff() {
    console.log("\n🔧 Testing git diff directly to verify changes exist:\n");
    
    const { execSync } = require('child_process');
    
    try {
        console.log("📋 Git log (last 3 commits):");
        const log = execSync('git log --oneline -3', { encoding: 'utf8' });
        console.log(log);
        
        console.log("📋 Git status:");
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        console.log(status || '(working directory clean)');
        
        console.log("📋 Git diff HEAD~1..HEAD:");
        const diff = execSync('git diff HEAD~1..HEAD', { encoding: 'utf8' });
        console.log(diff || '(no differences)');
        
        console.log("📋 Git diff --name-only HEAD~1..HEAD:");
        const names = execSync('git diff --name-only HEAD~1..HEAD', { encoding: 'utf8' });
        console.log(names || '(no changed files)');
        
        console.log("📋 Git diff --stat HEAD~1..HEAD:");
        const stat = execSync('git diff --stat HEAD~1..HEAD', { encoding: 'utf8' });
        console.log(stat || '(no statistics)');
        
    } catch (error) {
        console.error("Git command failed:", error.message);
    }
}

async function main() {
    await testGitDiff();
    await testDirectMCP();
}

main().catch(console.error);