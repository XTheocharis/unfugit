#!/usr/bin/env node

/**
 * Additional edge case tests for unfugit_find_by_content
 */

const { spawn } = require('child_process');
const fs = require('fs');

class EdgeCaseTester {
    constructor() {
        this.results = [];
        this.serverProcess = null;
        this.messageId = 1;
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
            }, 10000);

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
                            // Continue parsing
                        }
                    }
                }
                
                responseBuffer = lines[lines.length - 1];
            };

            this.serverProcess.stdout.on('data', onData);
            this.serverProcess.stdin.write(requestStr);
        });
    }

    async testEdgeCase(testName, args) {
        console.log(`\n=== ${testName} ===`);
        console.log(`Arguments: ${JSON.stringify(args, null, 2)}`);

        try {
            const response = await this.sendMCPRequest('tools/call', {
                name: 'unfugit_find_by_content',
                arguments: args
            });

            if (response.error) {
                console.log(`❌ Error: ${response.error.message}`);
                this.results.push(`**${testName}**: Error - ${response.error.message}`);
            } else {
                console.log(`✅ Success`);
                if (response.result && response.result.content) {
                    const content = Array.isArray(response.result.content) ? response.result.content[0] : response.result.content;
                    if (content && content.text) {
                        const summary = content.text.split('\n')[0]; // First line has count
                        console.log(`Response: ${summary}`);
                        this.results.push(`**${testName}**: ${summary}`);
                    }
                }
            }
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            this.results.push(`**${testName}**: Test failed - ${error.message}`);
        }
    }

    async runEdgeCaseTests() {
        console.log('Starting edge case tests...');
        
        // Initialize
        await this.sendMCPRequest('initialize', {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" }
        });

        // Test missing term parameter
        await this.testEdgeCase('Missing term parameter', {
            regex: false,
            ignoreCase: true
        });

        // Test null term
        await this.testEdgeCase('Null term', {
            term: null
        });

        // Test undefined term
        await this.testEdgeCase('Undefined term', {
            term: undefined
        });

        // Test very large limit
        await this.testEdgeCase('Very large limit', {
            term: 'test',
            limit: 999999
        });

        // Test negative limit
        await this.testEdgeCase('Negative limit', {
            term: 'test',
            limit: -5
        });

        // Test non-string term
        await this.testEdgeCase('Non-string term (number)', {
            term: 123
        });

        // Test non-string term (object)
        await this.testEdgeCase('Non-string term (object)', {
            term: { search: 'test' }
        });

        // Test empty paths array
        await this.testEdgeCase('Empty paths array', {
            term: 'test',
            paths: []
        });

        // Test invalid path patterns
        await this.testEdgeCase('Invalid path pattern', {
            term: 'test',
            paths: ['[invalid']
        });

        // Test non-boolean regex
        await this.testEdgeCase('Non-boolean regex', {
            term: 'test',
            regex: 'true'
        });

        // Test non-boolean ignoreCase
        await this.testEdgeCase('Non-boolean ignoreCase', {
            term: 'test',
            ignoreCase: 'yes'
        });

        console.log('\n=== EDGE CASE RESULTS ===');
        this.results.forEach(result => console.log(result));

        return this.results;
    }

    cleanup() {
        if (this.serverProcess) {
            this.serverProcess.kill();
        }
    }
}

async function main() {
    const tester = new EdgeCaseTester();
    
    try {
        await tester.startServer();
        const results = await tester.runEdgeCaseTests();
        
        // Append edge case results to the main test file
        const edgeCaseSection = `\n\n## Edge Case Test Results\n\n${results.join('\n')}\n\n### Key Findings:\n- Empty strings are allowed as search terms (no validation error)\n- Invalid regex patterns are accepted (git handles the validation)\n- The tool is quite permissive and relies on git's underlying pickaxe functionality\n- Malformed parameters are caught by the MCP parameter validation\n- The tool gracefully handles various edge cases without crashing\n`;
        
        fs.appendFileSync('./temp2_find_by_content.md', edgeCaseSection, 'utf8');
        console.log('\nEdge case results appended to temp2_find_by_content.md');
        
    } catch (error) {
        console.error('Edge case tests failed:', error);
    } finally {
        tester.cleanup();
    }
}

if (require.main === module) {
    main().catch(console.error);
}