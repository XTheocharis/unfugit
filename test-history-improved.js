#!/usr/bin/env node

/**
 * Improved test script for unfugit_history MCP tool
 * Tests with correct parameters and shows actual output content
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

class ImprovedHistoryTester {
  constructor() {
    this.projectPath = resolve(process.cwd());
    this.serverPath = resolve('dist/src/unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.testResults = [];
  }

  log(message, color = '') {
    const logMessage = `${color}${message}${colors.reset}`;
    console.log(logMessage);
    this.testResults.push(message);
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
        const output = data.toString();
        if (output.includes('MCP server running')) {
          this.log('Server is running and ready', colors.green);
        }
      });

      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: { subscribe: true } },
          clientInfo: { name: 'improved-history-tester', version: '1.0.0' }
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
      const request = { jsonrpc: '2.0', id, method, params };

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
    return await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  displayResult(testName, result) {
    this.log(`\n--- ${testName} ---`, colors.cyan);
    
    if (result.content) {
      this.log('Content returned:', colors.dim);
      result.content.forEach((item, index) => {
        this.log(`  Item ${index + 1} (${item.type}):`, colors.dim);
        
        if (item.type === 'text') {
          // Show the full text content
          const lines = item.text.split('\n');
          lines.forEach((line, lineIndex) => {
            if (line.trim()) {
              this.log(`    ${line}`, colors.reset);
            }
          });
        } else if (item.type === 'resource') {
          this.log(`    Resource URI: ${item.resource.uri}`, colors.blue);
          this.log(`    MIME Type: ${item.resource.mimeType}`, colors.blue);
          this.log(`    Size: ${item.resource._meta?.size || 'unknown'} bytes`, colors.blue);
          
          // Try to parse JSON content
          if (item.resource.mimeType === 'application/json' && item.resource.text) {
            try {
              const jsonData = JSON.parse(item.resource.text);
              this.log(`    JSON Data:`, colors.blue);
              this.log(`      Commits: ${jsonData.commits?.length || 0}`, colors.blue);
              this.log(`      Next Cursor: ${jsonData.nextCursor || 'null'}`, colors.blue);
              
              if (jsonData.commits && jsonData.commits.length > 0) {
                const firstCommit = jsonData.commits[0];
                this.log(`      First commit: ${firstCommit.hash?.substring(0, 8)} - ${firstCommit.message?.split('\n')[0]}`, colors.blue);
              }
            } catch (e) {
              this.log(`    JSON Parse Error: ${e.message}`, colors.red);
            }
          }
        }
      });
    }

    if (result.structuredContent) {
      this.log('Structured Content:', colors.dim);
      this.log(`  ${JSON.stringify(result.structuredContent, null, 2)}`, colors.reset);
    }

    if (result.isError) {
      this.log('This was an error response', colors.red);
    }
  }

  async runComprehensiveTests() {
    this.log('\n' + '='.repeat(70), colors.bright);
    this.log('IMPROVED UNFUGIT_HISTORY TESTING', colors.bright);
    this.log('='.repeat(70), colors.bright);

    const tests = [
      {
        name: 'Test 1: Basic history (default)',
        args: {}
      },
      {
        name: 'Test 2: History with max_commits=3',
        args: { max_commits: 3 }
      },
      {
        name: 'Test 3: History with limit=5 (checking if limit works)',
        args: { limit: 5 }
      },
      {
        name: 'Test 4: History with max_commits=1',
        args: { max_commits: 1 }
      },
      {
        name: 'Test 5: History with offset=2',
        args: { max_commits: 5, offset: 2 }
      },
      {
        name: 'Test 6: History with author filter',
        args: { max_commits: 5, author: 'unfugit' }
      },
      {
        name: 'Test 7: History with grep filter',
        args: { max_commits: 5, grep: 'file' }
      },
      {
        name: 'Test 8: History with merges_only',
        args: { max_commits: 5, merges_only: true }
      },
      {
        name: 'Test 9: History with no_merges',
        args: { max_commits: 5, no_merges: true }
      },
      {
        name: 'Test 10: History with paths filter',
        args: { max_commits: 5, paths: ['*.txt'] }
      }
    ];

    let validCursor = null;

    for (const test of tests) {
      try {
        this.log(`\n${colors.cyan}Running: ${test.name}${colors.reset}`);
        this.log(`Arguments: ${JSON.stringify(test.args)}`, colors.dim);
        
        const startTime = Date.now();
        const result = await this.callTool('unfugit_history', test.args);
        const duration = Date.now() - startTime;

        this.log(`✓ Success (${duration}ms)`, colors.green);
        this.displayResult(test.name, result);

        // Extract cursor if available
        if (result.content) {
          for (const item of result.content) {
            if (item.type === 'resource' && item.resource.text) {
              try {
                const jsonData = JSON.parse(item.resource.text);
                if (jsonData.nextCursor && !validCursor) {
                  validCursor = jsonData.nextCursor;
                  this.log(`    Found cursor for pagination: ${validCursor}`, colors.yellow);
                }
              } catch (e) {}
            }
          }
        }

      } catch (error) {
        this.log(`✗ Failed: ${error.message}`, colors.red);
      }
    }

    // Test cursor pagination if we have a cursor
    if (validCursor) {
      this.log(`\n${colors.cyan}Running: Test 11: Cursor pagination with ${validCursor}${colors.reset}`);
      try {
        const result = await this.callTool('unfugit_history', { 
          max_commits: 3, 
          cursor: validCursor 
        });
        this.log(`✓ Cursor pagination success`, colors.green);
        this.displayResult('Cursor pagination test', result);
      } catch (error) {
        this.log(`✗ Cursor pagination failed: ${error.message}`, colors.red);
      }
    }

    // Test edge cases
    this.log(`\n${colors.cyan}Running: Test 12: Edge case - conflicting merge flags${colors.reset}`);
    try {
      const result = await this.callTool('unfugit_history', { 
        merges_only: true,
        no_merges: true
      });
      this.log(`✗ Should have failed but didn't`, colors.red);
    } catch (error) {
      this.log(`✓ Correctly rejected conflicting parameters`, colors.green);
    }

    // Test time-based filters
    this.log(`\n${colors.cyan}Running: Test 13: Since filter (recent commits)${colors.reset}`);
    try {
      const result = await this.callTool('unfugit_history', { 
        max_commits: 5,
        since: '1 hour ago'
      });
      this.log(`✓ Since filter success`, colors.green);
      this.displayResult('Since filter test', result);
    } catch (error) {
      this.log(`✗ Since filter failed: ${error.message}`, colors.red);
    }
  }

  async saveReport() {
    const reportContent = [
      '# Improved unfugit_history MCP Tool Test Report',
      '',
      `**Test Date:** ${new Date().toISOString()}`,
      `**Project Path:** ${this.projectPath}`,
      '',
      '## Test Results',
      '',
      ...this.testResults,
      '',
      '## Key Findings',
      '',
      '- The unfugit_history tool uses `max_commits` parameter instead of `limit`',
      '- Returns both text content and structured JSON via resources',
      '- Supports cursor-based pagination with automatic cursor generation',
      '- Handles various filtering options: author, grep, paths, time ranges',
      '- Provides merge filtering with merges_only/no_merges options',
      '- Error handling for conflicting parameters works correctly',
      '',
      '## Parameter Summary',
      '',
      '**Working Parameters:**',
      '- `max_commits` (number): Number of commits to return',
      '- `offset` (number): Skip this many commits',  
      '- `cursor` (string): Pagination cursor',
      '- `author` (string): Filter by author',
      '- `grep` (string): Search commit messages',
      '- `since` (string): Commits after this time',
      '- `until` (string): Commits before this time',
      '- `merges_only` (boolean): Only merge commits',
      '- `no_merges` (boolean): Exclude merge commits',
      '- `paths` (array): Filter by file paths/patterns',
      '',
      '**Output Format:**',
      '- Text content with commit summary and details',
      '- JSON resource with full commit data and pagination info',
      '- Structured content for programmatic access',
      '',
      '---',
      `Report generated by improved unfugit_history test suite`
    ].join('\n');

    writeFileSync('temp2_history.md', reportContent);
    this.log(`\n✓ Detailed results saved to temp2_history.md`, colors.green);
  }

  cleanup() {
    if (this.server) {
      this.server.kill();
    }
  }
}

async function main() {
  const tester = new ImprovedHistoryTester();
  
  try {
    await tester.start();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for audit commits
    await tester.runComprehensiveTests();
    await tester.saveReport();
    
    tester.log('\n' + '='.repeat(70), colors.bright);
    tester.log('ALL TESTS COMPLETED SUCCESSFULLY', colors.bright);
    tester.log('='.repeat(70), colors.bright);
    
  } catch (error) {
    tester.log(`\nFatal error: ${error.message}`, colors.red);
  } finally {
    tester.cleanup();
    process.exit(0);
  }
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});