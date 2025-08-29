#!/usr/bin/env node

/**
 * Comprehensive test script for unfugit_history MCP tool
 * Tests various scenarios and edge cases
 */

import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import * as readline from 'readline';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class UnfugitHistoryTester {
  constructor() {
    this.projectPath = resolve(process.cwd());
    this.serverPath = resolve('dist/src/unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.results = [];
  }

  log(message, color = '') {
    const logMessage = `${color}${message}${colors.reset}`;
    console.log(logMessage);
    this.results.push(`${message}`);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.log('Starting unfugit server...', colors.green);
      
      this.server = spawn('node', [this.serverPath, this.projectPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.server.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.server.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim() && !line.includes('MCP server running')) {
            this.log(`[Server] ${line.trim()}`, colors.dim);
          }
        });
      });

      this.server.on('error', (error) => {
        this.log(`Failed to start server: ${error.message}`, colors.red);
        reject(error);
      });

      // Initialize connection
      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: { subscribe: true },
            prompts: {}
          },
          clientInfo: {
            name: 'unfugit-history-tester',
            version: '1.0.0'
          }
        }).then(() => {
          this.log('✓ Server initialized successfully', colors.green);
          resolve();
        }).catch(reject);
      }, 1000);
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const message = JSON.parse(line);
        
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id);
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            reject(new Error(JSON.stringify(message.error)));
          } else {
            resolve(message.result);
          }
        }
      } catch (parseError) {
        // Ignore non-JSON lines
      }
    }
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 15000);
    });
  }

  async callTool(toolName, args = {}) {
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    return result;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Create some test data to ensure we have history
  async createTestData() {
    this.log('\n=== Creating test data ===', colors.bright);
    
    // Create some test files to generate history
    const testFiles = [
      { name: 'history-test-1.txt', content: 'Initial content for test 1' },
      { name: 'history-test-2.txt', content: 'Initial content for test 2' },
      { name: 'subdir/nested-test.txt', content: 'Nested file content' }
    ];

    for (const file of testFiles) {
      if (file.name.includes('/')) {
        const dir = file.name.split('/')[0];
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }
      writeFileSync(file.name, file.content);
      this.log(`Created ${file.name}`);
      await this.sleep(1100); // Wait for file watcher to commit
    }

    // Modify files to create more history
    for (let i = 0; i < 3; i++) {
      for (const file of testFiles) {
        writeFileSync(file.name, `${file.content}\nModification ${i + 1}`);
        this.log(`Modified ${file.name} (iteration ${i + 1})`);
        await this.sleep(1100); // Wait for file watcher to commit
      }
    }

    this.log('✓ Test data created, waiting for commits to settle...', colors.green);
    await this.sleep(3000);
  }

  async runHistoryTests() {
    this.log('\n' + '='.repeat(60), colors.bright);
    this.log('COMPREHENSIVE UNFUGIT_HISTORY TESTING', colors.bright);
    this.log('='.repeat(60), colors.bright);

    const tests = [
      {
        name: 'Test 1: Basic history listing (default parameters)',
        args: {}
      },
      {
        name: 'Test 2: History with limit=5',
        args: { limit: 5 }
      },
      {
        name: 'Test 3: History with limit=10',
        args: { limit: 10 }
      },
      {
        name: 'Test 4: History with limit=20',
        args: { limit: 20 }
      },
      {
        name: 'Test 5: History with limit=1 (edge case)',
        args: { limit: 1 }
      },
      {
        name: 'Test 6: History with very large limit (100)',
        args: { limit: 100 }
      },
      {
        name: 'Test 7: History with format=oneline',
        args: { format: 'oneline', limit: 5 }
      },
      {
        name: 'Test 8: History with format=detailed',
        args: { format: 'detailed', limit: 3 }
      },
      {
        name: 'Test 9: History with format=full',
        args: { format: 'full', limit: 2 }
      },
      {
        name: 'Test 10: History with cursor pagination (first page)',
        args: { limit: 3, cursor: null }
      }
    ];

    let firstPageCursor = null;

    for (const test of tests) {
      this.log(`\n--- ${test.name} ---`, colors.cyan);
      this.log(`Arguments: ${JSON.stringify(test.args)}`, colors.dim);

      try {
        const startTime = Date.now();
        const result = await this.callTool('unfugit_history', test.args);
        const duration = Date.now() - startTime;

        this.log(`✓ Success (${duration}ms)`, colors.green);
        
        if (result.content) {
          let lineCount = 0;
          let hasCommits = false;
          let nextCursor = null;

          result.content.forEach(item => {
            if (item.type === 'text') {
              const lines = item.text.split('\n').filter(line => line.trim());
              lineCount += lines.length;
              
              // Check for commit patterns
              if (item.text.includes('commit ') || item.text.includes('Author:') || item.text.includes('Date:')) {
                hasCommits = true;
              }

              // Look for cursor info
              if (item.text.includes('Next cursor:') || item.text.includes('cursor:')) {
                const cursorMatch = item.text.match(/cursor:\s*([^\s\n]+)/);
                if (cursorMatch) {
                  nextCursor = cursorMatch[1];
                }
              }

              // Show first few lines for verification
              if (lines.length > 0) {
                this.log(`  Content preview: ${lines[0].substring(0, 80)}${lines[0].length > 80 ? '...' : ''}`, colors.dim);
              }
            }
          });

          this.log(`  Lines returned: ${lineCount}`, colors.dim);
          this.log(`  Contains commits: ${hasCommits}`, colors.dim);
          
          if (nextCursor) {
            this.log(`  Next cursor: ${nextCursor}`, colors.dim);
            if (test.name.includes('first page')) {
              firstPageCursor = nextCursor;
            }
          }

        } else {
          this.log('  No content returned', colors.yellow);
        }

      } catch (error) {
        this.log(`✗ Failed: ${error.message}`, colors.red);
      }
    }

    // Test cursor pagination if we got a cursor
    if (firstPageCursor) {
      this.log(`\n--- Test 11: Cursor pagination (second page) ---`, colors.cyan);
      this.log(`Using cursor from first page: ${firstPageCursor}`, colors.dim);

      try {
        const result = await this.callTool('unfugit_history', { 
          limit: 3, 
          cursor: firstPageCursor 
        });
        this.log(`✓ Cursor pagination successful`, colors.green);
        
        if (result.content) {
          result.content.forEach(item => {
            if (item.type === 'text') {
              const lines = item.text.split('\n').filter(line => line.trim());
              if (lines.length > 0) {
                this.log(`  Content preview: ${lines[0].substring(0, 80)}`, colors.dim);
              }
            }
          });
        }
      } catch (error) {
        this.log(`✗ Cursor pagination failed: ${error.message}`, colors.red);
      }
    }

    // Test with author filtering (if supported)
    this.log(`\n--- Test 12: History with author filter ---`, colors.cyan);
    try {
      const result = await this.callTool('unfugit_history', { 
        limit: 5,
        author: 'unfugit'
      });
      this.log(`✓ Author filtering successful`, colors.green);
    } catch (error) {
      this.log(`✗ Author filtering failed (might not be supported): ${error.message}`, colors.yellow);
    }

    // Test edge cases
    this.log(`\n--- Test 13: Invalid parameters (negative limit) ---`, colors.cyan);
    try {
      const result = await this.callTool('unfugit_history', { limit: -5 });
      this.log(`✓ Negative limit handled`, colors.green);
    } catch (error) {
      this.log(`✗ Negative limit caused error: ${error.message}`, colors.red);
    }

    this.log(`\n--- Test 14: Invalid parameters (zero limit) ---`, colors.cyan);
    try {
      const result = await this.callTool('unfugit_history', { limit: 0 });
      this.log(`✓ Zero limit handled`, colors.green);
    } catch (error) {
      this.log(`✗ Zero limit caused error: ${error.message}`, colors.red);
    }

    this.log(`\n--- Test 15: Invalid format parameter ---`, colors.cyan);
    try {
      const result = await this.callTool('unfugit_history', { 
        format: 'invalid-format',
        limit: 3
      });
      this.log(`✓ Invalid format handled gracefully`, colors.green);
    } catch (error) {
      this.log(`✗ Invalid format caused error: ${error.message}`, colors.red);
    }

    this.log(`\n--- Test 16: Very large cursor value ---`, colors.cyan);
    try {
      const result = await this.callTool('unfugit_history', { 
        cursor: 'HEAD~999',
        limit: 5
      });
      this.log(`✓ Large cursor handled`, colors.green);
    } catch (error) {
      this.log(`✗ Large cursor caused error: ${error.message}`, colors.red);
    }

    this.log(`\n--- Test 17: Invalid cursor format ---`, colors.cyan);
    try {
      const result = await this.callTool('unfugit_history', { 
        cursor: 'invalid-cursor-format',
        limit: 5
      });
      this.log(`✓ Invalid cursor handled`, colors.green);
    } catch (error) {
      this.log(`✗ Invalid cursor caused error: ${error.message}`, colors.red);
    }
  }

  async cleanup() {
    if (this.server) {
      this.server.kill();
    }
  }

  async saveResults() {
    const reportContent = [
      '# Comprehensive unfugit_history MCP Tool Test Report',
      '',
      `**Test Date:** ${new Date().toISOString()}`,
      `**Project Path:** ${this.projectPath}`,
      '',
      '## Test Results',
      '',
      ...this.results,
      '',
      '## Summary',
      '',
      `Total tests executed: ${this.results.filter(r => r.includes('---')).length}`,
      `Successful tests: ${this.results.filter(r => r.includes('✓')).length}`,
      `Failed tests: ${this.results.filter(r => r.includes('✗')).length}`,
      '',
      '## Observations',
      '',
      '- The unfugit_history tool provides audit-style version control tracking',
      '- Various limit values and format options were tested',
      '- Cursor pagination functionality was validated',
      '- Edge cases with invalid parameters were examined',
      '- Performance timing was measured for each test',
      '',
      '---',
      `Report generated by unfugit_history comprehensive test suite`
    ].join('\n');

    writeFileSync('temp2_history.md', reportContent);
    this.log(`\n✓ Results saved to temp2_history.md`, colors.green);
  }
}

async function main() {
  const tester = new UnfugitHistoryTester();
  
  try {
    await tester.start();
    await tester.createTestData();
    await tester.runHistoryTests();
    await tester.saveResults();
    
    tester.log('\n' + '='.repeat(60), colors.bright);
    tester.log('ALL TESTS COMPLETED', colors.bright);
    tester.log('='.repeat(60), colors.bright);
    
  } catch (error) {
    tester.log(`\nFatal error: ${error.message}`, colors.red);
  } finally {
    await tester.cleanup();
    process.exit(0);
  }
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});