#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class AdvancedUnfugitGetTest {
    constructor() {
        this.requestId = 1;
        this.logFile = path.join(__dirname, 'temp2_get.md');
    }

    async log(title, content) {
        const timestamp = new Date().toISOString();
        const entry = `\n### ${title}\n**Time:** ${timestamp}\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
        await fs.appendFile(this.logFile, entry);
        console.log(`📝 ${title}`);
    }

    async callTool(toolName, args) {
        return new Promise((resolve, reject) => {
            const server = spawn('node', ['dist/src/unfugit.js', '.'], {
                cwd: __dirname,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let response = '';
            let errorOutput = '';

            server.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    try {
                        const msg = JSON.parse(line);
                        
                        if (msg.id === 1 && msg.result) {
                            // Initialize response - send initialized notification
                            const initNotification = JSON.stringify({
                                jsonrpc: "2.0",
                                method: "notifications/initialized"
                            }) + '\n';
                            server.stdin.write(initNotification);
                            
                            // Send the actual tool call
                            const toolCall = JSON.stringify({
                                jsonrpc: "2.0",
                                id: 2,
                                method: "tools/call",
                                params: {
                                    name: toolName,
                                    arguments: args
                                }
                            }) + '\n';
                            server.stdin.write(toolCall);
                        } else if (msg.id === 2) {
                            // Tool response
                            response = JSON.stringify(msg, null, 2);
                            server.kill();
                            resolve(response);
                            return;
                        }
                    } catch (e) {
                        // Ignore non-JSON lines (notifications, etc.)
                    }
                }
            });

            server.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            server.on('close', (code) => {
                if (!response) {
                    reject(new Error(`Server closed with code ${code}. Error: ${errorOutput}`));
                }
            });

            server.on('error', (err) => {
                reject(err);
            });

            // Send initialization
            const initRequest = JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: {
                        name: "unfugit-advanced-test",
                        version: "1.0.0"
                    }
                }
            }) + '\n';

            server.stdin.write(initRequest);
        });
    }

    async runAdvancedTests() {
        console.log('🔬 Starting advanced unfugit_get testing...');
        
        await this.log('Advanced Test Session Started', 
            `Starting advanced unfugit_get testing focusing on:
- Historical commit retrieval 
- Different ref formats (SHA, branches, HEAD~1, etc.)
- Files from actual commits in the audit repo
- Comprehensive edge case testing`);

        // Step 1: Get commit history to understand available commits and files
        console.log('📊 Getting commit history...');
        try {
            const historyResult = await this.callTool('unfugit_history', { limit: 10 });
            await this.log('Step 1: Commit History Analysis', historyResult);
            
            // Parse history to extract commit SHAs and understand structure
            const historyData = JSON.parse(historyResult);
            const commits = historyData.result?.content?.[0]?.text || '';
            
            // Extract commit SHAs from history
            const commitShas = [];
            const lines = commits.split('\n');
            for (const line of lines) {
                const match = line.match(/^([a-f0-9]{40})\s/);
                if (match) {
                    commitShas.push(match[1]);
                }
            }
            
            await this.log('Extracted Commit SHAs', `Found ${commitShas.length} commits:\n${commitShas.join('\n')}`);
            
            // Step 2: Test retrieval of known files from different commits
            await this.testKnownFiles(commitShas);
            
            // Step 3: Test different ref formats
            await this.testDifferentRefs(commitShas);
            
            // Step 4: Test files that exist vs don't exist in different commits
            await this.testFileExistence(commitShas);
            
            // Step 5: Test with recent project files that should exist
            await this.testProjectFiles();
            
        } catch (error) {
            await this.log('❌ Advanced Testing Error', error.message);
        }
    }

    async testKnownFiles(commitShas) {
        console.log('📁 Testing known files from commits...');
        
        const knownFiles = [
            'package.json',
            'README.md', 
            'src/unfugit.ts',
            'tsconfig.json',
            '.gitignore',
            'dist/src/unfugit.js',
            'CLAUDE.md',
            'test-ascii.txt',
            'test-utf8.txt',
            'deep/file1.txt'
        ];
        
        for (const file of knownFiles) {
            console.log(`🔍 Testing retrieval of ${file}...`);
            
            // Test from HEAD
            try {
                const result = await this.callTool('unfugit_get', { path: file, ref: 'HEAD' });
                const resultData = JSON.parse(result);
                const success = !resultData.result?.isError;
                
                await this.log(`Known File Test: ${file} from HEAD ${success ? '✅' : '❌'}`, 
                    `File: ${file}\nRef: HEAD\nResult: ${result}`);
                
                // If file exists in HEAD, test from older commits
                if (success && commitShas.length > 1) {
                    const olderSha = commitShas[Math.min(1, commitShas.length - 1)];
                    const olderResult = await this.callTool('unfugit_get', { path: file, ref: olderSha });
                    const olderData = JSON.parse(olderResult);
                    const olderSuccess = !olderData.result?.isError;
                    
                    await this.log(`Known File Test: ${file} from ${olderSha.substring(0, 8)} ${olderSuccess ? '✅' : '❌'}`, 
                        `File: ${file}\nRef: ${olderSha}\nResult: ${olderResult}`);
                }
                
            } catch (error) {
                await this.log(`❌ Error testing ${file}`, error.message);
            }
        }
    }

    async testDifferentRefs(commitShas) {
        console.log('🔄 Testing different ref formats...');
        
        if (commitShas.length === 0) {
            await this.log('Skip Ref Tests', 'No commits available for ref testing');
            return;
        }
        
        const testFile = 'package.json'; // Should exist in most commits
        const refFormats = [
            'HEAD',
            'HEAD~1',
            'HEAD~2',
            commitShas[0],                           // Full SHA
            commitShas[0].substring(0, 8),          // Short SHA
            commitShas[0].substring(0, 12),         // Medium SHA
            'main',                                 // Branch name
            'master',                               // Alternative branch name
            '',                                     // Empty ref (should default to HEAD)
            'nonexistent-ref',                      // Invalid ref
            '0000000000000000000000000000000000000000', // Invalid SHA
        ];
        
        for (const ref of refFormats) {
            console.log(`🎯 Testing ref format: "${ref}"`);
            
            try {
                const result = await this.callTool('unfugit_get', { path: testFile, ref: ref });
                const resultData = JSON.parse(result);
                const success = !resultData.result?.isError;
                
                await this.log(`Ref Format Test: "${ref}" ${success ? '✅' : '❌'}`, 
                    `File: ${testFile}\nRef: "${ref}"\nResult: ${result}`);
                    
            } catch (error) {
                await this.log(`❌ Error testing ref "${ref}"`, error.message);
            }
        }
    }

    async testFileExistence(commitShas) {
        console.log('👻 Testing file existence across commits...');
        
        if (commitShas.length < 2) {
            await this.log('Skip Existence Tests', 'Need at least 2 commits for existence testing');
            return;
        }
        
        // Test files that might exist in some commits but not others
        const testFiles = [
            'temp2_get.md',        // Recently created
            'test-get-mcp.cjs',    // Recently created
            'package-lock.json',   // Common file that might change
            'node_modules/README', // May exist in some commits
            'dist/src/unfugit.js', // Build artifact
            'nonexistent.txt',     // Should never exist
        ];
        
        for (const file of testFiles) {
            console.log(`🔍 Testing existence of ${file} across commits...`);
            
            for (let i = 0; i < Math.min(3, commitShas.length); i++) {
                const sha = commitShas[i];
                
                try {
                    const result = await this.callTool('unfugit_get', { path: file, ref: sha });
                    const resultData = JSON.parse(result);
                    const exists = !resultData.result?.isError;
                    
                    await this.log(`Existence Test: ${file} in ${sha.substring(0, 8)} ${exists ? '✅ EXISTS' : '❌ NOT_FOUND'}`, 
                        `File: ${file}\nCommit: ${sha}\nResult: ${result}`);
                        
                } catch (error) {
                    await this.log(`❌ Error testing ${file} in ${sha.substring(0, 8)}`, error.message);
                }
            }
        }
    }

    async testProjectFiles() {
        console.log('📦 Testing current project files...');
        
        // Test actual files that should definitely exist
        const projectFiles = [
            { path: 'package.json', desc: 'Package configuration' },
            { path: 'tsconfig.json', desc: 'TypeScript configuration' },
            { path: '.gitignore', desc: 'Git ignore file' },
            { path: 'README.md', desc: 'Project documentation' },
            { path: 'CLAUDE.md', desc: 'Claude instructions' },
        ];
        
        for (const file of projectFiles) {
            console.log(`📄 Testing ${file.desc}: ${file.path}`);
            
            try {
                const result = await this.callTool('unfugit_get', { path: file.path, ref: 'HEAD' });
                const resultData = JSON.parse(result);
                const success = !resultData.result?.isError;
                
                if (success && resultData.result?.structuredContent) {
                    const content = resultData.result.structuredContent;
                    await this.log(`Project File: ${file.path} ✅ SUCCESS`, 
                        `Description: ${file.desc}
Path: ${file.path}
Size: ${content.size} bytes
MIME Type: ${content.mimeType}
Encoding: ${content.encoding}
Content Preview: ${resultData.result.content?.[0]?.text?.substring(0, 200)}...`);
                } else {
                    await this.log(`Project File: ${file.path} ❌ FAILED`, 
                        `Description: ${file.desc}\nResult: ${result}`);
                }
                
            } catch (error) {
                await this.log(`❌ Error testing project file ${file.path}`, error.message);
            }
        }
        
        // Test binary/special files
        const specialFiles = [
            { path: 'dist/src/unfugit.js', desc: 'Compiled JavaScript (large)' },
            { path: 'package-lock.json', desc: 'NPM lock file (very large)' },
        ];
        
        for (const file of specialFiles) {
            console.log(`🔧 Testing ${file.desc}: ${file.path}`);
            
            try {
                const result = await this.callTool('unfugit_get', { path: file.path, ref: 'HEAD' });
                const resultData = JSON.parse(result);
                const success = !resultData.result?.isError;
                
                if (success) {
                    const content = resultData.result.structuredContent;
                    await this.log(`Special File: ${file.path} ✅ SUCCESS`, 
                        `Description: ${file.desc}
Size: ${content?.size} bytes
MIME Type: ${content?.mimeType}
Encoding: ${content?.encoding}
Content Type: ${resultData.result.content?.[0]?.type}
Content Length: ${resultData.result.content?.[0]?.text?.length} chars`);
                } else {
                    await this.log(`Special File: ${file.path} ❌ FAILED`, 
                        `Description: ${file.desc}\nResult: ${result}`);
                }
                
            } catch (error) {
                await this.log(`❌ Error testing special file ${file.path}`, error.message);
            }
        }
    }
}

// Run advanced tests
const tester = new AdvancedUnfugitGetTest();
tester.runAdvancedTests().catch(console.error);