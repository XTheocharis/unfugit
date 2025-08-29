#!/usr/bin/env node
/**
 * Direct test of unfugit_trace_lines MCP tool
 * Tests the actual parameters based on the schema
 */

const { spawn } = require('child_process');
const path = require('path');

async function testTraceLinesDirect() {
    console.log('🔍 Testing unfugit_trace_lines with correct parameters...');
    
    const tests = [
        {
            name: "Test 1: Single line trace",
            params: { path: "trace-test-simple.txt", start_line: 2 }
        },
        {
            name: "Test 2: Line range trace",
            params: { path: "trace-test-simple.txt", start_line: 1, end_line: 3 }
        },
        {
            name: "Test 3: Modified line in code file",
            params: { path: "trace-test-code.py", start_line: 11, end_line: 15 }
        },
        {
            name: "Test 4: Deleted line trace",
            params: { path: "trace-test-simple.txt", start_line: 4 }
        },
        {
            name: "Test 5: Large file middle lines",
            params: { path: "trace-test-large.txt", start_line: 10, end_line: 12 }
        },
        {
            name: "Test 6: Renamed file trace",
            params: { path: "trace-test-renamed-final.txt", start_line: 1 }
        },
        {
            name: "Test 7: Single line file",
            params: { path: "trace-test-single-line.txt", start_line: 1 }
        },
        {
            name: "Test 8: Empty file",
            params: { path: "trace-test-empty.txt", start_line: 1 }
        },
        {
            name: "Test 9: Non-existent file",
            params: { path: "non-existent.txt", start_line: 1 }
        },
        {
            name: "Test 10: Binary file",
            params: { path: "trace-test-binary.bin", start_line: 1 }
        },
        {
            name: "Test 11: Invalid line number (too high)",
            params: { path: "trace-test-simple.txt", start_line: 100 }
        },
        {
            name: "Test 12: Zero line number",
            params: { path: "trace-test-simple.txt", start_line: 0 }
        },
        {
            name: "Test 13: With limit",
            params: { path: "trace-test-simple.txt", start_line: 2, limit: 5 }
        },
        {
            name: "Test 14: With offset",
            params: { path: "trace-test-simple.txt", start_line: 2, offset: 1 }
        },
        {
            name: "Test 15: Large range",
            params: { path: "trace-test-large.txt", start_line: 1, end_line: 20 }
        }
    ];
    
    const results = [];
    
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        console.log(`\n${test.name}`);
        console.log(`Parameters: ${JSON.stringify(test.params)}`);
        
        try {
            const server = spawn('node', ['dist/unfugit.js', '.'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let output = '';
            let error = '';
            
            server.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            server.stderr.on('data', (data) => {
                error += data.toString();
            });
            
            // Wait for server startup
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Send the test
            const message = {
                jsonrpc: "2.0",
                id: i + 1,
                method: "tools/call",
                params: {
                    name: "unfugit_trace_lines",
                    arguments: test.params
                }
            };
            
            server.stdin.write(JSON.stringify(message) + '\n');
            
            // Wait for response
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            server.kill();
            
            // Extract JSON responses
            const jsonResponses = [];
            const lines = output.split('\n');
            for (const line of lines) {
                if (line.trim() && line.startsWith('{')) {
                    try {
                        const json = JSON.parse(line);
                        if (json.id === i + 1) {
                            jsonResponses.push(json);
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
            
            const result = {
                test: test.name,
                params: test.params,
                success: jsonResponses.length > 0,
                response: jsonResponses[0] || null,
                error: error ? error.split('\n')[0] : null
            };
            
            results.push(result);
            
            if (result.success && result.response?.result) {
                console.log('✅ SUCCESS');
                if (result.response.result.content) {
                    const content = result.response.result.content[0]?.text || '';
                    console.log(`Response (first 200 chars): ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
                }
            } else if (result.response?.error) {
                console.log('❌ ERROR:', result.response.error.message);
            } else {
                console.log('⚠️  UNKNOWN RESULT');
            }
            
        } catch (e) {
            console.log('❌ EXCEPTION:', e.message);
            results.push({
                test: test.name,
                params: test.params,
                success: false,
                error: e.message
            });
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    
    const successful = results.filter(r => r.success).length;
    console.log(`Total Tests: ${results.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${results.length - successful}`);
    console.log(`Success Rate: ${((successful / results.length) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    results.forEach((result, i) => {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${result.test}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    });
    
    return results;
}

// Run the test
testTraceLinesDirect().catch(console.error);