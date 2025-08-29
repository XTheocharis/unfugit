#!/usr/bin/env node

/**
 * Comprehensive test script for unfugit_show MCP tool
 * Tests all possible parameters and edge cases
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class UnfugitShowTester {
  constructor() {
    this.projectPath = resolve(process.cwd());
    this.serverPath = resolve('dist/unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.results = [];
    this.commitHashes = [];
  }

  log(message, color = '') {
    const logMessage = `${color}${message}${colors.reset}`;
    console.log(logMessage);
    this.results.push(message);
  }

  async getCommitHashes() {
    try {
      const output = execSync('git log --oneline -10', { 
        cwd: this.projectPath, 
        encoding: 'utf8' 
      });
      this.commitHashes = output.split('\n')
        .filter(line => line.trim())
        .map(line => line.split(' ')[0])
        .slice(0, 5);
      this.log(`Found commit hashes: ${this.commitHashes.join(', ')}`);
    } catch (error) {
      this.log(`Error getting commit hashes: ${error.message}`, colors.red);
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.log('Starting unfugit server...', colors.green);
      
      this.server = spawn('node', [this.serverPath, this.projectPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let initBuffer = '';
      const initTimeout = setTimeout(() => {
        reject(new Error('Server initialization timeout'));
      }, 10000);

      this.server.stdout.on('data', (data) => {
        initBuffer += data.toString();
        const lines = initBuffer.split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              if (message.method === 'notifications/initialized') {
                clearTimeout(initTimeout);
                this.log('Server initialized successfully', colors.green);
                resolve();
                return;
              }
            } catch (e) {
              // Not JSON, continue
            }
          }
        }
      });

      this.server.stderr.on('data', (data) => {
        this.log(`Server stderr: ${data}`, colors.yellow);
      });

      this.server.on('error', (error) => {
        clearTimeout(initTimeout);
        reject(error);
      });

      this.server.on('close', (code) => {
        this.log(`Server closed with code ${code}`, code === 0 ? colors.green : colors.red);
      });

      // Initialize MCP protocol
      const initMessage = {
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'unfugit-show-tester',
            version: '1.0.0'
          }
        }
      };

      this.server.stdin.write(JSON.stringify(initMessage) + '\n');

      // Send initialized notification
      const initializedMessage = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };

      setTimeout(() => {
        this.server.stdin.write(JSON.stringify(initializedMessage) + '\n');
      }, 100);
    });
  }

  async sendToolRequest(toolName, args) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args || {}
        }
      };

      let responseBuffer = '';
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Request timeout'));
        }
      }, 5000);

      const dataHandler = (data) => {
        responseBuffer += data.toString();
        const lines = responseBuffer.split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              if (message.id === requestId) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  this.server.stdout.removeListener('data', dataHandler);
                  resolve(message);
                }
                return;
              }
            } catch (e) {
              // Not JSON, continue
            }
          }
        }
      };

      this.server.stdout.on('data', dataHandler);
      this.server.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async testCase(description, args, expectSuccess = true) {
    this.log(`\n=== TEST: ${description} ===`, colors.cyan);
    this.log(`Arguments: ${JSON.stringify(args, null, 2)}`);
    
    try {
      const response = await this.sendToolRequest('unfugit_show', args);
      
      if (response.result) {
        this.log('✓ SUCCESS', colors.green);
        
        // Log detailed information about the commit
        const result = response.result;
        if (result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            if (item.type === 'text') {
              const text = item.text;
              this.log('Commit Details:', colors.blue);
              this.log(text);
              
              // Parse and extract key information
              const lines = text.split('\n');
              for (const line of lines) {
                if (line.startsWith('commit ')) {
                  this.log(`  Hash: ${line.split(' ')[1]}`, colors.dim);
                } else if (line.startsWith('Author: ')) {
                  this.log(`  ${line}`, colors.dim);
                } else if (line.startsWith('Date: ')) {
                  this.log(`  ${line}`, colors.dim);
                } else if (line.trim() && !line.startsWith('diff ') && !line.startsWith('index ') && !line.startsWith('+++') && !line.startsWith('---') && !line.startsWith('@@')) {
                  if (line.length < 100) { // Only show short lines to avoid spam
                    this.log(`  Message: ${line.trim()}`, colors.dim);
                  }
                }
              }
            }
          }
        }
        
        return { success: true, result: response.result };
      } else if (response.error) {
        const isExpectedError = !expectSuccess;
        this.log(`${isExpectedError ? '✓' : '✗'} ERROR ${isExpectedError ? '(Expected)' : ''}`, isExpectedError ? colors.green : colors.red);
        this.log(`Error: ${response.error.message || JSON.stringify(response.error)}`, colors.red);
        return { success: isExpectedError, error: response.error };
      } else {
        this.log('✗ UNEXPECTED RESPONSE', colors.red);
        this.log(`Response: ${JSON.stringify(response)}`, colors.red);
        return { success: false, error: 'Unexpected response format' };
      }
    } catch (error) {
      const isExpectedError = !expectSuccess;
      this.log(`${isExpectedError ? '✓' : '✗'} EXCEPTION ${isExpectedError ? '(Expected)' : ''}`, isExpectedError ? colors.green : colors.red);
      this.log(`Error: ${error.message}`, colors.red);
      return { success: isExpectedError, error: error.message };
    }
  }

  async runAllTests() {
    await this.getCommitHashes();
    await this.start();

    this.log('\n' + '='.repeat(60), colors.bright);
    this.log('STARTING COMPREHENSIVE unfugit_show TESTS', colors.bright);
    this.log('='.repeat(60), colors.bright);

    const testResults = [];

    // Test 1: Show HEAD commit
    testResults.push(await this.testCase('Show HEAD commit', { ref: 'HEAD' }));

    // Test 2: Show recent commits by hash
    for (let i = 0; i < Math.min(3, this.commitHashes.length); i++) {
      const hash = this.commitHashes[i];
      testResults.push(await this.testCase(`Show commit by hash: ${hash}`, { ref: hash }));
    }

    // Test 3: Show commits with relative refs
    const relativeRefs = ['HEAD~1', 'HEAD~2', 'HEAD^', 'HEAD^^'];
    for (const ref of relativeRefs) {
      testResults.push(await this.testCase(`Show commit with relative ref: ${ref}`, { ref }));
    }

    // Test 4: Show default (no ref parameter)
    testResults.push(await this.testCase('Show default commit (no ref)', {}));

    // Test 5: Test invalid commit hashes (expect failures)
    const invalidHashes = ['invalid123', '0000000', 'nonexistent', 'zzzzzzz'];
    for (const hash of invalidHashes) {
      testResults.push(await this.testCase(`Test invalid commit hash: ${hash}`, { ref: hash }, false));
    }

    // Test 6: Test non-existent refs (expect failures)
    const invalidRefs = ['HEAD~999', 'HEAD~100', 'nonexistent-branch', 'refs/heads/missing'];
    for (const ref of invalidRefs) {
      testResults.push(await this.testCase(`Test non-existent ref: ${ref}`, { ref }, false));
    }

    // Test 7: Test edge cases (expect failures)
    const edgeCases = [
      { ref: '', description: 'empty string ref' },
      { ref: null, description: 'null ref' },
      { ref: undefined, description: 'undefined ref' },
      { ref: 123, description: 'numeric ref' },
      { ref: {}, description: 'object ref' },
      { ref: [], description: 'array ref' }
    ];
    
    for (const testCase of edgeCases) {
      testResults.push(await this.testCase(`Test ${testCase.description}`, { ref: testCase.ref }, false));
    }

    // Test 8: Show initial commit if available
    if (this.commitHashes.length > 0) {
      const lastHash = this.commitHashes[this.commitHashes.length - 1];
      testResults.push(await this.testCase(`Show initial commit: ${lastHash}`, { ref: lastHash }));
    }

    // Summary
    this.log('\n' + '='.repeat(60), colors.bright);
    this.log('TEST SUMMARY', colors.bright);
    this.log('='.repeat(60), colors.bright);

    const successful = testResults.filter(r => r.success).length;
    const total = testResults.length;
    
    this.log(`Total tests run: ${total}`);
    this.log(`Successful tests: ${successful}`, successful === total ? colors.green : colors.yellow);
    this.log(`Failed tests: ${total - successful}`, total - successful === 0 ? colors.green : colors.red);
    this.log(`Success rate: ${((successful / total) * 100).toFixed(1)}%`);

    return testResults;
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      this.server = null;
    }
  }
}

// Main execution
async function main() {
  const tester = new UnfugitShowTester();
  
  try {
    const results = await tester.runAllTests();
    await tester.stop();
    
    // Write results to markdown file
    const markdownContent = `# unfugit_show Comprehensive Test Results\n\n` +
      `Generated: ${new Date().toISOString()}\n\n` +
      `## Summary\n\n` +
      `- Total tests: ${results.length}\n` +
      `- Successful: ${results.filter(r => r.success).length}\n` +
      `- Failed: ${results.filter(r => !r.success).length}\n\n` +
      `## Detailed Results\n\n` +
      tester.results.join('\n');
    
    console.log(`\nTest results will be saved to temp2_show.md`);
    
    return results;
  } catch (error) {
    console.error(`Test execution failed: ${error.message}`);
    await tester.stop();
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, cleaning up...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { UnfugitShowTester };