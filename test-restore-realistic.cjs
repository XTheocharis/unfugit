#!/usr/bin/env node

const { spawn } = require('child_process');

class UnfugitRestoreRealisticTester {
    constructor() {
        this.serverProcess = null;
        this.requestId = 0;
    }

    async startServer() {
        console.log('Starting unfugit server...');
        
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', ['dist/unfugit.js', '.'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.serverProcess.on('error', (err) => {
                console.error('Server error:', err);
                reject(err);
            });

            setTimeout(() => {
                console.log('Server started (PID:', this.serverProcess.pid, ')');
                resolve();
            }, 2000);
        });
    }

    async sendMcpRequest(method, params = {}) {
        const request = {
            jsonrpc: "2.0",
            id: ++this.requestId,
            method: method,
            params: params
        };

        return new Promise((resolve, reject) => {
            let responseData = '';

            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 15000);

            const onData = (data) => {
                responseData += data.toString();
                const lines = responseData.split('\n');
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const response = JSON.parse(line);
                            if (response.id === request.id) {
                                clearTimeout(timeout);
                                this.serverProcess.stdout.off('data', onData);
                                resolve(response);
                                return;
                            }
                        } catch (e) {
                            // Not JSON or not our response, continue
                        }
                    }
                }
            };

            this.serverProcess.stdout.on('data', onData);
            this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async initialize() {
        const initResponse = await this.sendMcpRequest('initialize', {
            protocolVersion: "2024-11-05",
            capabilities: { roots: { listChanged: true }, sampling: {} },
            clientInfo: { name: "unfugit-realistic-tester", version: "1.0.0" }
        });

        await this.sendMcpRequest('notifications/initialized');
        return initResponse;
    }

    async getRecentCommits() {
        const historyResponse = await this.sendMcpRequest('tools/call', {
            name: 'unfugit_history',
            arguments: { limit: 5, include_stats: true }
        });

        if (historyResponse.result && historyResponse.result.content) {
            const commits = historyResponse.result.content[0].text;
            const commitMatches = commits.match(/([a-f0-9]{8}) - Audit:/g);
            return commitMatches ? commitMatches.map(m => m.split(' ')[0]).slice(0, 3) : [];
        }
        return [];
    }

    async testRestorePreview(testName, params) {
        console.log(`\n=== ${testName} ===`);
        console.log('Parameters:', JSON.stringify(params, null, 2));
        
        try {
            const response = await this.sendMcpRequest('tools/call', {
                name: 'unfugit_restore_preview',
                arguments: params
            });

            console.log('Response Summary:');
            if (response.result) {
                const content = response.result.content[0].text;
                console.log('  Preview:', content);
                
                if (response.result.structuredContent) {
                    const impact = response.result.structuredContent.impact;
                    console.log('  Impact Summary:');
                    console.log('    Will modify:', impact.will_modify.length, 'files');
                    console.log('    Will create:', impact.will_create.length, 'files');
                    console.log('    Will delete:', impact.will_delete.length, 'files');
                    
                    if (impact.will_modify.length > 0) {
                        console.log('    Files to modify:', impact.will_modify);
                    }
                    if (impact.will_create.length > 0) {
                        console.log('    Files to create:', impact.will_create);
                    }
                    if (impact.will_delete.length > 0) {
                        console.log('    Files to delete:', impact.will_delete);
                    }

                    const token = response.result.structuredContent.confirm_token;
                    if (token) {
                        console.log('    Preview Token:', token.substring(0, 12) + '...');
                    }
                }

                // Show resource details if available
                if (response.result.content.length > 1) {
                    console.log('  Resources provided:');
                    response.result.content.slice(1).forEach((resource, i) => {
                        if (resource.type === 'resource') {
                            console.log(`    ${i+1}. ${resource.resource.uri} (${resource.resource.mimeType})`);
                        }
                    });
                }

                return response.result;
            } else if (response.error) {
                console.log('  Error:', response.error.message);
                return null;
            }
        } catch (error) {
            console.log('  Exception:', error.message);
            return null;
        }
    }

    async runRealisticTests() {
        console.log('\n🚀 Running Realistic unfugit_restore_preview Tests\n');
        
        await this.startServer();
        await this.initialize();
        
        // Give unfugit some time to detect and commit our test files
        console.log('Waiting for unfugit to process file changes...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const commitHashes = await this.getRecentCommits();
        console.log('Available commit hashes:', commitHashes);

        if (commitHashes.length === 0) {
            console.log('⚠️ No commits found, using HEAD references');
            commitHashes.push('HEAD~1', 'HEAD~2', 'HEAD~3');
        }

        const recentCommit = commitHashes[0];
        const olderCommit = commitHashes[1] || 'HEAD~2';

        // Test 1: Preview restoring a modified file
        await this.testRestorePreview('Test 1: Restore modified file to previous version', {
            commit: recentCommit,
            paths: ['test-restore-example.txt']
        });

        // Test 2: Preview restoring multiple modified files
        await this.testRestorePreview('Test 2: Restore multiple files', {
            commit: recentCommit,
            paths: ['test-restore-example.txt', 'test-restore-another.txt']
        });

        // Test 3: Preview entire commit restore
        await this.testRestorePreview('Test 3: Restore entire commit', {
            commit: recentCommit
        });

        // Test 4: Preview from older commit
        await this.testRestorePreview('Test 4: Restore from older commit', {
            commit: olderCommit,
            paths: ['test-restore-example.txt']
        });

        // Test 5: Preview directory restore
        await this.testRestorePreview('Test 5: Restore directory contents', {
            commit: recentCommit,
            paths: ['restore-test-dir/']
        });

        // Test 6: Preview with glob-like patterns (if supported)
        await this.testRestorePreview('Test 6: Restore with pattern', {
            commit: recentCommit,
            paths: ['test-restore-*.txt']
        });

        // Test 7: Mixed existing and non-existing files
        await this.testRestorePreview('Test 7: Mixed existing/non-existing files', {
            commit: recentCommit,
            paths: ['test-restore-example.txt', 'non-existent-file.txt', 'README.md']
        });

        // Test 8: Test safety with current working directory state
        console.log('\n=== Creating temporary file to test safety checks ===');
        require('fs').writeFileSync('temp-unsafe-file.txt', 'This file should trigger safety warnings');
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Let unfugit detect it
        
        await this.testRestorePreview('Test 8: Safety check with uncommitted changes', {
            commit: 'HEAD~1',
            paths: ['temp-unsafe-file.txt']
        });

        // Test 9: Preview token persistence across multiple calls
        console.log('\n=== Testing Preview Token Behavior ===');
        
        const result1 = await this.testRestorePreview('Test 9a: First preview call', {
            commit: recentCommit,
            paths: ['test-restore-example.txt']
        });

        const result2 = await this.testRestorePreview('Test 9b: Second preview call (same params)', {
            commit: recentCommit,
            paths: ['test-restore-example.txt']
        });

        if (result1 && result2 && 
            result1.structuredContent && result2.structuredContent) {
            const token1 = result1.structuredContent.confirm_token;
            const token2 = result2.structuredContent.confirm_token;
            
            console.log('    Token comparison:');
            console.log('      First call token:  ', token1 ? token1.substring(0, 16) + '...' : 'none');
            console.log('      Second call token: ', token2 ? token2.substring(0, 16) + '...' : 'none');
            console.log('      Tokens different?  ', token1 !== token2);
        }

        // Test 10: Error handling for invalid states
        await this.testRestorePreview('Test 10: Invalid commit hash', {
            commit: 'invalid123hash',
            paths: ['test-restore-example.txt']
        });

        console.log('\n🏁 Realistic tests completed!\n');
    }

    async cleanup() {
        // Clean up test files
        try {
            require('fs').unlinkSync('temp-unsafe-file.txt');
        } catch (e) { /* ignore */ }

        if (this.serverProcess) {
            console.log('\nShutting down server...');
            this.serverProcess.kill('SIGTERM');
            
            return new Promise((resolve) => {
                this.serverProcess.on('exit', () => {
                    console.log('Server shut down complete');
                    resolve();
                });
                
                setTimeout(() => {
                    if (!this.serverProcess.killed) {
                        this.serverProcess.kill('SIGKILL');
                    }
                    resolve();
                }, 3000);
            });
        }
    }
}

async function main() {
    const tester = new UnfugitRestoreRealisticTester();
    
    try {
        await tester.runRealisticTests();
    } catch (error) {
        console.error('\n💥 Fatal error during testing:', error);
    } finally {
        await tester.cleanup();
        process.exit(0);
    }
}

if (require.main === module) {
    main().catch(console.error);
}