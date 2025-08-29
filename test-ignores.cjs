#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Log file for all test results
const logFile = path.join(__dirname, 'temp2_ignores.md');

function logTest(message) {
    console.log(message);
    fs.appendFileSync(logFile, message + '\n');
}

function sendMCPRequest(server, request) {
    return new Promise((resolve, reject) => {
        let responseData = '';
        let errorData = '';
        
        const timeout = setTimeout(() => {
            server.kill();
            reject(new Error('Request timeout'));
        }, 10000);
        
        server.stdout.on('data', (data) => {
            responseData += data.toString();
        });
        
        server.stderr.on('data', (data) => {
            errorData += data.toString();
        });
        
        server.on('close', (code) => {
            clearTimeout(timeout);
            try {
                // Parse JSON responses
                const lines = responseData.trim().split('\n');
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.result) {
                            resolve(response.result);
                            return;
                        }
                    } catch (e) {
                        // Continue parsing
                    }
                }
                reject(new Error(`No valid response found. stdout: ${responseData}, stderr: ${errorData}`));
            } catch (error) {
                reject(error);
            }
        });
        
        server.stdin.write(JSON.stringify(request) + '\n');
        server.stdin.end();
    });
}

async function testIgnores() {
    logTest('\n## Starting Comprehensive unfugit_ignores Tests\n');
    
    // Test 1: List current ignore patterns
    logTest('### Test 1: List Current Ignore Patterns');
    try {
        const server1 = spawn('node', ['dist/src/unfugit.js', '.'], { cwd: __dirname });
        const request1 = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "unfugit_ignores",
                arguments: { action: "list" }
            }
        };
        
        const result1 = await sendMCPRequest(server1, request1);
        logTest(`**Command:** unfugit_ignores with action=list`);
        logTest(`**Result:** ${JSON.stringify(result1, null, 2)}`);
        logTest('');
    } catch (error) {
        logTest(`**Error:** ${error.message}`);
        logTest('');
    }
    
    // Test 2: Add new ignore patterns
    logTest('### Test 2: Add New Ignore Patterns');
    const testPatterns = [
        '*.tmp',
        '*.log',
        'temp/',
        'build/*',
        'node_modules/',
        '**/.DS_Store',
        '*.bak',
        'cache/**'
    ];
    
    for (const pattern of testPatterns) {
        try {
            const server = spawn('node', ['dist/src/unfugit.js', '.'], { cwd: __dirname });
            const request = {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {
                    name: "unfugit_ignores",
                    arguments: { 
                        action: "add",
                        patterns: [pattern]
                    }
                }
            };
            
            const result = await sendMCPRequest(server, request);
            logTest(`**Command:** Add pattern '${pattern}'`);
            logTest(`**Result:** ${JSON.stringify(result, null, 2)}`);
        } catch (error) {
            logTest(`**Error adding '${pattern}':** ${error.message}`);
        }
    }
    logTest('');
    
    // Test 3: List patterns after additions
    logTest('### Test 3: List Patterns After Additions');
    try {
        const server = spawn('node', ['dist/src/unfugit.js', '.'], { cwd: __dirname });
        const request = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "unfugit_ignores",
                arguments: { action: "list" }
            }
        };
        
        const result = await sendMCPRequest(server, request);
        logTest(`**Command:** List all patterns after additions`);
        logTest(`**Result:** ${JSON.stringify(result, null, 2)}`);
        logTest('');
    } catch (error) {
        logTest(`**Error:** ${error.message}`);
        logTest('');
    }
    
    logTest('### Comprehensive Test Complete - Check temp2_ignores.md for full results');
}

// Run the tests
testIgnores().catch(console.error);