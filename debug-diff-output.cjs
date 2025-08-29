#!/usr/bin/env node

const { spawn } = require('child_process');

console.log("🔍 Debug: Let's see the raw output from unfugit_diff");

const child = spawn('node', ['dist/src/unfugit.js', process.cwd()], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => stdout += data.toString());
child.stderr.on('data', (data) => stderr += data.toString());

child.on('close', (code) => {
    console.log("=== STDOUT ===");
    console.log(stdout);
    console.log("\n=== STDERR ===");
    console.log(stderr);
    console.log("\n=== PARSED LINES ===");
    
    const lines = stdout.split('\n');
    lines.forEach((line, i) => {
        if (line.trim()) {
            console.log(`Line ${i}: ${line}`);
            if (line.includes('"result"')) {
                try {
                    const parsed = JSON.parse(line);
                    console.log(`  -> Parsed result type: ${typeof parsed.result}`);
                    console.log(`  -> Result keys: ${Object.keys(parsed.result || {})}`);
                    console.log(`  -> Result content: ${JSON.stringify(parsed.result, null, 2)}`);
                } catch (e) {
                    console.log(`  -> Parse error: ${e}`);
                }
            }
        }
    });
});

// Send a simple diff request
const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
        name: "unfugit_diff",
        arguments: {
            from: 'HEAD~1',
            to: 'HEAD'
        }
    }
};

setTimeout(() => child.kill('SIGKILL'), 10000); // Kill after 10 seconds

child.stdin.write(JSON.stringify(request) + '\n');
child.stdin.end();