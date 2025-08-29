#!/usr/bin/env node
/**
 * Comprehensive test for unfugit_restore_apply MCP tool
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const LOG_FILE = path.join(PROJECT_ROOT, 'temp2_restore_apply.md');

// Initialize log file
let logContent = `# Unfugit Restore Apply Comprehensive Test Results\n\n`;
logContent += `Test started: ${new Date().toISOString()}\n`;
logContent += `Project root: ${PROJECT_ROOT}\n\n`;

function log(message) {
    console.log(message);
    logContent += `${message}\n`;
}

function logSection(title) {
    const line = '='.repeat(60);
    log(`\n${line}`);
    log(`${title}`);
    log(line);
}

function logSubsection(title) {
    const line = '-'.repeat(40);
    log(`\n${line}`);
    log(`${title}`);
    log(line);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class MCPClient {
    constructor() {
        this.messageId = 1;
        this.server = null;
    }

    async start() {
        log('Starting MCP server...');
        this.server = spawn('node', ['dist/unfugit.js', PROJECT_ROOT], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.server.stderr.on('data', (data) => {
            console.error('Server stderr:', data.toString());
        });

        // Wait for server to start
        await sleep(2000);

        // Initialize MCP connection
        await this.sendRequest({
            jsonrpc: '2.0',
            id: this.messageId++,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                clientInfo: {
                    name: 'test-client',
                    version: '1.0.0'
                }
            }
        });

        // Send initialized notification
        await this.sendNotification({
            jsonrpc: '2.0',
            method: 'initialized',
            params: {}
        });

        log('MCP server started and initialized');
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
            
            // Timeout after 10 seconds
            setTimeout(() => {
                this.server.stdout.removeListener('data', onData);
                reject(new Error('Request timeout'));
            }, 10000);
        });
    }

    async sendNotification(notification) {
        const notificationStr = JSON.stringify(notification) + '\n';
        this.server.stdin.write(notificationStr);
        await sleep(100); // Small delay for notification processing
    }

    async callTool(toolName, params = {}) {
        const request = {
            jsonrpc: '2.0',
            id: this.messageId++,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: params
            }
        };

        try {
            const response = await this.sendRequest(request);
            return response;
        } catch (error) {
            log(`ERROR calling ${toolName}: ${error.message}`);
            return { error: error.message };
        }
    }

    async stop() {
        if (this.server) {
            this.server.kill();
            await sleep(1000);
            log('MCP server stopped');
        }
    }
}

async function getFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        return null;
    }
}

async function setFileContent(filePath, content) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    } catch (error) {
        log(`ERROR writing file ${filePath}: ${error.message}`);
        return false;
    }
}

async function fileExists(filePath) {
    try {
        fs.accessSync(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

async function deleteFile(filePath) {
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

async function runComprehensiveTests() {
    const client = new MCPClient();
    
    try {
        await client.start();
        
        // Wait for file watcher to create audit repo
        await sleep(3000);
        
        logSection('TEST 1: Setup and Initial State');
        
        // Get initial history
        log('Getting initial history...');
        let response = await client.callTool('unfugit_history', { limit: 5 });
        log(`History response: ${JSON.stringify(response, null, 2)}`);
        
        // Get stats
        response = await client.callTool('unfugit_stats');
        log(`Stats response: ${JSON.stringify(response, null, 2)}`);
        
        logSection('TEST 2: Create Test Files and Track Changes');
        
        // Create and modify test files to build history
        const testTextFile = path.join(PROJECT_ROOT, 'test-restore-target.txt');
        const testBinaryFile = path.join(PROJECT_ROOT, 'test-restore-target.bin');
        const testCodeFile = path.join(PROJECT_ROOT, 'test-restore-target.py');
        
        log('Creating initial test files...');
        await setFileContent(testTextFile, 'Original content line 1\nOriginal content line 2\n');
        await setFileContent(testBinaryFile, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]));
        await setFileContent(testCodeFile, `def original_function():\n    return "original"\n`);
        
        // Wait for auto-commit
        await sleep(2000);
        
        log('Modifying test files...');
        await setFileContent(testTextFile, 'Modified content line 1\nModified content line 2\nNew line 3\n');
        await setFileContent(testBinaryFile, Buffer.from([0x10, 0x11, 0x12, 0x13, 0xFF, 0xFE, 0xFD, 0xFC]));
        await setFileContent(testCodeFile, `def modified_function():\n    return "modified"\n\ndef new_function():\n    return "new"\n`);
        
        // Wait for auto-commit
        await sleep(2000);
        
        log('Deleting one test file...');
        deleteFile(testBinaryFile);
        
        // Wait for auto-commit
        await sleep(2000);
        
        logSection('TEST 3: Get History and Prepare for Restore Tests');
        
        // Get updated history
        response = await client.callTool('unfugit_history', { limit: 10 });
        log(`Updated history: ${JSON.stringify(response, null, 2)}`);
        
        if (!response.result || !response.result.content || response.result.content.length === 0) {
            log('ERROR: No commit history found');
            return;
        }
        
        const commits = response.result.content;
        if (commits.length < 2) {
            log('ERROR: Need at least 2 commits for restore testing');
            return;
        }
        
        const latestCommit = commits[0].commit;
        const previousCommit = commits[1].commit;
        
        log(`Latest commit: ${latestCommit}`);
        log(`Previous commit: ${previousCommit}`);
        
        logSection('TEST 4: Basic Restore Preview Tests');
        
        logSubsection('TEST 4.1: Preview restore of text file');
        response = await client.callTool('unfugit_restore_preview', {
            commit: previousCommit,
            paths: ['test-restore-target.txt']
        });
        log(`Preview text file restore: ${JSON.stringify(response, null, 2)}`);
        
        let textPreviewToken = null;
        if (response.result && response.result.preview_token) {
            textPreviewToken = response.result.preview_token;
            log(`Text preview token: ${textPreviewToken}`);
        }
        
        logSubsection('TEST 4.2: Preview restore of deleted binary file');
        response = await client.callTool('unfugit_restore_preview', {
            commit: previousCommit,
            paths: ['test-restore-target.bin']
        });
        log(`Preview binary file restore: ${JSON.stringify(response, null, 2)}`);
        
        let binaryPreviewToken = null;
        if (response.result && response.result.preview_token) {
            binaryPreviewToken = response.result.preview_token;
            log(`Binary preview token: ${binaryPreviewToken}`);
        }
        
        logSubsection('TEST 4.3: Preview restore of code file');
        response = await client.callTool('unfugit_restore_preview', {
            commit: previousCommit,
            paths: ['test-restore-target.py']
        });
        log(`Preview code file restore: ${JSON.stringify(response, null, 2)}`);
        
        let codePreviewToken = null;
        if (response.result && response.result.preview_token) {
            codePreviewToken = response.result.preview_token;
            log(`Code preview token: ${codePreviewToken}`);
        }
        
        logSection('TEST 5: Restore Apply Tests');
        
        logSubsection('TEST 5.1: Apply restore with invalid token');
        response = await client.callTool('unfugit_restore_apply', {
            preview_token: 'invalid-token-123'
        });
        log(`Apply with invalid token: ${JSON.stringify(response, null, 2)}`);
        
        logSubsection('TEST 5.2: Apply restore without preview token');
        response = await client.callTool('unfugit_restore_apply', {
            commit: previousCommit,
            paths: ['test-restore-target.txt']
        });
        log(`Apply without preview token: ${JSON.stringify(response, null, 2)}`);
        
        logSubsection('TEST 5.3: Apply text file restore with valid token');
        if (textPreviewToken) {
            // Record current content
            const currentContent = await getFileContent(testTextFile);
            log(`Current text file content: "${currentContent}"`);
            
            response = await client.callTool('unfugit_restore_apply', {
                preview_token: textPreviewToken
            });
            log(`Apply text restore: ${JSON.stringify(response, null, 2)}`);
            
            // Check if file was restored
            const restoredContent = await getFileContent(testTextFile);
            log(`Restored text file content: "${restoredContent}"`);
            
            if (restoredContent !== currentContent) {
                log(`SUCCESS: Text file was actually modified during restore`);
            } else {
                log(`WARNING: Text file content unchanged after restore`);
            }
        }
        
        logSubsection('TEST 5.4: Apply restore with backup option');
        if (codePreviewToken) {
            // Record current content
            const currentCodeContent = await getFileContent(testCodeFile);
            log(`Current code file content: "${currentCodeContent}"`);
            
            response = await client.callTool('unfugit_restore_apply', {
                preview_token: codePreviewToken,
                create_backup: true
            });
            log(`Apply code restore with backup: ${JSON.stringify(response, null, 2)}`);
            
            // Check if file was restored
            const restoredCodeContent = await getFileContent(testCodeFile);
            log(`Restored code file content: "${restoredCodeContent}"`);
            
            // Check if backup was created
            const backupFile = testCodeFile + '.backup';
            if (await fileExists(backupFile)) {
                const backupContent = await getFileContent(backupFile);
                log(`Backup file created with content: "${backupContent}"`);
            } else {
                log(`No backup file found at ${backupFile}`);
            }
        }
        
        logSubsection('TEST 5.5: Apply restore of deleted file');
        if (binaryPreviewToken) {
            log(`Binary file exists before restore: ${await fileExists(testBinaryFile)}`);
            
            response = await client.callTool('unfugit_restore_apply', {
                preview_token: binaryPreviewToken
            });
            log(`Apply binary restore: ${JSON.stringify(response, null, 2)}`);
            
            log(`Binary file exists after restore: ${await fileExists(testBinaryFile)}`);
            
            if (await fileExists(testBinaryFile)) {
                try {
                    const restoredBinaryContent = fs.readFileSync(testBinaryFile);
                    log(`Restored binary file size: ${restoredBinaryContent.length} bytes`);
                    log(`Restored binary file content (hex): ${restoredBinaryContent.toString('hex')}`);
                } catch (error) {
                    log(`Error reading restored binary file: ${error.message}`);
                }
            }
        }
        
        logSection('TEST 6: Edge Case Tests');
        
        logSubsection('TEST 6.1: Apply same restore token twice');
        if (textPreviewToken) {
            response = await client.callTool('unfugit_restore_apply', {
                preview_token: textPreviewToken
            });
            log(`Apply same token twice: ${JSON.stringify(response, null, 2)}`);
        }
        
        logSubsection('TEST 6.2: Apply restore with non-existent paths');
        response = await client.callTool('unfugit_restore_preview', {
            commit: previousCommit,
            paths: ['non-existent-file.txt']
        });
        log(`Preview non-existent file: ${JSON.stringify(response, null, 2)}`);
        
        if (response.result && response.result.preview_token) {
            response = await client.callTool('unfugit_restore_apply', {
                preview_token: response.result.preview_token
            });
            log(`Apply non-existent file restore: ${JSON.stringify(response, null, 2)}`);
        }
        
        logSubsection('TEST 6.3: Apply restore with empty paths array');
        response = await client.callTool('unfugit_restore_preview', {
            commit: previousCommit,
            paths: []
        });
        log(`Preview empty paths: ${JSON.stringify(response, null, 2)}`);
        
        if (response.result && response.result.preview_token) {
            response = await client.callTool('unfugit_restore_apply', {
                preview_token: response.result.preview_token
            });
            log(`Apply empty paths restore: ${JSON.stringify(response, null, 2)}`);
        }
        
        logSection('TEST 7: Permission and Safety Tests');
        
        logSubsection('TEST 7.1: Test with read-only file');
        const readOnlyFile = path.join(PROJECT_ROOT, 'test-readonly.txt');
        await setFileContent(readOnlyFile, 'read-only content');
        
        try {
            fs.chmodSync(readOnlyFile, 0o444); // Read-only
            
            // Wait for auto-commit
            await sleep(2000);
            
            // Modify file (this should fail due to permissions)
            response = await client.callTool('unfugit_restore_preview', {
                commit: latestCommit,
                paths: ['test-readonly.txt']
            });
            log(`Preview read-only file: ${JSON.stringify(response, null, 2)}`);
            
            if (response.result && response.result.preview_token) {
                response = await client.callTool('unfugit_restore_apply', {
                    preview_token: response.result.preview_token
                });
                log(`Apply read-only file restore: ${JSON.stringify(response, null, 2)}`);
            }
        } catch (error) {
            log(`Read-only test error: ${error.message}`);
        } finally {
            try {
                fs.chmodSync(readOnlyFile, 0o644); // Restore permissions
                deleteFile(readOnlyFile);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
        logSection('TEST 8: Final State Verification');
        
        // Get final history
        response = await client.callTool('unfugit_history', { limit: 10 });
        log(`Final history: ${JSON.stringify(response, null, 2)}`);
        
        // Get final stats
        response = await client.callTool('unfugit_stats');
        log(`Final stats: ${JSON.stringify(response, null, 2)}`);
        
        logSection('TEST SUMMARY');
        
        // List all test files and their current state
        const testFiles = [
            'test-restore-target.txt',
            'test-restore-target.bin', 
            'test-restore-target.py',
            'test-restore-target.py.backup'
        ];
        
        for (const file of testFiles) {
            const fullPath = path.join(PROJECT_ROOT, file);
            const exists = await fileExists(fullPath);
            log(`${file}: ${exists ? 'EXISTS' : 'MISSING'}`);
            
            if (exists) {
                try {
                    const content = await getFileContent(fullPath);
                    if (content !== null && content.length < 200) {
                        log(`  Content: "${content.replace(/\n/g, '\\n')}"`);
                    } else {
                        const size = fs.statSync(fullPath).size;
                        log(`  Size: ${size} bytes`);
                    }
                } catch (error) {
                    log(`  Error reading: ${error.message}`);
                }
            }
        }
        
    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        console.error('Stack trace:', error.stack);
    } finally {
        await client.stop();
        
        // Write final log
        logContent += `\nTest completed: ${new Date().toISOString()}\n`;
        fs.writeFileSync(LOG_FILE, logContent);
        log(`\nTest results written to: ${LOG_FILE}`);
    }
}

// Run the tests
runComprehensiveTests().catch(console.error);