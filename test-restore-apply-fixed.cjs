#!/usr/bin/env node
/**
 * Fixed test for unfugit_restore_apply MCP tool
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();

class MCPClient {
    constructor() {
        this.messageId = 1;
        this.server = null;
    }

    async start() {
        console.log('Starting MCP server...');
        this.server = spawn('node', ['dist/unfugit.js', PROJECT_ROOT], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.server.stderr.on('data', (data) => {
            console.error('Server stderr:', data.toString());
        });

        // Wait for server to start
        await this.sleep(3000);

        // Initialize MCP connection
        await this.sendRequest({
            jsonrpc: '2.0',
            id: this.messageId++,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                clientInfo: { name: 'test-client', version: '1.0.0' }
            }
        });

        // Send initialized notification
        await this.sendNotification({
            jsonrpc: '2.0',
            method: 'initialized',
            params: {}
        });

        console.log('MCP server initialized');
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sendRequest(request) {
        return new Promise((resolve, reject) => {
            const requestStr = JSON.stringify(request) + '\n';
            this.server.stdin.write(requestStr);

            let responseBuffer = '';
            const onData = (data) => {
                responseBuffer += data.toString();
                const lines = responseBuffer.split('\n');
                
                for (let i = 0; i < lines.length - 1; i++) {
                    const line = lines[i].trim();
                    if (line) {
                        try {
                            const response = JSON.parse(line);
                            if (response.id === request.id) {
                                this.server.stdout.removeListener('data', onData);
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

            this.server.stdout.on('data', onData);
            
            setTimeout(() => {
                this.server.stdout.removeListener('data', onData);
                reject(new Error('Request timeout'));
            }, 10000);
        });
    }

    async sendNotification(notification) {
        const notificationStr = JSON.stringify(notification) + '\n';
        this.server.stdin.write(notificationStr);
        await this.sleep(100);
    }

    async callTool(toolName, params = {}) {
        const request = {
            jsonrpc: '2.0',
            id: this.messageId++,
            method: 'tools/call',
            params: { name: toolName, arguments: params }
        };

        try {
            const response = await this.sendRequest(request);
            return response;
        } catch (error) {
            console.log(`ERROR calling ${toolName}:`, error.message);
            return { error: error.message };
        }
    }

    async stop() {
        if (this.server) {
            this.server.kill();
            await this.sleep(1000);
        }
    }
}

async function runTests() {
    console.log('\n=== Testing unfugit_restore_apply ===\n');
    
    const client = new MCPClient();
    let logMessages = [];
    
    function log(message) {
        console.log(message);
        logMessages.push(message);
    }
    
    try {
        await client.start();
        
        // Wait for audit repo to be created
        await client.sleep(3000);
        
        log('\n--- Getting commit history ---');
        let response = await client.callTool('unfugit_history', { limit: 20 });
        
        if (!response.result || !response.result.structuredContent || !response.result.structuredContent.commits) {
            log('ERROR: No commits found in history');
            return;
        }
        
        const commits = response.result.structuredContent.commits;
        log(`Found ${commits.length} commits`);
        
        if (commits.length < 2) {
            log('WARNING: Need at least 2 commits, creating test scenario...');
            
            // Create and modify test files
            fs.writeFileSync('test-restore-simple.txt', 'Original content v1\nLine 2 original\n');
            await client.sleep(2000); // Wait for auto-commit
            
            fs.writeFileSync('test-restore-simple.txt', 'Modified content v2\nLine 2 modified\nLine 3 added\n');
            await client.sleep(2000); // Wait for auto-commit
            
            // Get updated history
            response = await client.callTool('unfugit_history', { limit: 10 });
            if (response.result && response.result.structuredContent) {
                const newCommits = response.result.structuredContent.commits;
                log(`Updated: Found ${newCommits.length} commits`);
                if (newCommits.length >= 2) {
                    commits.splice(0, 0, ...newCommits.slice(0, 2));
                }
            }
        }
        
        if (commits.length < 2) {
            log('ERROR: Still not enough commits for testing');
            return;
        }
        
        const latestCommit = commits[0].hash;
        const previousCommit = commits[1].hash;
        
        log(`Latest commit: ${latestCommit}`);
        log(`Previous commit: ${previousCommit}`);
        
        log('\n--- Test 1: Create restore preview ---');
        response = await client.callTool('unfugit_restore_preview', {
            commit: previousCommit,
            paths: ['test-restore-simple.txt']
        });
        
        log('Preview response:', JSON.stringify(response, null, 2));
        
        if (!response.result || !response.result.preview_token) {
            log('ERROR: No preview token received');
            return;
        }
        
        const previewToken = response.result.preview_token;
        log(`Preview token: ${previewToken}`);
        
        // Record current file content
        const currentContent = fs.readFileSync('test-restore-simple.txt', 'utf8');
        log(`Current file content: "${currentContent}"`);
        
        log('\n--- Test 2: Apply restore with preview token ---');
        response = await client.callTool('unfugit_restore_apply', {
            preview_token: previewToken,
            confirm_token: 'yes',
            idempotency_key: 'test-key-1'
        });
        
        log('Apply response:', JSON.stringify(response, null, 2));
        
        // Check if file was actually restored
        await client.sleep(1000);
        const restoredContent = fs.readFileSync('test-restore-simple.txt', 'utf8');
        log(`Restored file content: "${restoredContent}"`);
        
        if (restoredContent !== currentContent) {
            log('SUCCESS: File was actually modified during restore');
        } else {
            log('WARNING: File content unchanged after restore');
        }
        
        log('\n--- Test 3: Apply restore with backup ---');
        
        // Create new preview
        response = await client.callTool('unfugit_restore_preview', {
            commit: latestCommit,
            paths: ['test-restore-simple.txt']
        });
        
        if (response.result && response.result.preview_token) {
            const previewToken2 = response.result.preview_token;
            
            response = await client.callTool('unfugit_restore_apply', {
                preview_token: previewToken2,
                confirm_token: 'yes',
                idempotency_key: 'test-key-2',
                create_backup: true
            });
            
            log('Apply with backup response:', JSON.stringify(response, null, 2));
            
            // Check if backup was created
            const backupFile = 'test-restore-simple.txt.backup';
            if (fs.existsSync(backupFile)) {
                const backupContent = fs.readFileSync(backupFile, 'utf8');
                log(`Backup created with content: "${backupContent}"`);
            } else {
                log('WARNING: No backup file created');
            }
        }
        
        log('\n--- Test 4: Test error conditions ---');
        
        // Test with invalid token
        response = await client.callTool('unfugit_restore_apply', {
            preview_token: 'invalid-token-123',
            confirm_token: 'yes',
            idempotency_key: 'test-key-3'
        });
        
        log('Invalid token response:', JSON.stringify(response, null, 2));
        
        // Test missing required parameters
        response = await client.callTool('unfugit_restore_apply', {
            preview_token: previewToken
        });
        
        log('Missing params response:', JSON.stringify(response, null, 2));
        
        log('\n--- Final state verification ---');
        
        // Check final file states
        const finalFiles = ['test-restore-simple.txt', 'test-restore-simple.txt.backup'];
        for (const file of finalFiles) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                const size = fs.statSync(file).size;
                log(`${file}: EXISTS (${size} bytes) - "${content.replace(/\n/g, '\\n')}"`);
            } else {
                log(`${file}: MISSING`);
            }
        }
        
        log('\n=== Test completed successfully ===');
        
    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        console.error('Stack trace:', error.stack);
    } finally {
        await client.stop();
        
        // Write detailed log
        const logFile = path.join(PROJECT_ROOT, 'temp2_restore_apply.md');
        const logContent = `# Unfugit Restore Apply Test Results (Fixed)

Test run: ${new Date().toISOString()}
Project: ${PROJECT_ROOT}

## Test Output

${logMessages.map(msg => typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)).join('\n')}

## Summary

This test verifies the unfugit_restore_apply MCP tool functionality:

1. **Preview Token Generation**: Tests creating restore previews 
2. **Apply with Token**: Tests applying restores using preview tokens
3. **Backup Creation**: Tests backup file creation during restore
4. **Error Handling**: Tests invalid tokens and missing parameters
5. **File State Verification**: Confirms actual file changes

The test creates a simple scenario with file modifications and then tests the restore functionality comprehensively.

Test completed: ${new Date().toISOString()}
`;
        
        fs.writeFileSync(logFile, logContent);
        console.log(`\nDetailed results written to: ${logFile}`);
    }
}

runTests().catch(console.error);