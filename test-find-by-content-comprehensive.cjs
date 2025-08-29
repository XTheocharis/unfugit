#!/usr/bin/env node

/**
 * Comprehensive test suite for unfugit_find_by_content MCP tool
 * Tests all parameters, options, and edge cases for content search functionality
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Test results will be written to this file
const OUTPUT_FILE = './temp2_find_by_content.md';

class UnfugitTester {
    constructor() {
        this.results = [];
        this.testCount = 0;
        this.passCount = 0;
        this.failCount = 0;
        this.serverProcess = null;
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        console.log(logMessage);
        this.results.push(logMessage);
    }

    async runMCPCommand(tool, args = {}) {
        const command = {
            jsonrpc: "2.0",
            id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            method: "tools/call",
            params: {
                name: tool,
                arguments: args
            }
        };

        const cmdString = `echo '${JSON.stringify(command)}' | node dist/unfugit.js .`;
        
        try {
            const { stdout, stderr } = await execAsync(cmdString, { 
                timeout: 30000,
                cwd: process.cwd()
            });
            
            if (stderr && stderr.trim()) {
                this.log(`STDERR: ${stderr.trim()}`, 'WARN');
            }

            // Parse the JSON response
            const lines = stdout.trim().split('\n').filter(line => line.trim());
            const lastLine = lines[lines.length - 1];
            
            if (!lastLine) {
                throw new Error('No response received');
            }

            const response = JSON.parse(lastLine);
            return response;
        } catch (error) {
            this.log(`Command execution error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async testCase(testName, tool, args, expectedOutcome = 'success') {
        this.testCount++;
        this.log(`\n=== TEST ${this.testCount}: ${testName} ===`);
        this.log(`Tool: ${tool}`);
        this.log(`Arguments: ${JSON.stringify(args, null, 2)}`);

        try {
            const response = await this.runMCPCommand(tool, args);
            
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
                            const data = JSON.parse(content.text);
                            this.log(`Found ${data.commits ? data.commits.length : 0} commits`);
                            
                            this.results.push(`**Result**: SUCCESS - Found ${data.commits ? data.commits.length : 0} commits`);
                            if (data.commits && data.commits.length > 0) {
                                this.results.push('\n**Found commits:**');
                                data.commits.forEach((commit, idx) => {
                                    this.results.push(`- ${idx + 1}. ${commit.hash.substring(0, 8)} - ${commit.message}`);
                                    if (commit.files) {
                                        commit.files.forEach(file => {
                                            this.results.push(`  - ${file.path} (${file.status})`);
                                        });
                                    }
                                });
                            }
                            this.results.push('');
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
        
        // Test 1: Basic string search - search for common content
        await this.testCase(
            'Basic string search for "test"',
            'unfugit_find_by_content',
            { search_string: 'test' }
        );

        // Test 2: Search for specific function names
        await this.testCase(
            'Search for function name "console.log"',
            'unfugit_find_by_content',
            { search_string: 'console.log' }
        );

        // Test 3: Search for code patterns
        await this.testCase(
            'Search for code pattern "function "',
            'unfugit_find_by_content',
            { search_string: 'function ' }
        );

        // Test 4: Case-sensitive search
        await this.testCase(
            'Case-sensitive search for "Test"',
            'unfugit_find_by_content',
            { search_string: 'Test', ignore_case: false }
        );

        // Test 5: Case-insensitive search
        await this.testCase(
            'Case-insensitive search for "TEST"',
            'unfugit_find_by_content',
            { search_string: 'TEST', ignore_case: true }
        );

        // Test 6: Search with file path filter
        await this.testCase(
            'Search in .txt files only',
            'unfugit_find_by_content',
            { search_string: 'test', path_filter: '*.txt' }
        );

        // Test 7: Search with specific path
        await this.testCase(
            'Search in specific file path',
            'unfugit_find_by_content',
            { search_string: 'test', path_filter: 'test-*.txt' }
        );

        // Test 8: Search for quoted strings
        await this.testCase(
            'Search for quoted string',
            'unfugit_find_by_content',
            { search_string: '"hello world"' }
        );

        // Test 9: Search for special characters
        await this.testCase(
            'Search for special characters @#$',
            'unfugit_find_by_content',
            { search_string: '@#$' }
        );

        // Test 10: Search for regex pattern (if supported)
        await this.testCase(
            'Search for regex pattern (if supported)',
            'unfugit_find_by_content',
            { search_string: 'test.*file', use_regex: true }
        );

        // Test 11: Search for very long string
        await this.testCase(
            'Search for long string',
            'unfugit_find_by_content',
            { search_string: 'This is a very long string that might appear in some files and we want to test how the search handles longer content patterns' }
        );

        // Test 12: Empty search string (should error)
        await this.testCase(
            'Empty search string',
            'unfugit_find_by_content',
            { search_string: '' },
            'error'
        );

        // Test 13: Search with limit parameter
        await this.testCase(
            'Search with limit=5',
            'unfugit_find_by_content',
            { search_string: 'test', limit: 5 }
        );

        // Test 14: Search with very small limit
        await this.testCase(
            'Search with limit=1',
            'unfugit_find_by_content',
            { search_string: 'test', limit: 1 }
        );

        // Test 15: Search for newline characters
        await this.testCase(
            'Search for newline patterns',
            'unfugit_find_by_content',
            { search_string: '\\n' }
        );

        // Test 16: Search for code blocks
        await this.testCase(
            'Search for JSON pattern',
            'unfugit_find_by_content',
            { search_string: '{' }
        );

        // Test 17: Search for import statements
        await this.testCase(
            'Search for import statements',
            'unfugit_find_by_content',
            { search_string: 'import' }
        );

        // Test 18: Search for common programming keywords
        await this.testCase(
            'Search for "const" keyword',
            'unfugit_find_by_content',
            { search_string: 'const' }
        );

        // Test 19: Search with unicode characters
        await this.testCase(
            'Search for unicode characters',
            'unfugit_find_by_content',
            { search_string: 'файл' }
        );

        // Test 20: Search for file extensions
        await this.testCase(
            'Search for .js extension',
            'unfugit_find_by_content',
            { search_string: '.js' }
        );

        // Test 21: Search for URL patterns
        await this.testCase(
            'Search for URL patterns',
            'unfugit_find_by_content',
            { search_string: 'http' }
        );

        // Test 22: Search for email patterns
        await this.testCase(
            'Search for @ symbol (email-like)',
            'unfugit_find_by_content',
            { search_string: '@' }
        );

        // Test 23: Search for numbers
        await this.testCase(
            'Search for numbers',
            'unfugit_find_by_content',
            { search_string: '123' }
        );

        // Test 24: Search for whitespace patterns
        await this.testCase(
            'Search for tab character',
            'unfugit_find_by_content',
            { search_string: '\t' }
        );

        // Test 25: Invalid regex pattern (if regex is supported)
        await this.testCase(
            'Invalid regex pattern',
            'unfugit_find_by_content',
            { search_string: '[unclosed', use_regex: true },
            'error'
        );

        // Test 26: Search for git-specific content
        await this.testCase(
            'Search for git hash-like pattern',
            'unfugit_find_by_content',
            { search_string: 'commit' }
        );

        // Test 27: Search for file content that was added then removed
        await this.testCase(
            'Search for content in history',
            'unfugit_find_by_content',
            { search_string: 'temporary' }
        );

        // Test 28: Search with all parameters
        await this.testCase(
            'Search with all parameters',
            'unfugit_find_by_content',
            { 
                search_string: 'test',
                path_filter: '*.txt',
                ignore_case: true,
                limit: 3
            }
        );

        // Test 29: Search for content with spaces
        await this.testCase(
            'Search for content with spaces',
            'unfugit_find_by_content',
            { search_string: 'hello world' }
        );

        // Test 30: Search for specific file types
        await this.testCase(
            'Search in JavaScript files',
            'unfugit_find_by_content',
            { search_string: 'const', path_filter: '*.js' }
        );

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
The \`unfugit_find_by_content\` tool performs pickaxe search to find commits where specific content was added or removed. It searches through the git history to find changes that introduce or remove the specified search string.

## Test Results

`;

        const content = header + this.results.join('\n');
        fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
        this.log(`\nResults written to ${OUTPUT_FILE}`);
    }
}

async function main() {
    const tester = new UnfugitTester();
    
    try {
        await tester.runAllTests();
        await tester.writeResults();
    } catch (error) {
        console.error('Test suite failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}