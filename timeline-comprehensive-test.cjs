#!/usr/bin/env node

// Comprehensive test script for unfugit_timeline MCP tool
// Tests all parameters and edge cases extensively

const { spawn } = require('child_process');
const { promises: fs } = require('fs');
const path = require('path');

class TimelineTestRunner {
    constructor() {
        this.serverProcess = null;
        this.testResults = [];
        this.logFile = 'temp3_timeline.md';
    }

    async log(message, isHeader = false) {
        const timestamp = new Date().toISOString();
        const formatted = isHeader ? 
            `\n## ${message}\n*${timestamp}*\n` : 
            `${message}\n`;
        
        console.log(message);
        await fs.appendFile(this.logFile, formatted);
    }

    async startServer() {
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', ['dist/unfugit.js', process.cwd()], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let initialized = false;
            this.serverProcess.stdout.on('data', (data) => {
                if (!initialized && data.toString().includes('unfugit')) {
                    initialized = true;
                    resolve();
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('listening') && !initialized) {
                    initialized = true;
                    resolve();
                }
            });

            setTimeout(() => {
                if (!initialized) {
                    reject(new Error('Server failed to initialize within 5 seconds'));
                }
            }, 5000);
        });
    }

    async sendMCPRequest(method, params = {}) {
        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        };

        const startTime = Date.now();
        
        return new Promise((resolve) => {
            this.serverProcess.stdin.write(JSON.stringify(request) + '\n');

            const timeout = setTimeout(() => {
                resolve({
                    error: 'Timeout after 10 seconds',
                    responseTime: Date.now() - startTime
                });
            }, 10000);

            const dataHandler = (data) => {
                const responseTime = Date.now() - startTime;
                clearTimeout(timeout);
                this.serverProcess.stdout.removeListener('data', dataHandler);

                try {
                    const response = JSON.parse(data.toString());
                    resolve({
                        ...response,
                        responseTime
                    });
                } catch (e) {
                    resolve({
                        error: `Parse error: ${e.message}`,
                        responseTime,
                        raw: data.toString()
                    });
                }
            };

            this.serverProcess.stdout.on('data', dataHandler);
        });
    }

    async setupTestFiles() {
        await this.log('Setting Up Test Files', true);
        
        // Create various test files for timeline testing
        const testFiles = [
            // Simple files that will be modified
            { path: 'timeline-simple.txt', content: 'Simple timeline test file\nVersion 1' },
            { path: 'timeline-code.py', content: 'def hello():\n    print("Hello v1")' },
            { path: 'timeline-config.json', content: '{"version": 1, "name": "test"}' },
            
            // Files in subdirectories
            { path: 'subdir/timeline-nested.txt', content: 'Nested file for timeline\nInitial version' },
            { path: 'deep/nested/timeline-deep.txt', content: 'Deep nested timeline file' },
            
            // Unicode and special character files
            { path: 'timeline-файл-测试.txt', content: 'Unicode filename test\n初期版本' },
            { path: 'timeline file with spaces.txt', content: 'File with spaces in name' },
            { path: 'timeline-special@#$%^&().txt', content: 'Special characters in filename' },
            
            // Different file types
            { path: 'timeline-large.txt', content: 'Large file content\n'.repeat(1000) + 'End of large content' },
            { path: 'timeline-binary.bin', content: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Array(100).fill(0xFF)]) },
            { path: 'timeline-empty.txt', content: '' },
            
            // Files that will be renamed
            { path: 'timeline-original-name.txt', content: 'This file will be renamed multiple times\nOriginal content' },
            { path: 'timeline-source.md', content: '# Timeline Source\nThis will become target.md' }
        ];

        // Ensure directories exist
        const dirs = ['subdir', 'deep/nested'];
        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true }).catch(() => {});
        }

        // Create all test files
        for (const file of testFiles) {
            if (Buffer.isBuffer(file.content)) {
                await fs.writeFile(file.path, file.content);
            } else {
                await fs.writeFile(file.path, file.content, 'utf8');
            }
            await this.log(`Created: ${file.path} (${file.content.length} bytes)`);
        }

        // Wait for auto-commit
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async createRenameHistory() {
        await this.log('Creating Rename History', true);

        // Create complex rename chain: original -> renamed1 -> renamed2 -> final
        const renameSteps = [
            { from: 'timeline-original-name.txt', to: 'timeline-renamed-v1.txt' },
            { from: 'timeline-renamed-v1.txt', to: 'timeline-renamed-v2.txt' },
            { from: 'timeline-renamed-v2.txt', to: 'timeline-final-name.txt' },
            { from: 'timeline-source.md', to: 'timeline-target.md' }
        ];

        for (let i = 0; i < renameSteps.length; i++) {
            const step = renameSteps[i];
            try {
                // Modify content before rename to create meaningful history
                const currentContent = await fs.readFile(step.from, 'utf8');
                const newContent = currentContent + `\nModification ${i + 1} before rename`;
                await fs.writeFile(step.from, newContent, 'utf8');
                
                // Wait for auto-commit
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Perform rename
                await fs.rename(step.from, step.to);
                await this.log(`Renamed: ${step.from} → ${step.to}`);
                
                // Wait for auto-commit
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Modify after rename
                const renamedContent = await fs.readFile(step.to, 'utf8');
                await fs.writeFile(step.to, renamedContent + `\nPost-rename modification ${i + 1}`, 'utf8');
                
                // Wait for auto-commit
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                await this.log(`Rename error ${step.from} -> ${step.to}: ${error.message}`);
            }
        }
    }

    async modifyFilesForHistory() {
        await this.log('Creating File History Through Modifications', true);

        const filesToModify = [
            'timeline-simple.txt',
            'timeline-code.py',
            'timeline-config.json',
            'subdir/timeline-nested.txt',
            'timeline-large.txt'
        ];

        // Create 10 modifications for each file to build substantial history
        for (let version = 2; version <= 11; version++) {
            for (const filePath of filesToModify) {
                try {
                    const exists = await fs.access(filePath).then(() => true).catch(() => false);
                    if (!exists) continue;

                    const currentContent = await fs.readFile(filePath, 'utf8');
                    let newContent;
                    
                    if (filePath.endsWith('.py')) {
                        newContent = currentContent.replace(/v\d+/, `v${version}`) + `\n# Added in version ${version}`;
                    } else if (filePath.endsWith('.json')) {
                        const json = JSON.parse(currentContent);
                        json.version = version;
                        json[`feature_${version}`] = `Added in v${version}`;
                        newContent = JSON.stringify(json, null, 2);
                    } else {
                        newContent = currentContent + `\nVersion ${version} - ${new Date().toISOString()}`;
                    }
                    
                    await fs.writeFile(filePath, newContent, 'utf8');
                    await new Promise(resolve => setTimeout(resolve, 200)); // Brief pause for commits
                } catch (error) {
                    await this.log(`Error modifying ${filePath} v${version}: ${error.message}`);
                }
            }
            await this.log(`Completed version ${version} modifications`);
        }

        // Wait for final auto-commits
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    async runTimelineTest(testName, path, params = {}) {
        const startTime = Date.now();
        
        await this.log(`\n### Test: ${testName}`);
        await this.log(`**Path:** \`${path}\``);
        await this.log(`**Parameters:** \`${JSON.stringify(params)}\``);

        const response = await this.sendMCPRequest('tools/call', {
            name: 'unfugit_timeline',
            arguments: {
                path,
                ...params
            }
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        await this.log(`**Response Time:** ${responseTime}ms`);

        if (response.error) {
            await this.log(`**❌ ERROR:** ${response.error}`);
            return { success: false, error: response.error, responseTime };
        }

        if (response.result?.content) {
            const content = response.result.content[0]?.text || 'No text content';
            await this.log(`**✅ SUCCESS**`);
            await this.log(`**Timeline Entries:** ${(content.match(/└─/g) || []).length}`);
            
            // Analyze timeline depth and rename detection
            const timelineLines = content.split('\n');
            const commits = timelineLines.filter(line => line.includes('└─') || line.includes('├─')).length;
            const renames = timelineLines.filter(line => line.includes('renamed') || line.includes('→')).length;
            
            await this.log(`**Commits Found:** ${commits}`);
            await this.log(`**Renames Detected:** ${renames}`);
            
            // Log a sample of the timeline for verification
            const sampleLines = timelineLines.slice(0, 10);
            await this.log(`**Sample Timeline:**`);
            await this.log('```');
            for (const line of sampleLines) {
                await this.log(line);
            }
            if (timelineLines.length > 10) {
                await this.log(`... (${timelineLines.length - 10} more lines)`);
            }
            await this.log('```');
            
            return { 
                success: true, 
                responseTime, 
                commits, 
                renames, 
                totalLines: timelineLines.length,
                content: content.substring(0, 500) // Store sample for analysis
            };
        } else {
            await this.log(`**⚠️ UNEXPECTED RESPONSE**`);
            await this.log(`\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``);
            return { success: false, error: 'Unexpected response format', responseTime };
        }
    }

    async runAllTests() {
        try {
            // Initialize log file
            await fs.writeFile(this.logFile, '# Comprehensive unfugit_timeline MCP Tool Test Results\n\n');
            await this.log('Starting comprehensive timeline testing...', true);

            await this.startServer();
            await this.log('✅ Server started successfully');

            await this.setupTestFiles();
            await this.createRenameHistory();
            await this.modifyFilesForHistory();

            const tests = [
                // Basic functionality tests
                {
                    name: 'Simple file timeline',
                    path: 'timeline-simple.txt',
                    params: {}
                },
                {
                    name: 'Python code file timeline',
                    path: 'timeline-code.py',
                    params: {}
                },
                {
                    name: 'JSON config file timeline',
                    path: 'timeline-config.json',
                    params: {}
                },
                
                // Renamed file tests
                {
                    name: 'Final renamed file (should show complete rename chain)',
                    path: 'timeline-final-name.txt',
                    params: {}
                },
                {
                    name: 'Markdown rename chain',
                    path: 'timeline-target.md',
                    params: {}
                },
                
                // Directory tests
                {
                    name: 'Nested subdirectory file',
                    path: 'subdir/timeline-nested.txt',
                    params: {}
                },
                {
                    name: 'Deep nested file',
                    path: 'deep/nested/timeline-deep.txt',
                    params: {}
                },
                
                // Unicode and special characters
                {
                    name: 'Unicode filename',
                    path: 'timeline-файл-测试.txt',
                    params: {}
                },
                {
                    name: 'Filename with spaces',
                    path: 'timeline file with spaces.txt',
                    params: {}
                },
                {
                    name: 'Special characters filename',
                    path: 'timeline-special@#$%^&().txt',
                    params: {}
                },
                
                // Different file types
                {
                    name: 'Large text file',
                    path: 'timeline-large.txt',
                    params: {}
                },
                {
                    name: 'Binary file',
                    path: 'timeline-binary.bin',
                    params: {}
                },
                {
                    name: 'Empty file',
                    path: 'timeline-empty.txt',
                    params: {}
                },
                
                // Limit parameter tests
                {
                    name: 'Limited to 1 result',
                    path: 'timeline-simple.txt',
                    params: { limit: 1 }
                },
                {
                    name: 'Limited to 3 results',
                    path: 'timeline-code.py',
                    params: { limit: 3 }
                },
                {
                    name: 'Limited to 5 results',
                    path: 'timeline-config.json',
                    params: { limit: 5 }
                },
                {
                    name: 'Large limit (25 results)',
                    path: 'timeline-large.txt',
                    params: { limit: 25 }
                },
                
                // Offset parameter tests (pagination)
                {
                    name: 'Pagination - Skip first 2 results',
                    path: 'timeline-simple.txt',
                    params: { offset: 2 }
                },
                {
                    name: 'Pagination - Skip first 5, limit to 3',
                    path: 'timeline-code.py',
                    params: { offset: 5, limit: 3 }
                },
                {
                    name: 'Pagination - Skip first 10',
                    path: 'timeline-large.txt',
                    params: { offset: 10 }
                },
                
                // Edge cases and error conditions
                {
                    name: 'Non-existent file',
                    path: 'does-not-exist.txt',
                    params: {}
                },
                {
                    name: 'Non-existent directory file',
                    path: 'missing/dir/file.txt',
                    params: {}
                },
                {
                    name: 'Zero limit',
                    path: 'timeline-simple.txt',
                    params: { limit: 0 }
                },
                {
                    name: 'Negative limit',
                    path: 'timeline-simple.txt',
                    params: { limit: -5 }
                },
                {
                    name: 'Very large limit',
                    path: 'timeline-simple.txt',
                    params: { limit: 10000 }
                },
                {
                    name: 'Negative offset',
                    path: 'timeline-simple.txt',
                    params: { offset: -1 }
                },
                {
                    name: 'Very large offset',
                    path: 'timeline-simple.txt',
                    params: { offset: 1000 }
                },
                
                // Performance tests
                {
                    name: 'Performance test - Complex rename chain with large limit',
                    path: 'timeline-final-name.txt',
                    params: { limit: 100 }
                },
                {
                    name: 'Performance test - Large file with complex history',
                    path: 'timeline-large.txt',
                    params: { limit: 50 }
                }
            ];

            let successCount = 0;
            let totalTests = tests.length;

            for (let i = 0; i < tests.length; i++) {
                const test = tests[i];
                await this.log(`\n---\n**Test ${i + 1}/${totalTests}**`);
                
                const result = await this.runTimelineTest(test.name, test.path, test.params);
                this.testResults.push({
                    ...test,
                    ...result
                });
                
                if (result.success) {
                    successCount++;
                }
                
                // Small delay between tests
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Generate summary
            await this.log('\n---\n', true);
            await this.log('Test Summary', true);
            await this.log(`**Total Tests:** ${totalTests}`);
            await this.log(`**Successful:** ${successCount}`);
            await this.log(`**Failed:** ${totalTests - successCount}`);
            await this.log(`**Success Rate:** ${((successCount / totalTests) * 100).toFixed(1)}%`);

            // Performance analysis
            const responseTimes = this.testResults.filter(r => r.responseTime).map(r => r.responseTime);
            if (responseTimes.length > 0) {
                const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
                const maxTime = Math.max(...responseTimes);
                const minTime = Math.min(...responseTimes);
                
                await this.log(`\n**Performance Analysis:**`);
                await this.log(`- Average Response Time: ${avgTime.toFixed(1)}ms`);
                await this.log(`- Fastest Response: ${minTime}ms`);
                await this.log(`- Slowest Response: ${maxTime}ms`);
            }

            // Rename detection analysis
            const renameTests = this.testResults.filter(r => r.renames && r.renames > 0);
            if (renameTests.length > 0) {
                await this.log(`\n**Rename Detection Analysis:**`);
                await this.log(`- Tests with renames detected: ${renameTests.length}`);
                await this.log(`- Total renames found: ${renameTests.reduce((sum, t) => sum + t.renames, 0)}`);
            }

            // Detailed results for failed tests
            const failedTests = this.testResults.filter(r => !r.success);
            if (failedTests.length > 0) {
                await this.log('\n**Failed Test Details:**', true);
                for (const test of failedTests) {
                    await this.log(`**${test.name}**`);
                    await this.log(`- Path: ${test.path}`);
                    await this.log(`- Params: ${JSON.stringify(test.params)}`);
                    await this.log(`- Error: ${test.error}`);
                    await this.log('');
                }
            }

            await this.log(`\n✅ Timeline testing completed! Results saved to: ${this.logFile}`);

        } catch (error) {
            await this.log(`\n❌ Test execution failed: ${error.message}`);
            console.error('Test execution error:', error);
        } finally {
            if (this.serverProcess) {
                this.serverProcess.kill();
            }
        }
    }
}

// Run the tests
const runner = new TimelineTestRunner();
runner.runAllTests().catch(console.error);