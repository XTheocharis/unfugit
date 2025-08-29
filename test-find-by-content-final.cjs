#!/usr/bin/env node

/**
 * Final comprehensive test for unfugit_find_by_content MCP tool
 * Using correct parameter names: term, regex, ignoreCase, limit, paths
 */

const { spawn } = require('child_process');
const fs = require('fs');

// Test results will be written to this file
const OUTPUT_FILE = './temp2_find_by_content.md';

class UnfugitFinalTester {
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
                            try {
                                const data = JSON.parse(content.text);
                                this.log(`Found ${data.commits ? data.commits.length : 0} commits`);
                                
                                this.results.push(`**Result**: SUCCESS - Found ${data.commits ? data.commits.length : 0} commits`);
                                if (data.commits && data.commits.length > 0) {
                                    this.results.push('\n**Found commits:**');
                                    data.commits.slice(0, 5).forEach((commit, idx) => {
                                        this.results.push(`- ${idx + 1}. ${commit.hash ? commit.hash.substring(0, 8) : 'unknown'} - ${commit.message || 'No message'}`);
                                        if (commit.files && commit.files.length > 0) {
                                            commit.files.forEach(file => {
                                                this.results.push(`  - ${file.path} (${file.status || 'unknown'})`);
                                            });
                                        }
                                    });
                                    if (data.commits.length > 5) {
                                        this.results.push(`  ... and ${data.commits.length - 5} more commits`);
                                    }
                                } else {
                                    this.results.push('**No commits found for this search term.**');
                                }
                                this.results.push('');
                            } catch (parseError) {
                                this.results.push(`**Result**: SUCCESS - Raw response: ${content.text}`);
                                this.results.push('');
                            }
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

