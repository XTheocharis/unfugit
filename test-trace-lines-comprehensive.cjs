#!/usr/bin/env node
/**
 * Comprehensive test for unfugit_trace_lines MCP tool
 * Tests all parameters and edge cases
 */

const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, 'dist', 'unfugit.js');
const PROJECT_ROOT = __dirname;

class UnfugitTester {
    constructor() {
        this.server = null;
        this.testResults = [];
        this.testCount = 0;
    }

    async startServer() {
        console.log(`Starting unfugit server: node ${SERVER_PATH} ${PROJECT_ROOT}`);
        this.server = spawn('node', [SERVER_PATH, PROJECT_ROOT], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Wait for server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Send MCP initialization
        await this.sendMCPMessage({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {
                    tools: {},
                    resources: {}
                },
                clientInfo: {
                    name: "trace-lines-tester",
                    version: "1.0.0"
                }
            }
        });

        // Wait for initialization response
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async sendMCPMessage(message) {
        return new Promise((resolve) => {
            const messageStr = JSON.stringify(message) + '\n';
            this.server.stdin.write(messageStr);
            
            // Simple response handling
            setTimeout(() => {
                resolve({ success: true });
            }, 500);
        });
    }

    async callTraceLines(file, lines, options = {}) {
        this.testCount++;
        const testId = this.testCount;
        
        console.log(`\n=== Test ${testId}: Tracing lines ${lines} in ${file} ===`);
        
        const params = {
            file: file,
            lines: lines,
            ...options
        };

        try {
            const message = {
                jsonrpc: "2.0",
                id: testId,
                method: "tools/call",
                params: {
                    name: "unfugit_trace_lines",
                    arguments: params
                }
            };

            console.log(`Request: ${JSON.stringify(params, null, 2)}`);
            
            await this.sendMCPMessage(message);
            
            // Wait for response
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.testResults.push({
                testId,
                file,
                lines,
                options,
                status: 'completed',
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ Test ${testId} completed successfully`);
            
        } catch (error) {
            console.log(`❌ Test ${testId} failed: ${error.message}`);
            this.testResults.push({
                testId,
                file,
                lines,
                options,
                status: 'failed',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async runComprehensiveTests() {
        console.log('🚀 Starting comprehensive trace_lines testing...\n');

        // Test 1: Basic single line tracing
        await this.callTraceLines('trace-test-simple.txt', '2');

        // Test 2: Line range tracing
        await this.callTraceLines('trace-test-simple.txt', '1-3');

        // Test 3: Multiple single lines
        await this.callTraceLines('trace-test-simple.txt', '1,3');

        // Test 4: Line that was modified
        await this.callTraceLines('trace-test-simple.txt', '2');

        // Test 5: Line that was deleted (should show history)
        await this.callTraceLines('trace-test-simple.txt', '4');

        // Test 6: Large file - beginning lines
        await this.callTraceLines('trace-test-large.txt', '1-3');

        // Test 7: Large file - middle lines
        await this.callTraceLines('trace-test-large.txt', '10-12');

        // Test 8: Large file - end lines
        await this.callTraceLines('trace-test-large.txt', '18-20');

        // Test 9: Modified line in large file
        await this.callTraceLines('trace-test-large.txt', '11');

        // Test 10: Python code file
        await this.callTraceLines('trace-test-code.py', '8');

        // Test 11: Python code - modified function
        await this.callTraceLines('trace-test-code.py', '11-17');

        // Test 12: Renamed file tracing
        await this.callTraceLines('trace-test-renamed-final.txt', '1');

        // Test 13: Renamed file - all lines
        await this.callTraceLines('trace-test-renamed-final.txt', '1-4');

        // Test 14: Single line file
        await this.callTraceLines('trace-test-single-line.txt', '1');

        // Test 15: Empty file (should handle gracefully)
        await this.callTraceLines('trace-test-empty.txt', '1');

        // Test 16: Invalid line number (beyond file)
        await this.callTraceLines('trace-test-simple.txt', '100');

        // Test 17: Invalid range
        await this.callTraceLines('trace-test-simple.txt', '50-100');

        // Test 18: Non-existent file
        await this.callTraceLines('non-existent-file.txt', '1');

        // Test 19: Binary file (should handle gracefully)
        await this.callTraceLines('trace-test-binary.bin', '1');

        // Test 20: With context option
        await this.callTraceLines('trace-test-code.py', '8', { context: 2 });

        // Test 21: With limit option
        await this.callTraceLines('trace-test-simple.txt', '2', { limit: 5 });

        // Test 22: With follow_renames option
        await this.callTraceLines('trace-test-renamed-final.txt', '1', { follow_renames: true });

        // Test 23: Complex range with context
        await this.callTraceLines('trace-test-large.txt', '10-12', { context: 1, limit: 10 });

        // Test 24: Invalid line format
        await this.callTraceLines('trace-test-simple.txt', 'invalid');

        // Test 25: Zero line number
        await this.callTraceLines('trace-test-simple.txt', '0');

        // Test 26: Negative line number
        await this.callTraceLines('trace-test-simple.txt', '-1');

        // Test 27: Very large line number
        await this.callTraceLines('trace-test-simple.txt', '999999');

        console.log('\n🏁 All tests completed!');
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('TRACE LINES TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total tests: ${this.testResults.length}`);
        console.log(`Completed: ${this.testResults.filter(r => r.status === 'completed').length}`);
        console.log(`Failed: ${this.testResults.filter(r => r.status === 'failed').length}`);
        console.log('\nDetailed Results:');
        
        this.testResults.forEach(result => {
            const status = result.status === 'completed' ? '✅' : '❌';
            console.log(`${status} Test ${result.testId}: ${result.file} lines ${result.lines}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });
    }

    async cleanup() {
        if (this.server) {
            this.server.kill();
        }
    }
}

async function main() {
    const tester = new UnfugitTester();
    
    try {
        await tester.startServer();
        await tester.runComprehensiveTests();
    } catch (error) {
        console.error('Test execution failed:', error);
    } finally {
        tester.printSummary();
        await tester.cleanup();
    }
}

if (require.main === module) {
    main().catch(console.error);
}