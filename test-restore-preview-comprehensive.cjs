#!/usr/bin/env node

const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

class UnfugitRestorePreviewTester {
    constructor() {
        this.serverProcess = null;
        this.requestId = 0;
        this.results = {
            successful: [],
            failed: [],
            preview_tokens: [],
            safety_checks: []
        };
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

            // Wait a bit for server to start
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
            let errorData = '';

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
                                this.serverProcess.stderr.off('data', onError);
                                resolve(response);
                                return;
                            }
                        } catch (e) {
                            // Not JSON or not our response, continue
                        }
                    }
                }
            };

            const onError = (data) => {
                errorData += data.toString();
            };

            this.serverProcess.stdout.on('data', onData);
            this.serverProcess.stderr.on('data', onError);

            // Send request
            this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async initialize() {
        console.log('Initializing MCP session...');
        
        const initResponse = await this.sendMcpRequest('initialize', {
            protocolVersion: "2024-11-05",
            capabilities: {
                roots: { listChanged: true },
                sampling: {}
            },
            clientInfo: {
                name: "unfugit-restore-preview-tester",
                version: "1.0.0"
            }
        });

        console.log('Init response:', JSON.stringify(initResponse, null, 2));

        // Send initialized notification
        const initializedResponse = await this.sendMcpRequest('notifications/initialized');
        console.log('Initialized notification sent');

        return initResponse;
    }

    async getCommitHistory() {
        console.log('\n=== Getting commit history for test data ===');
        
        try {
            const historyResponse = await this.sendMcpRequest('tools/call', {
                name: 'unfugit_history',
                arguments: {
                    limit: 20,
                    include_stats: true
                }
            });

            if (historyResponse.result && historyResponse.result.content) {
                const commits = historyResponse.result.content[0].text;
                console.log('Recent commits available:', commits.substring(0, 500) + '...');
                
                // Parse commit hashes for testing
                const commitMatches = commits.match(/commit ([a-f0-9]{40})/g);
                const commitHashes = commitMatches ? commitMatches.map(m => m.split(' ')[1]).slice(0, 10) : [];
                
                console.log('Found commit hashes for testing:', commitHashes.slice(0, 5));
                return commitHashes;
            }
        } catch (error) {
            console.error('Error getting commit history:', error);
        }
        
        return [];
    }

    async testRestorePreview(testName, params) {
        console.log(`\n=== Testing: ${testName} ===`);
        console.log('Parameters:', JSON.stringify(params, null, 2));
        
        try {
            const response = await this.sendMcpRequest('tools/call', {
                name: 'unfugit_restore_preview',
                arguments: params
            });

            console.log('Response:', JSON.stringify(response, null, 2));

            if (response.result) {
                this.results.successful.push({
                    test: testName,
                    params: params,
                    response: response.result
                });

                // Extract preview token if present
                if (response.result.content && response.result.content[0] && response.result.content[0].text) {
                    const text = response.result.content[0].text;
                    const tokenMatch = text.match(/Preview Token: ([a-f0-9-]+)/);
                    if (tokenMatch) {
                        this.results.preview_tokens.push({
                            test: testName,
                            token: tokenMatch[1]
                        });
                        console.log('✓ Preview token extracted:', tokenMatch[1]);
                    }

                    // Check for safety warnings
                    if (text.includes('⚠️') || text.includes('WARNING') || text.includes('CAUTION')) {
                        this.results.safety_checks.push({
                            test: testName,
                            warning: text.match(/⚠️[^\\n]*/g) || text.match(/WARNING[^\\n]*/g) || []
                        });
                        console.log('⚠️ Safety warning detected');
                    }
                }

                console.log('✅ Test passed');
                return response.result;
            } else if (response.error) {
                this.results.failed.push({
                    test: testName,
                    params: params,
                    error: response.error
                });
                console.log('❌ Test failed with error:', response.error.message);
                return null;
            }
        } catch (error) {
            this.results.failed.push({
                test: testName,
                params: params,
                error: { message: error.message, stack: error.stack }
            });
            console.log('❌ Test failed with exception:', error.message);
            return null;
        }
    }

    async runAllTests() {
        console.log('\n🚀 Starting Comprehensive unfugit_restore_preview Tests\n');
        
        await this.startServer();
        await this.initialize();
        
        const commitHashes = await this.getCommitHistory();
        const validCommit = commitHashes[0] || 'HEAD~1';
        const olderCommit = commitHashes[3] || 'HEAD~5';

        // Test 1: Preview restoring a single file from recent commit
        await this.testRestorePreview('1. Single file from recent commit', {
            commit: validCommit,
            paths: ['diff-test-a.txt']
        });

        // Test 2: Preview restoring multiple files
        await this.testRestorePreview('2. Multiple files from commit', {
            commit: validCommit,
            paths: ['diff-test-a.txt', 'diff-test-file1.txt']
        });

        // Test 3: Preview restoring entire commit (no paths)
        await this.testRestorePreview('3. Entire commit restore', {
            commit: validCommit
        });

        // Test 4: Preview restoring file that exists currently
        await this.testRestorePreview('4. File that exists currently', {
            commit: validCommit,
            paths: ['README.md']
        });

        // Test 5: Preview restoring file that doesn't exist currently
        await this.testRestorePreview('5. File that does not exist currently', {
            commit: validCommit,
            paths: ['nonexistent-file.txt']
        });

        // Test 6: Preview restoring binary file
        await this.testRestorePreview('6. Binary file restore', {
            commit: validCommit,
            paths: ['test-binary.bin']
        });

        // Test 7: Preview restoring from subdirectory
        await this.testRestorePreview('7. File in subdirectory', {
            commit: validCommit,
            paths: ['subdir/test-sub.txt']
        });

        // Test 8: Preview restoring with directory path
        await this.testRestorePreview('8. Directory path', {
            commit: validCommit,
            paths: ['subdir/']
        });

        // Test 9: Preview restoring deleted file
        await this.testRestorePreview('9. Deleted file restore', {
            commit: olderCommit,
            paths: ['some-deleted-file.txt']
        });

        // Test 10: Preview with invalid commit ref
        await this.testRestorePreview('10. Invalid commit ref', {
            commit: 'invalid-commit-hash',
            paths: ['README.md']
        });

        // Test 11: Preview with non-existent file in valid commit
        await this.testRestorePreview('11. Non-existent file in valid commit', {
            commit: validCommit,
            paths: ['totally-fake-file.xyz']
        });

        // Test 12: Preview with empty paths array
        await this.testRestorePreview('12. Empty paths array', {
            commit: validCommit,
            paths: []
        });

        // Test 13: Preview with special characters in file name
        await this.testRestorePreview('13. Special characters in filename', {
            commit: validCommit,
            paths: ['test@#$%^&()_+.txt']
        });

        // Test 14: Preview with file containing spaces
        await this.testRestorePreview('14. File with spaces', {
            commit: validCommit,
            paths: ['test file with spaces.txt']
        });

        // Test 15: Preview with UTF-8 filename
        await this.testRestorePreview('15. UTF-8 filename', {
            commit: validCommit,
            paths: ['test-файл-测试.txt']
        });

        // Test 16: Preview multiple commits operations
        console.log('\\n=== Testing Multiple Preview Operations ===');
        
        for (let i = 0; i < 3; i++) {
            await this.testRestorePreview(`16.${i+1}. Multiple preview operation ${i+1}`, {
                commit: commitHashes[i] || 'HEAD~' + i,
                paths: ['README.md']
            });
        }

        // Test 17: Test with very old commit reference
        await this.testRestorePreview('17. Very old commit reference', {
            commit: 'HEAD~50',
            paths: ['README.md']
        });

        // Test 18: Test with HEAD reference
        await this.testRestorePreview('18. HEAD reference', {
            commit: 'HEAD',
            paths: ['CLAUDE.md']
        });

        // Test 19: Test with branch reference
        await this.testRestorePreview('19. Branch reference', {
            commit: 'main',
            paths: ['package.json']
        });

        // Test 20: Test with relative path
        await this.testRestorePreview('20. Relative path in subdirectory', {
            commit: validCommit,
            paths: ['./subdir/../README.md']
        });

        console.log('\\n🏁 All tests completed!\\n');
    }

    generateReport() {
        console.log('\\n📊 TEST RESULTS SUMMARY\\n');
        console.log('=' .repeat(80));
        
        console.log(`\\n✅ SUCCESSFUL TESTS: ${this.results.successful.length}`);
        this.results.successful.forEach((test, i) => {
            console.log(`  ${i+1}. ${test.test}`);
        });

        console.log(`\\n❌ FAILED TESTS: ${this.results.failed.length}`);
        this.results.failed.forEach((test, i) => {
            console.log(`  ${i+1}. ${test.test} - ${test.error.message}`);
        });

        console.log(`\\n🔑 PREVIEW TOKENS GENERATED: ${this.results.preview_tokens.length}`);
        this.results.preview_tokens.forEach((token, i) => {
            console.log(`  ${i+1}. ${token.test} - ${token.token.substring(0, 16)}...`);
        });

        console.log(`\\n⚠️  SAFETY CHECKS TRIGGERED: ${this.results.safety_checks.length}`);
        this.results.safety_checks.forEach((check, i) => {
            console.log(`  ${i+1}. ${check.test}`);
            check.warning.forEach(w => console.log(`      ${w}`));
        });

        return {
            total: this.results.successful.length + this.results.failed.length,
            successful: this.results.successful.length,
            failed: this.results.failed.length,
            preview_tokens: this.results.preview_tokens.length,
            safety_checks: this.results.safety_checks.length,
            details: this.results
        };
    }

    async cleanup() {
        if (this.serverProcess) {
            console.log('\\nShutting down server...');
            this.serverProcess.kill('SIGTERM');
            
            // Wait for graceful shutdown
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
                }, 5000);
            });
        }
    }
}

// Main execution
async function main() {
    const tester = new UnfugitRestorePreviewTester();
    
    try {
        await tester.runAllTests();
        const report = tester.generateReport();
        
        // Write detailed results to file
        const fs = require('fs');
        const detailedReport = {
            timestamp: new Date().toISOString(),
            summary: {
                total_tests: report.total,
                successful: report.successful,
                failed: report.failed,
                preview_tokens_generated: report.preview_tokens,
                safety_checks_triggered: report.safety_checks
            },
            test_results: report.details
        };
        
        fs.writeFileSync('restore_preview_test_results.json', JSON.stringify(detailedReport, null, 2));
        console.log('\\n📄 Detailed results written to restore_preview_test_results.json');
        
    } catch (error) {
        console.error('\\n💥 Fatal error during testing:', error);
    } finally {
        await tester.cleanup();
        process.exit(0);
    }
}

if (require.main === module) {
    main().catch(console.error);
}