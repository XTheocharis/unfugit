#!/usr/bin/env node

/**
 * Direct test for unfugit_find_by_content MCP tool using stdio communication
 */

const { spawn } = require('child_process');
const fs = require('fs');

// Test results will be written to this file
const OUTPUT_FILE = './temp2_find_by_content.md';

class UnfugitDirectTester {
    constructor() {
        this.results = [];
        this.testCount = 0;
        this.passCount = 0;
        this.failCount = 0;
        this.serverProcess = null;
        this.messageId = 1;
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        console.log(logMessage);
        this.results.push(logMessage);
    }

    async startServer() {
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', ['dist/unfugit.js', '.'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let startupBuffer = '';
            const startupTimeout = setTimeout(() => {
                reject(new Error('Server startup timeout'));
            }, 10000);

            this.serverProcess.stderr.on('data', (data) => {
                startupBuffer += data.toString();
                if (startupBuffer.includes('MCP server running on stdio')) {
                    clearTimeout(startupTimeout);
                    this.log('Server started successfully');
                    resolve();
                }
            });

            this.serverProcess.on('error', (error) => {
                clearTimeout(startupTimeout);
                reject(error);
            });
        });
    }

    async sendMCPRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
            const request = {
                jsonrpc: "2.0",
                id: this.messageId++,
                method: method,
                params: params
            };

            const requestStr = JSON.stringify(request) + '\n';
            
            let responseBuffer = '';
            const responseTimeout = setTimeout(() => {
                reject(new Error(`Request timeout for ${method}`));
            }, 30000);

            const onData = (data) => {
                responseBuffer += data.toString();
                const lines = responseBuffer.split('\n');
                
                for (let i = 0; i < lines.length - 1; i++) {
                    const line = lines[i].trim();
                    if (line && line.startsWith('{')) {
                        try {
                            const response = JSON.parse(line);
                            if (response.id === request.id) {
                                clearTimeout(responseTimeout);
                                this.serverProcess.stdout.removeListener('data', onData);
                                resolve(response);
                                return;
                            }
                        } catch (e) {
                            // Continue parsing other lines
                        }
                    }
                }
                
                // Keep the last incomplete line
                responseBuffer = lines[lines.length - 1];
            };

            this.serverProcess.stdout.on('data', onData);
            this.serverProcess.stdin.write(requestStr);
        });
    }

    async testFindByContent(testName, args, expectedOutcome = 'success') {
        this.testCount++;
        this.log(`\n=== TEST ${this.testCount}: ${testName} ===`);
        this.log(`Arguments: ${JSON.stringify(args, null, 2)}`);

        try {
            const response = await this.sendMCPRequest('tools/call', {
                name: 'unfugit_find_by_content',
                arguments: args
            });

            if (response.error) {
                if (expectedOutcome === 'error') {
                    this.log(`✅ Expected error received: ${response.error.message}`, 'PASS');
                    this.passCount++;
                    this.results.push(`**Result**: Expected error - ${response.error.message}\n`);
                } else {
                    this.log(`❌ Unexpected error: ${response.error.message}`, 'FAIL');
                    this.failCount++;
                    this.results.push(`**Result**: FAILED - ${response.error.message}\n`);
                }
            } else {
                if (expectedOutcome === 'error') {
                    this.log(`❌ Expected error but got success`, 'FAIL');
                    this.failCount++;
                    this.results.push(`**Result**: FAILED - Expected error but got success\n`);
                } else {
                    this.log(`✅ Success`, 'PASS');
                    this.passCount++;
                    
                    const result = response.result;
                    if (result && result.content) {
                        const content = Array.isArray(result.content) ? result.content[0] : result.content;
                        if (content && content.text) {
                            const data = JSON.parse(content.text);
                            this.log(`Found ${data.commits ? data.commits.length : 0} commits`);
                            
                            this.results.push(`**Result**: SUCCESS - Found ${data.commits ? data.commits.length : 0} commits`);
                            if (data.commits && data.commits.length > 0) {
                                this.results.push('\n**Found commits:**');
                                data.commits.slice(0, 3).forEach((commit, idx) => {
                                    this.results.push(`- ${idx + 1}. ${commit.hash.substring(0, 8)} - ${commit.message}`);
                                    if (commit.files) {
                                        commit.files.forEach(file => {
                                            this.results.push(`  - ${file.path} (${file.status})`);
                                        });
                                    }
                                });
                                if (data.commits.length > 3) {
                                    this.results.push(`  ... and ${data.commits.length - 3} more commits`);
                                }
                            }
                            this.results.push('');
                        }
                    }
                }
            }
        } catch (error) {
            this.log(`❌ Test execution failed: ${error.message}`, 'FAIL');
            this.failCount++;
            this.results.push(`**Result**: FAILED - Test execution error: ${error.message}\n`);
        }
    }

    async runCoreTests() {
        this.log('Starting unfugit_find_by_content testing...');
        
        // Start with initialization
        await this.sendMCPRequest('initialize', {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" }
        });

        // Test 1: Basic string search
        await this.testFindByContent('Basic search for "test"', {
            search_string: 'test'
        });

        // Test 2: Search for function names
        await this.testFindByContent('Search for "console"', {
            search_string: 'console'
        });

        // Test 3: Search with case sensitivity
        await this.testFindByContent('Case-sensitive search for "Test"', {
            search_string: 'Test',
            ignore_case: false
        });

        // Test 4: Case-insensitive search
        await this.testFindByContent('Case-insensitive search for "TEST"', {
            search_string: 'TEST',
            ignore_case: true
        });

        // Test 5: Search with limit
        await this.testFindByContent('Search with limit=3', {
            search_string: 'test',
            limit: 3
        });

        // Test 6: Search with path filter
        await this.testFindByContent('Search in .txt files', {
            search_string: 'test',
            path_filter: '*.txt'
        });

        // Test 7: Search for special characters
        await this.testFindByContent('Search for special chars "@"', {
            search_string: '@'
        });

        // Test 8: Empty search string (should error)
        await this.testFindByContent('Empty search string', {
            search_string: ''
        }, 'error');

        // Test 9: Search for long string
        await this.testFindByContent('Long search string', {
            search_string: 'This is a very long string to test'
        });

        // Test 10: Search for quotes
        await this.testFindByContent('Search with quotes', {
            search_string: '"hello world"'
        });

        // Test 11: Search for numbers
        await this.testFindByContent('Search for numbers', {
            search_string: '123'
        });

        // Test 12: Search for JSON patterns
        await this.testFindByContent('Search for JSON bracket', {
            search_string: '{'
        });

        // Test 13: Search for programming keywords
        await this.testFindByContent('Search for "const"', {
            search_string: 'const'
        });

        // Test 14: Search for file extensions
        await this.testFindByContent('Search for ".js"', {
            search_string: '.js'
        });

        // Test 15: Search with all parameters
        await this.testFindByContent('All parameters test', {
            search_string: 'test',
            path_filter: '*.txt',
            ignore_case: true,
            limit: 2
        });

        this.log('\n=== TEST SUMMARY ===');
        this.log(`Total tests: ${this.testCount}`);
        this.log(`Passed: ${this.passCount}`);
        this.log(`Failed: ${this.failCount}`);
        this.log(`Success rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%`);
    }

    async writeResults() {
        const header = `# Comprehensive unfugit_find_by_content Tool Test Results

Generated: ${new Date().toISOString()}

## Test Summary
- **Total tests**: ${this.testCount}
- **Passed**: ${this.passCount}
- **Failed**: ${this.failCount}
- **Success rate**: ${((this.passCount / this.testCount) * 100).toFixed(1)}%

## Tool Description
The \`unfugit_find_by_content\` tool performs pickaxe search (git log -S) to find commits where specific content was added or removed. This is useful for tracking when specific strings, functions, or patterns were introduced or deleted from the codebase.

### Parameters:
- \`search_string\` (required): The text to search for in commit diffs
- \`ignore_case\` (optional): Whether to ignore case when searching (default: false)
- \`path_filter\` (optional): Glob pattern to limit search to specific files (e.g., "*.js", "src/**")
- \`limit\` (optional): Maximum number of commits to return

## Detailed Test Results

`;

        const content = header + this.results.join('\n');
        fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
        this.log(`\nResults written to ${OUTPUT_FILE}`);
    }

    async cleanup() {
        if (this.serverProcess) {
            this.serverProcess.kill();
        }
    }
}

async function main() {
    const tester = new UnfugitDirectTester();
    
    try {
        await tester.startServer();
        await tester.runCoreTests();
        await tester.writeResults();
    } catch (error) {
        console.error('Test suite failed:', error);
        process.exit(1);
    } finally {
        await tester.cleanup();
    }
}

if (require.main === module) {
    main().catch(console.error);
}