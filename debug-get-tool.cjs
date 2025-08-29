#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class DebugUnfugitGet {
    constructor() {
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
                            // Initialize response
                            const initNotification = JSON.stringify({
                                jsonrpc: "2.0",
                                method: "notifications/initialized"
                            }) + '\n';
                            server.stdin.write(initNotification);
                            
                            // Send tool call
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
                            response = JSON.stringify(msg, null, 2);
                            server.kill();
                            resolve(response);
                            return;
                        }
                    } catch (e) {
                        // Ignore non-JSON lines
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

            const initRequest = JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: {
                        name: "debug-test",
                        version: "1.0.0"
                    }
                }
            }) + '\n';

            server.stdin.write(initRequest);
        });
    }

    async debugGetTool() {
        console.log('🔍 Debugging unfugit_get tool behavior...');
        
        await this.log('Debug Session: Understanding unfugit_get', 
            `Investigating why unfugit_get returns PATH_NOT_FOUND for all files
Goal: Understand the expected file paths and commit structure`);

        // Step 1: Get detailed commit history
        console.log('📊 Step 1: Getting detailed commit history...');
        try {
            const historyResult = await this.callTool('unfugit_history', { 
                limit: 5, 
                details: true 
            });
            await this.log('Commit History Details', historyResult);
        } catch (error) {
            await this.log('❌ Error getting history', error.message);
        }

        // Step 2: Get repository statistics
        console.log('📈 Step 2: Getting repository statistics...');
        try {
            const statsResult = await this.callTool('unfugit_stats', {});
            await this.log('Repository Statistics', statsResult);
        } catch (error) {
            await this.log('❌ Error getting stats', error.message);
        }

        // Step 3: Try unfugit_show on specific commits to see what files exist
        console.log('🔍 Step 3: Examining specific commits...');
        
        // Get a recent commit SHA from history first
        const historyForSha = await this.callTool('unfugit_history', { limit: 3 });
        const historyData = JSON.parse(historyForSha);
        const historyText = historyData.result?.content?.[0]?.text || '';
        
        // Extract first commit SHA
        const shaMatch = historyText.match(/^([a-f0-9]{40})/m);
        if (shaMatch) {
            const commitSha = shaMatch[1];
            console.log(`📋 Found commit SHA: ${commitSha}`);
            
            try {
                const showResult = await this.callTool('unfugit_show', { 
                    commit: commitSha,
                    include_content: false  // Just show structure
                });
                await this.log(`Commit Structure: ${commitSha.substring(0, 8)}`, showResult);
            } catch (error) {
                await this.log(`❌ Error showing commit ${commitSha.substring(0, 8)}`, error.message);
            }
        }

        // Step 4: Test unfugit_get with various approaches
        console.log('🧪 Step 4: Testing various unfugit_get approaches...');
        
        const testCases = [
            // Test with exact paths that might exist in audit repo
            { path: 'temp2_get.md', ref: 'HEAD', desc: 'Recently created file' },
            { path: './temp2_get.md', ref: 'HEAD', desc: 'Same file with ./ prefix' },
            { path: '/temp2_get.md', ref: 'HEAD', desc: 'Same file with / prefix' },
            
            // Test with common files
            { path: 'package.json', ref: 'HEAD', desc: 'Package file' },
            { path: './package.json', ref: 'HEAD', desc: 'Package file with prefix' },
            
            // Test with commit SHA instead of HEAD
            { path: 'package.json', ref: shaMatch?.[1] || 'HEAD', desc: 'Package with specific SHA' },
            
            // Test directory listing
            { path: '.', ref: 'HEAD', desc: 'Root directory' },
            { path: '', ref: 'HEAD', desc: 'Empty path' },
            
            // Test absolute vs relative
            { path: 'test-get-mcp.cjs', ref: 'HEAD', desc: 'Test script file' },
        ];

        for (const testCase of testCases) {
            console.log(`🎯 Testing: ${testCase.desc}`);
            
            try {
                const result = await this.callTool('unfugit_get', {
                    path: testCase.path,
                    ref: testCase.ref
                });
                
                const resultData = JSON.parse(result);
                const isError = resultData.result?.isError;
                const status = isError ? '❌ FAILED' : '✅ SUCCESS';
                
                await this.log(`Get Test: ${testCase.desc} ${status}`, 
                    `Path: "${testCase.path}"
Ref: "${testCase.ref}"
Description: ${testCase.desc}
Result: ${result}`);
                
            } catch (error) {
                await this.log(`❌ Error in test: ${testCase.desc}`, error.message);
            }
        }

        // Step 5: Check if files exist in file system vs audit repo
        console.log('📁 Step 5: Checking file system vs audit repo...');
        
        const fsFiles = ['package.json', 'README.md', 'temp2_get.md', 'test-get-mcp.cjs'];
        
        for (const file of fsFiles) {
            try {
                const fsExists = await fs.access(file).then(() => true).catch(() => false);
                
                // Try to get from unfugit
                const result = await this.callTool('unfugit_get', { path: file, ref: 'HEAD' });
                const resultData = JSON.parse(result);
                const unfugitExists = !resultData.result?.isError;
                
                await this.log(`File Existence Check: ${file}`, 
                    `File System: ${fsExists ? 'EXISTS' : 'NOT_FOUND'}
Unfugit GET: ${unfugitExists ? 'EXISTS' : 'NOT_FOUND'}
Unfugit Result: ${result}`);
                
            } catch (error) {
                await this.log(`❌ Error checking ${file}`, error.message);
            }
        }

        console.log('✅ Debug analysis complete!');
    }
}

const debugTool = new DebugUnfugitGet();
debugTool.debugGetTool().catch(console.error);