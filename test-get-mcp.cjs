#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class MCPTestClient {
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

    async callUnfugitGet(filePath, ref = 'HEAD') {
        return new Promise((resolve, reject) => {
            const server = spawn('node', ['dist/src/unfugit.js', '.'], {
                cwd: __dirname,
                stdio: ['pipe', 'pipe', 'inherit']
            });

            let response = '';
            let initialized = false;

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
                            
                            // Send the actual tool call
                            const toolCall = JSON.stringify({
                                jsonrpc: "2.0",
                                id: 2,
                                method: "tools/call",
                                params: {
                                    name: "unfugit_get",
                                    arguments: {
                                        path: filePath,
                                        ref: ref
                                    }
                                }
                            }) + '\n';
                            server.stdin.write(toolCall);
                            initialized = true;
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

            server.on('close', (code) => {
                if (!response) {
                    reject(new Error(`Server closed with code ${code} before response`));
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
                        name: "unfugit-get-test",
                        version: "1.0.0"
                    }
                }
            }) + '\n';

            server.stdin.write(initRequest);
        });
    }

    async runTests() {
        console.log('🚀 Starting comprehensive unfugit_get testing...');
        
        await this.log('Test Session Started', `Starting comprehensive unfugit_get MCP tool testing
Project: ${__dirname}
Test focus: File content retrieval across different scenarios`);

        // First, create diverse test files
        await this.createTestFiles();

        const tests = [
            // Basic text files
            { name: 'ASCII Text File', path: 'test-ascii.txt', ref: 'HEAD' },
            { name: 'UTF-8 Text File', path: 'test-utf8.txt', ref: 'HEAD' },
            { name: 'Large Text File', path: 'test-large-content.txt', ref: 'HEAD' },
            
            // Structured files
            { name: 'JSON File', path: 'test-data.json', ref: 'HEAD' },
            
            // Binary files
            { name: 'Mixed Binary File', path: 'test-mixed.bin', ref: 'HEAD' },
            { name: 'Random Binary File', path: 'test-binary-random.bin', ref: 'HEAD' },
            { name: 'PNG File', path: 'test-fake-png.png', ref: 'HEAD' },
            
            // Special filenames
            { name: 'File with Spaces', path: 'test file with spaces.txt', ref: 'HEAD' },
            { name: 'Unicode Filename', path: 'test-файл-测试.txt', ref: 'HEAD' },
            { name: 'Symbols Filename', path: 'test@#$%^&()_+.txt', ref: 'HEAD' },
            
            // Subdirectories
            { name: 'Subdirectory File', path: 'deep/file1.txt', ref: 'HEAD' },
            { name: 'Nested File', path: 'deep/nested/structure/file.txt', ref: 'HEAD' },
            
            // Existing project files
            { name: 'Package.json', path: 'package.json', ref: 'HEAD' },
            { name: 'README', path: 'README.md', ref: 'HEAD' },
            { name: 'Source File', path: 'src/unfugit.ts', ref: 'HEAD' },
            
            // Edge cases
            { name: 'Non-existent File', path: 'does-not-exist.txt', ref: 'HEAD' },
            { name: 'Empty Path', path: '', ref: 'HEAD' },
            { name: 'Directory Path', path: 'deep', ref: 'HEAD' },
            { name: 'Security Test - Path Traversal', path: '../../../etc/passwd', ref: 'HEAD' },
            
            // Different refs
            { name: 'Get from non-existent ref', path: 'package.json', ref: 'nonexistent-branch' },
            { name: 'Get with empty ref', path: 'package.json', ref: '' },
        ];

        let passed = 0;
        let failed = 0;

        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            console.log(`\n📋 Test ${i + 1}/${tests.length}: ${test.name}`);
            
            try {
                const result = await this.callUnfugitGet(test.path, test.ref);
                const resultObj = JSON.parse(result);
                
                const success = resultObj.error ? false : true;
                if (success) passed++; else failed++;
                
                await this.log(`Test ${i + 1}: ${test.name} ${success ? '✅ PASS' : '❌ FAIL'}`, 
                    `Path: "${test.path}"
Ref: "${test.ref}"
Result: ${result}`);
                
            } catch (error) {
                failed++;
                await this.log(`Test ${i + 1}: ${test.name} ❌ ERROR`, 
                    `Path: "${test.path}"
Ref: "${test.ref}"
Error: ${error.message}`);
            }
        }

        await this.log('Test Summary', 
            `Total tests: ${tests.length}
Passed: ${passed}
Failed: ${failed}
Success rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

        console.log(`\n🏁 Testing completed! ${passed}/${tests.length} tests passed`);
        console.log(`📄 Full results logged to: ${this.logFile}`);
    }

    async createTestFiles() {
        console.log('📁 Creating test files...');
        
        // Wait a moment to ensure server is ready
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
            // Text files
            await fs.writeFile('test-ascii.txt', 'Hello World - ASCII text');
            await fs.writeFile('test-utf8.txt', 'UTF-8: Héllo Wörld 🌍 测试');
            
            // Large file
            const largeContent = Array.from({length: 100}, (_, i) => 
                `Line ${i + 1}: This is a large text file for testing purposes. Lorem ipsum dolor sit amet.`
            ).join('\n');
            await fs.writeFile('test-large-content.txt', largeContent);
            
            // JSON file
            const jsonData = {
                name: "unfugit test",
                version: "1.0.0",
                features: ["get", "history", "diff"],
                metadata: {
                    created: "2025-08-29",
                    unicode: "测试数据 🚀"
                }
            };
            await fs.writeFile('test-data.json', JSON.stringify(jsonData, null, 2));
            
            // Binary files
            const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xFF, 0xFE]);
            await fs.writeFile('test-mixed.bin', binaryData);
            
            // Random binary
            const randomBinary = Buffer.allocUnsafe(1024);
            for (let i = 0; i < randomBinary.length; i++) {
                randomBinary[i] = Math.floor(Math.random() * 256);
            }
            await fs.writeFile('test-binary-random.bin', randomBinary);
            
            // Fake PNG
            const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            await fs.writeFile('test-fake-png.png', pngHeader);
            
            // Special filenames
            await fs.writeFile('test file with spaces.txt', 'Special filename content');
            await fs.writeFile('test-файл-测试.txt', 'Unicode filename content');  
            await fs.writeFile('test@#$%^&()_+.txt', 'Symbols content');
            
            // Subdirectories
            await fs.mkdir('deep/nested/structure', { recursive: true });
            await fs.writeFile('deep/file1.txt', 'Subdirectory file 1');
            await fs.writeFile('deep/file2.txt', 'Subdirectory file 2');
            await fs.writeFile('deep/nested/structure/file.txt', 'Deep nested file content');
            
            console.log('✅ Test files created');
            
            // Wait for unfugit to commit the changes
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error('❌ Error creating test files:', error.message);
        }
    }
}

// Run the tests
const client = new MCPTestClient();
client.runTests().catch(console.error);