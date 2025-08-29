#!/usr/bin/env node

/**
 * Advanced test script for unfugit_ignores MCP tool
 * Tests advanced features like 'which' parameter, reset, position, dry_run, etc.
 */

import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class UnfugitIgnoresAdvancedTest {
  constructor(repoPath) {
    this.repoPath = resolve(repoPath);
    this.serverPath = join(process.cwd(), 'dist', 'unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.logFile = join(this.repoPath, 'temp2_ignores.md');
    
    // Append to existing log file
    appendFileSync(this.logFile, '\n\n---\n\n# Advanced unfugit_ignores Testing\n\n');
  }

  log(message, color = '') {
    const logMessage = `${color}${message}${colors.reset}`;
    console.log(logMessage);
    
    // Strip ANSI codes for file logging
    const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
    appendFileSync(this.logFile, cleanMessage + '\n');
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.log('Starting unfugit server for advanced ignores testing...', colors.green);
      
      this.server = spawn('node', [this.serverPath, this.repoPath], {
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
            this.log(`[Server] ${line.trim()}`);
          }
        });
      });

      this.server.on('error', reject);

      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: { subscribe: true }, prompts: {} },
          clientInfo: { name: 'unfugit-ignores-advanced-test', version: '1.0.0' }
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
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    return result;
  }

  printContent(result) {
    if (result && result.content) {
      result.content.forEach(item => {
        if (item.type === 'text') {
          this.log(item.text);
        }
      });
    } else {
      this.log(JSON.stringify(result, null, 2));
    }
  }

  async runAdvancedTests() {
    this.log('\n## Advanced unfugit_ignores Tests\n', colors.bright);

    try {
      // Test 1: Check different 'which' parameter options
      this.log('### Test 1: Check Different Which Parameter Options', colors.cyan);
      
      const whichOptions = ['effective', 'defaults', 'custom'];
      for (const which of whichOptions) {
        try {
          const result = await this.callTool('unfugit_ignores', { mode: 'check', which });
          this.log(`**Command:** mode=check, which=${which}`);
          this.log('**Result:**');
          this.printContent(result);
        } catch (error) {
          this.log(`**Error with which=${which}:** ${error.message}`, colors.red);
        }
        this.log('');
      }

      // Test 2: Test 'position' parameter for adding patterns
      this.log('### Test 2: Test Position Parameter for Adding Patterns', colors.cyan);
      
      const positions = ['prepend', 'append'];
      for (const position of positions) {
        try {
          const result = await this.callTool('unfugit_ignores', { 
            mode: 'add', 
            patterns: [`position-${position}-test.txt`],
            position 
          });
          this.log(`**Command:** Add pattern with position=${position}`);
          this.log('**Result:**');
          this.printContent(result);
        } catch (error) {
          this.log(`**Error with position=${position}:** ${error.message}`, colors.red);
        }
        this.log('');
      }

      // Test 3: Test 'dry_run' parameter
      this.log('### Test 3: Test Dry Run Parameter', colors.cyan);
      try {
        const dryRunResult = await this.callTool('unfugit_ignores', { 
          mode: 'add', 
          patterns: ['dry-run-test.txt'],
          dry_run: true
        });
        this.log('**Command:** Add pattern with dry_run=true');
        this.log('**Result:**');
        this.printContent(dryRunResult);
      } catch (error) {
        this.log(`**Error with dry_run:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 4: Test 'reset' mode
      this.log('### Test 4: Test Reset Mode', colors.cyan);
      try {
        const resetResult = await this.callTool('unfugit_ignores', { mode: 'reset' });
        this.log('**Command:** mode=reset (reset to defaults)');
        this.log('**Result:**');
        this.printContent(resetResult);
      } catch (error) {
        this.log(`**Error with reset:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 5: Check patterns after reset
      this.log('### Test 5: Check Patterns After Reset', colors.cyan);
      try {
        const afterResetResult = await this.callTool('unfugit_ignores', { mode: 'check' });
        this.log('**Command:** mode=check after reset');
        this.log('**Result:**');
        this.printContent(afterResetResult);
      } catch (error) {
        this.log(`**Error checking after reset:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 6: Test reset with 'to' parameter (reset to custom content)
      this.log('### Test 6: Test Reset With Custom Content', colors.cyan);
      try {
        const customResetResult = await this.callTool('unfugit_ignores', { 
          mode: 'reset', 
          to: '*.custom\n*.reset\n# Custom reset content' 
        });
        this.log('**Command:** mode=reset with custom content');
        this.log('**Result:**');
        this.printContent(customResetResult);
      } catch (error) {
        this.log(`**Error with custom reset:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 7: Verify custom reset content
      this.log('### Test 7: Verify Custom Reset Content', colors.cyan);
      try {
        const verifyResult = await this.callTool('unfugit_ignores', { mode: 'check', which: 'custom' });
        this.log('**Command:** Check custom patterns after reset with content');
        this.log('**Result:**');
        this.printContent(verifyResult);
      } catch (error) {
        this.log(`**Error verifying custom reset:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 8: Test edge cases with unicode and special characters
      this.log('### Test 8: Test Unicode and Special Character Patterns', colors.cyan);
      const unicodePatterns = [
        '*.файл',
        '文件.txt',
        'emoji-😀-file.txt',
        'üñíçødé.log'
      ];
      
      for (const pattern of unicodePatterns) {
        try {
          const result = await this.callTool('unfugit_ignores', { 
            mode: 'add', 
            patterns: [pattern] 
          });
          this.log(`**Command:** Add unicode pattern '${pattern}'`);
          this.log('**Result:**');
          this.printContent(result);
        } catch (error) {
          this.log(`**Error with unicode pattern '${pattern}':** ${error.message}`, colors.red);
        }
        this.log('');
      }

      // Test 9: Test maximum pattern limits
      this.log('### Test 9: Test Maximum Pattern Limits', colors.cyan);
      const manyPatterns = [];
      for (let i = 0; i < 150; i++) {  // Try to exceed limits
        manyPatterns.push(`limit-test-${i}.txt`);
      }
      
      try {
        const limitResult = await this.callTool('unfugit_ignores', { 
          mode: 'add', 
          patterns: manyPatterns 
        });
        this.log('**Command:** Add 150 patterns to test limits');
        this.log('**Result:**');
        this.printContent(limitResult);
      } catch (error) {
        this.log(`**Expected error for too many patterns:** ${error.message}`, colors.yellow);
      }
      this.log('');

      // Test 10: Test missing required parameters
      this.log('### Test 10: Test Missing Required Parameters', colors.cyan);
      try {
        const missingResult = await this.callTool('unfugit_ignores', {});
        this.log('**Command:** Call with no parameters');
        this.log('**Result:**');
        this.printContent(missingResult);
      } catch (error) {
        this.log(`**Expected error for missing parameters:** ${error.message}`, colors.yellow);
      }
      this.log('');

      // Test 11: Test invalid parameter combinations
      this.log('### Test 11: Test Invalid Parameter Combinations', colors.cyan);
      try {
        const invalidResult = await this.callTool('unfugit_ignores', { 
          mode: 'check', 
          patterns: ['should-not-be-here.txt'] 
        });
        this.log('**Command:** mode=check with patterns (invalid combination)');
        this.log('**Result:**');
        this.printContent(invalidResult);
      } catch (error) {
        this.log(`**Expected error for invalid combination:** ${error.message}`, colors.yellow);
      }
      this.log('');

      // Test 12: Final comprehensive check
      this.log('### Test 12: Final Comprehensive Check', colors.cyan);
      for (const which of ['effective', 'defaults', 'custom']) {
        try {
          const result = await this.callTool('unfugit_ignores', { mode: 'check', which });
          this.log(`**Final ${which} patterns:**`);
          this.printContent(result);
          this.log('');
        } catch (error) {
          this.log(`**Error checking ${which}:** ${error.message}`, colors.red);
        }
      }

      this.log('## Advanced unfugit_ignores Testing Complete!', colors.green);

    } catch (error) {
      this.log(`Test failed: ${error.message}`, colors.red);
    }
  }

  stop() {
    if (this.server) {
      this.server.kill();
      this.server = null;
    }
  }
}

async function main() {
  const repoPath = process.argv[2] || '.';
  const tester = new UnfugitIgnoresAdvancedTest(repoPath);

  try {
    await tester.start();
    await tester.runAdvancedTests();
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  } finally {
    tester.stop();
  }
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});