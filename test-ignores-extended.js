#!/usr/bin/env node

/**
 * Extended test script for unfugit_ignores MCP tool
 * Tests additional features: reset, which options, position, dry_run, etc.
 */

import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { appendFileSync } from 'fs';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class UnfugitIgnoresExtendedTest {
  constructor(repoPath) {
    this.repoPath = resolve(repoPath);
    this.serverPath = join(process.cwd(), 'dist', 'src', 'unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.logFile = join(this.repoPath, 'temp2_ignores.md');
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
      this.log('\n## Extended unfugit_ignores Tests\n', colors.bright);
      
      this.server = spawn('node', [this.serverPath, this.repoPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.server.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.server.stderr.on('data', (data) => {
        // Ignore stderr for cleaner output
      });

      this.server.on('error', reject);

      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: { subscribe: true }, prompts: {} },
          clientInfo: { name: 'unfugit-ignores-extended', version: '1.0.0' }
        }).then(() => {
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
            reject(new Error(message.error.message));
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
    if (result.content) {
      result.content.forEach(item => {
        if (item.type === 'text') {
          this.log(item.text);
        }
      });
    } else {
      this.log(JSON.stringify(result, null, 2));
    }
  }

  async runExtendedTests() {
    try {
      // Test E1: Check different 'which' options
      this.log('### Test E1: Test Different "which" Options', colors.cyan);
      
      const whichOptions = ['effective', 'defaults', 'custom'];
      for (const which of whichOptions) {
        try {
          const result = await this.callTool('unfugit_ignores', { 
            mode: 'check',
            which: which
          });
          this.log(`**Command:** Check with which='${which}'`);
          this.log('**Result:**');
          this.printContent(result);
          this.log('');
        } catch (error) {
          this.log(`**Error with which='${which}':** ${error.message}`, colors.red);
          this.log('');
        }
      }

      // Test E2: Test dry_run mode
      this.log('### Test E2: Test dry_run Mode', colors.cyan);
      try {
        const result = await this.callTool('unfugit_ignores', { 
          mode: 'add',
          patterns: ['*.dry', 'dry-test/'],
          dry_run: true
        });
        this.log('**Command:** Add patterns with dry_run=true');
        this.log('**Result:**');
        this.printContent(result);
        this.log('');
      } catch (error) {
        this.log(`**Error with dry_run:** ${error.message}`, colors.red);
        this.log('');
      }

      // Test E3: Test position parameter (prepend vs append)
      this.log('### Test E3: Test Position Parameter', colors.cyan);
      
      const positions = ['prepend', 'append'];
      for (const position of positions) {
        try {
          const result = await this.callTool('unfugit_ignores', { 
            mode: 'add',
            patterns: [`pos-${position}.txt`],
            position: position
          });
          this.log(`**Command:** Add pattern with position='${position}'`);
          this.log('**Result:**');
          this.printContent(result);
          this.log('');
        } catch (error) {
          this.log(`**Error with position='${position}':** ${error.message}`, colors.red);
          this.log('');
        }
      }

      // Test E4: Test reset functionality
      this.log('### Test E4: Test Reset Functionality', colors.cyan);
      
      // Add some patterns first
      await this.callTool('unfugit_ignores', { 
        mode: 'add',
        patterns: ['before-reset.txt', 'another-before.log']
      });
      
      // Test reset
      try {
        const result = await this.callTool('unfugit_ignores', { 
          mode: 'reset'
        });
        this.log('**Command:** Reset all custom patterns');
        this.log('**Result:**');
        this.printContent(result);
        this.log('');
      } catch (error) {
        this.log(`**Error with reset:** ${error.message}`, colors.red);
        this.log('');
      }

      // Test E5: Check after reset
      this.log('### Test E5: Check Patterns After Reset', colors.cyan);
      try {
        const result = await this.callTool('unfugit_ignores', { 
          mode: 'check',
          which: 'custom'
        });
        this.log('**Command:** Check custom patterns after reset');
        this.log('**Result:**');
        this.printContent(result);
        this.log('');
      } catch (error) {
        this.log(`**Error checking after reset:** ${error.message}`, colors.red);
        this.log('');
      }

      // Test E6: Test adding duplicate patterns
      this.log('### Test E6: Test Duplicate Patterns', colors.cyan);
      
      // Add pattern first time
      await this.callTool('unfugit_ignores', { 
        mode: 'add',
        patterns: ['duplicate.txt']
      });
      
      // Try to add same pattern again
      try {
        const result = await this.callTool('unfugit_ignores', { 
          mode: 'add',
          patterns: ['duplicate.txt', 'new-pattern.txt', 'duplicate.txt']
        });
        this.log('**Command:** Add patterns including duplicates');
        this.log('**Result:**');
        this.printContent(result);
        this.log('');
      } catch (error) {
        this.log(`**Error with duplicates:** ${error.message}`, colors.red);
        this.log('');
      }

      // Test E7: Test removing multiple patterns at once
      this.log('### Test E7: Test Remove Multiple Patterns', colors.cyan);
      
      // Add several patterns first
      await this.callTool('unfugit_ignores', { 
        mode: 'add',
        patterns: ['multi1.txt', 'multi2.txt', 'multi3.txt']
      });
      
      // Remove multiple
      try {
        const result = await this.callTool('unfugit_ignores', { 
          mode: 'remove',
          patterns: ['multi1.txt', 'multi2.txt', 'nonexistent.txt']
        });
        this.log('**Command:** Remove multiple patterns (some nonexistent)');
        this.log('**Result:**');
        this.printContent(result);
        this.log('');
      } catch (error) {
        this.log(`**Error removing multiple:** ${error.message}`, colors.red);
        this.log('');
      }

      // Test E8: Test edge cases with pattern validation
      this.log('### Test E8: Test Edge Cases and Pattern Validation', colors.cyan);
      
      const edgePatterns = [
        '/',                    // Root path
        './',                   // Current dir
        '../',                  // Parent dir
        '**/',                  // All directories
        '!**/*.important',      // Negation with globstar
        '*.{js,ts,jsx,tsx}',    // Brace expansion
        'file[0-9][0-9].txt',   // Character class
        'path/to/*/file.txt',   // Single wildcard in path
      ];
      
      for (const pattern of edgePatterns) {
        try {
          const result = await this.callTool('unfugit_ignores', { 
            mode: 'add',
            patterns: [pattern]
          });
          this.log(`**Command:** Add edge case pattern '${pattern}'`);
          this.log('**Result:**');
          this.printContent(result);
          this.log('');
        } catch (error) {
          this.log(`**Error with edge pattern '${pattern}':** ${error.message}`, colors.red);
          this.log('');
        }
      }

      // Test E9: Test gitignore integration
      this.log('### Test E9: Test .gitignore Integration', colors.cyan);
      
      // Check if there's a difference between effective and custom
      try {
        const effective = await this.callTool('unfugit_ignores', { 
          mode: 'check',
          which: 'effective'
        });
        
        const custom = await this.callTool('unfugit_ignores', { 
          mode: 'check',
          which: 'custom'
        });
        
        const defaults = await this.callTool('unfugit_ignores', { 
          mode: 'check',
          which: 'defaults'
        });
        
        this.log('**Analysis of ignore pattern sources:**');
        this.log(`Effective rules count: ${JSON.parse(effective.content[0].text).rules.length}`);
        this.log(`Custom rules count: ${JSON.parse(custom.content[0].text).rules.length}`);
        this.log(`Default rules count: ${JSON.parse(defaults.content[0].text).rules.length}`);
        this.log('');
      } catch (error) {
        this.log(`**Error analyzing ignore sources:** ${error.message}`, colors.red);
        this.log('');
      }

      // Test E10: Final comprehensive check
      this.log('### Test E10: Final Comprehensive Status', colors.cyan);
      try {
        const finalResult = await this.callTool('unfugit_ignores', { 
          mode: 'check',
          which: 'effective'
        });
        this.log('**Command:** Final comprehensive status check');
        this.log('**Result:**');
        this.printContent(finalResult);
        this.log('');
      } catch (error) {
        this.log(`**Error in final check:** ${error.message}`, colors.red);
        this.log('');
      }

      this.log('## Extended unfugit_ignores Testing Complete!', colors.green);

    } catch (error) {
      this.log(`Extended test failed: ${error.message}`, colors.red);
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
  const tester = new UnfugitIgnoresExtendedTest(repoPath);

  try {
    await tester.start();
    await tester.runExtendedTests();
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