    async runAllTests() {
        this.log('Starting comprehensive unfugit_find_by_content testing...');
        
        // Start with initialization
        await this.sendMCPRequest('initialize', {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" }
        });

        // Test 1: Basic string search for common content
        await this.testFindByContent('Basic search for "test"', {
            term: 'test'
        });

        // Test 2: Search for function names
        await this.testFindByContent('Search for function keyword', {
            term: 'function'
        });

        // Test 3: Search for console statements
        await this.testFindByContent('Search for "console"', {
            term: 'console'
        });

        // Test 4: Case-sensitive search
        await this.testFindByContent('Case-sensitive search for "Test"', {
            term: 'Test',
            ignoreCase: false
        });

        // Test 5: Case-insensitive search
        await this.testFindByContent('Case-insensitive search for "TEST"', {
            term: 'TEST',
            ignoreCase: true
        });

        // Test 6: Search with limit
        await this.testFindByContent('Search with limit=3', {
            term: 'test',
            limit: 3
        });

        // Test 7: Search with very small limit
        await this.testFindByContent('Search with limit=1', {
            term: 'test',
            limit: 1
        });

        // Test 8: Search with path filter
        await this.testFindByContent('Search in .txt files only', {
            term: 'test',
            paths: ['*.txt']
        });

        // Test 9: Search with multiple paths
        await this.testFindByContent('Search in multiple file types', {
            term: 'test',
            paths: ['*.txt', '*.js']
        });

        // Test 10: Search for special characters
        await this.testFindByContent('Search for @ symbol', {
            term: '@'
        });

        // Test 11: Search for special character patterns
        await this.testFindByContent('Search for special chars "#$%"', {
            term: '#$%'
        });

        // Test 12: Search for quoted strings
        await this.testFindByContent('Search for quoted content', {
            term: '"hello'
        });

        // Test 13: Search for JSON patterns
        await this.testFindByContent('Search for JSON bracket', {
            term: '{'
        });

        // Test 14: Search for programming keywords
        await this.testFindByContent('Search for "const" keyword', {
            term: 'const'
        });

        // Test 15: Search for "import" statements
        await this.testFindByContent('Search for import statements', {
            term: 'import'
        });

        // Test 16: Search for file extensions
        await this.testFindByContent('Search for ".js" extension', {
            term: '.js'
        });

        // Test 17: Search for numbers
        await this.testFindByContent('Search for number "123"', {
            term: '123'
        });

        // Test 18: Search for whitespace patterns
        await this.testFindByContent('Search for newline chars', {
            term: '\\n'
        });

        // Test 19: Search with regex flag (basic pattern)
        await this.testFindByContent('Regex search for test.*file', {
            term: 'test.*file',
            regex: true
        });

        // Test 20: Search with regex and case insensitive
        await this.testFindByContent('Regex + case insensitive', {
            term: 'TEST.*FILE',
            regex: true,
            ignoreCase: true
        });

        // Test 21: Search for URL patterns
        await this.testFindByContent('Search for "http" (URLs)', {
            term: 'http'
        });

        // Test 22: Search for email patterns
        await this.testFindByContent('Search for email @ patterns', {
            term: '@'
        });

        // Test 23: Search for long strings
        await this.testFindByContent('Long search string', {
            term: 'This is a very long string that probably wont be found but we need to test long content'
        });

        // Test 24: Search for unicode characters
        await this.testFindByContent('Search for unicode characters', {
            term: 'файл'
        });

        // Test 25: Search for Chinese characters
        await this.testFindByContent('Search for Chinese characters', {
            term: '测试'
        });

        // Test 26: Search for git-specific content
        await this.testFindByContent('Search for "commit" (git term)', {
            term: 'commit'
        });

        // Test 27: Search for common file content
        await this.testFindByContent('Search for "hello"', {
            term: 'hello'
        });

        // Test 28: Search for "world"
        await this.testFindByContent('Search for "world"', {
            term: 'world'
        });

        // Test 29: Empty search term (should error)
        await this.testFindByContent('Empty search term', {
            term: ''
        }, 'error');

        // Test 30: Search with all parameters
        await this.testFindByContent('All parameters test', {
            term: 'test',
            regex: false,
            ignoreCase: true,
            limit: 2,
            paths: ['*.txt']
        });

        // Test 31: Invalid regex pattern
        await this.testFindByContent('Invalid regex pattern', {
            term: '[unclosed',
            regex: true
        }, 'error');

        // Test 32: Complex regex pattern
        await this.testFindByContent('Complex regex pattern', {
            term: '\\b(test|hello)\\b',
            regex: true
        });

        // Test 33: Search in specific directory paths
        await this.testFindByContent('Search in specific directories', {
            term: 'test',
            paths: ['test*', 'src/*']
        });

        // Test 34: Zero limit (edge case)
        await this.testFindByContent('Zero limit test', {
            term: 'test',
            limit: 0
        });

        // Test 35: Very high limit
        await this.testFindByContent('High limit test', {
            term: 'test',
            limit: 100
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
The \`unfugit_find_by_content\` tool performs pickaxe search (git log -S or git log -G) to find commits where specific content was added or removed. This is particularly useful for:

- Finding when specific functions, classes, or variables were introduced
- Tracking when specific strings or patterns were added/removed
- Identifying commits that modified particular code sections
- Debugging when certain content disappeared from the codebase

### Parameters:
- \`term\` (required string): The text/pattern to search for in commit diffs
- \`regex\` (optional boolean, default: false): Whether to treat term as a regex pattern
- \`ignoreCase\` (optional boolean, default: false): Whether to ignore case when searching
- \`limit\` (optional number, default: 10): Maximum number of commits to return
- \`paths\` (optional array of strings): Glob patterns to limit search to specific files/directories

## Detailed Test Results

`;

        const content = header + this.results.join('\n') + '\n\n## Tool Usage Examples\n\n### Basic Usage:\n```json\n{\n  "term": "function myFunction"\n}\n```\n\n### Advanced Usage:\n```json\n{\n  "term": "console\\\\.log",\n  "regex": true,\n  "ignoreCase": true,\n  "limit": 5,\n  "paths": ["*.js", "src/**"]\n}\n```\n\n### Common Search Patterns:\n- Function definitions: `"function myFunc"` or `"def my_func"`\n- Class definitions: `"class MyClass"` \n- Variable declarations: `"const myVar"` or `"var myVar"`\n- Import statements: `"import.*from"`\n- Specific strings: `"TODO"` or `"FIXME"`\n- Configuration changes: `"database"` or `"api_key"`\n';
        
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
    const tester = new UnfugitFinalTester();
    
    try {
        await tester.startServer();
        await tester.runAllTests();
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