#!/usr/bin/env node

/**
 * Simple test script for unfugit_ignores MCP tool
 * Tests all aspects of ignore pattern management
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

class UnfugitIgnoresTest {
  constructor(repoPath) {
    this.repoPath = resolve(repoPath);
    this.serverPath = join(process.cwd(), 'dist', 'unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.logFile = join(this.repoPath, 'temp2_ignores.md');
    
    // Clear the log file
    writeFileSync(this.logFile, '# Comprehensive unfugit_ignores Tool Testing Log\n\n');
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
      this.log('Starting unfugit server for comprehensive ignores testing...', colors.green);
      
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

      // Initialize connection
      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: { subscribe: true }, prompts: {} },
          clientInfo: { name: 'unfugit-ignores-test', version: '1.0.0' }
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

  async runComprehensiveTests() {
    this.log('\n## Starting Comprehensive unfugit_ignores Tests\n', colors.bright);

    try {
      // Test 1: List current ignore patterns
      this.log('### Test 1: List Current Ignore Patterns', colors.cyan);
      try {
        const listResult1 = await this.callTool('unfugit_ignores', { mode: 'check' });
        this.log('**Command:** unfugit_ignores with mode=check');
        this.log('**Result:**');
        this.printContent(listResult1);
      } catch (error) {
        this.log(`**Error:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 2: Add basic ignore patterns
      this.log('### Test 2: Add Basic Ignore Patterns', colors.cyan);
      const basicPatterns = ['*.tmp', '*.log', 'temp/', 'build/*'];
      
      for (const pattern of basicPatterns) {
        try {
          const addResult = await this.callTool('unfugit_ignores', { 
            mode: 'add', 
            patterns: [pattern] 
          });
          this.log(`**Command:** Add pattern '${pattern}'`);
          this.log('**Result:** SUCCESS');
          this.printContent(addResult);
        } catch (error) {
          this.log(`**Error adding '${pattern}':** ${error.message}`, colors.red);
        }
        this.log('');
      }

      // Test 3: List patterns after additions
      this.log('### Test 3: List All Patterns After Additions', colors.cyan);
      try {
        const listResult2 = await this.callTool('unfugit_ignores', { mode: 'check' });
        this.log('**Command:** List all patterns after additions');
        this.log('**Result:**');
        this.printContent(listResult2);
      } catch (error) {
        this.log(`**Error:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 4: Add multiple patterns at once
      this.log('### Test 4: Add Multiple Patterns at Once', colors.cyan);
      const multiplePatterns = ['*.old', '*.backup', 'backup/', 'logs/*'];
      try {
        const multiAddResult = await this.callTool('unfugit_ignores', { 
          mode: 'add', 
          patterns: multiplePatterns 
        });
        this.log(`**Command:** Add multiple patterns: ${multiplePatterns.join(', ')}`);
        this.log('**Result:** SUCCESS');
        this.printContent(multiAddResult);
      } catch (error) {
        this.log(`**Error adding multiple patterns:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 5: Add complex patterns with wildcards
      this.log('### Test 5: Add Complex Patterns with Wildcards', colors.cyan);
      const complexPatterns = [
        'node_modules/',
        '**/.DS_Store',
        '*.bak',
        'cache/**',
        'dist/*.js.map',
        '!important.log',
        'test-*/',
        '**/temp*',
        '*.test[0-9]'
      ];
      
      for (const pattern of complexPatterns) {
        try {
          const addResult = await this.callTool('unfugit_ignores', { 
            mode: 'add', 
            patterns: [pattern] 
          });
          this.log(`**Command:** Add complex pattern '${pattern}'`);
          this.log('**Result:** SUCCESS');
          this.printContent(addResult);
        } catch (error) {
          this.log(`**Error adding complex pattern '${pattern}':** ${error.message}`, colors.red);
        }
        this.log('');
      }

      // Test 6: Test patterns with special characters
      this.log('### Test 6: Test Patterns with Special Characters', colors.cyan);
      const specialPatterns = [
        'data-*.json', 
        'file (copy).txt', 
        'path with spaces/', 
        'file.ext~',
        'test@file.txt',
        'file#backup.txt'
      ];
      
      for (const pattern of specialPatterns) {
        try {
          const addResult = await this.callTool('unfugit_ignores', { 
            mode: 'add', 
            patterns: [pattern] 
          });
          this.log(`**Command:** Add special pattern '${pattern}'`);
          this.log('**Result:** SUCCESS');
          this.printContent(addResult);
        } catch (error) {
          this.log(`**Error adding special pattern '${pattern}':** ${error.message}`, colors.red);
        }
        this.log('');
      }

      // Test 7: List all patterns after complex additions
      this.log('### Test 7: List All Patterns After Complex Additions', colors.cyan);
      try {
        const listResult3 = await this.callTool('unfugit_ignores', { mode: 'check' });
        this.log('**Command:** List all patterns after complex additions');
        this.log('**Result:**');
        this.printContent(listResult3);
      } catch (error) {
        this.log(`**Error:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 8: Remove specific patterns
      this.log('### Test 8: Remove Specific Patterns', colors.cyan);
      const patternsToRemove = ['*.tmp', 'temp/', '*.old'];
      
      for (const pattern of patternsToRemove) {
        try {
          const removeResult = await this.callTool('unfugit_ignores', { 
            mode: 'remove', 
            patterns: [pattern] 
          });
          this.log(`**Command:** Remove pattern '${pattern}'`);
          this.log('**Result:** SUCCESS');
          this.printContent(removeResult);
        } catch (error) {
          this.log(`**Error removing pattern '${pattern}':** ${error.message}`, colors.red);
        }
        this.log('');
      }

      // Test 9: List patterns after removals
      this.log('### Test 9: List Patterns After Removals', colors.cyan);
      try {
        const listResult4 = await this.callTool('unfugit_ignores', { mode: 'check' });
        this.log('**Command:** List patterns after removals');
        this.log('**Result:**');
        this.printContent(listResult4);
      } catch (error) {
        this.log(`**Error:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 10: Test adding duplicate patterns
      this.log('### Test 10: Test Adding Duplicate Patterns', colors.cyan);
      try {
        const duplicateResult = await this.callTool('unfugit_ignores', { 
          mode: 'add', 
          patterns: ['*.log', '*.backup'] // These should already exist
        });
        this.log('**Command:** Add duplicate patterns (*.log, *.backup)');
        this.log('**Result:**');
        this.printContent(duplicateResult);
      } catch (error) {
        this.log(`**Error adding duplicate patterns:** ${error.message}`, colors.yellow);
      }
      this.log('');

      // Test 11: Test removing non-existent patterns
      this.log('### Test 11: Test Removing Non-Existent Patterns', colors.cyan);
      try {
        const nonExistentResult = await this.callTool('unfugit_ignores', { 
          mode: 'remove', 
          patterns: ['*.nonexistent', 'fakedir/'] 
        });
        this.log('**Command:** Remove non-existent patterns');
        this.log('**Result:**');
        this.printContent(nonExistentResult);
      } catch (error) {
        this.log(`**Error removing non-existent patterns:** ${error.message}`, colors.yellow);
      }
      this.log('');

      // Test 12: Test invalid patterns
      this.log('### Test 12: Test Invalid Patterns', colors.cyan);
      const invalidPatterns = ['', '   ', '[unclosed bracket'];
      
      for (const pattern of invalidPatterns) {
        try {
          const addResult = await this.callTool('unfugit_ignores', { 
            mode: 'add', 
            patterns: [pattern] 
          });
          this.log(`**Command:** Add invalid pattern '${pattern}'`);
          this.log('**Result:**');
          this.printContent(addResult);
        } catch (error) {
          this.log(`**Expected error for invalid pattern '${pattern}':** ${error.message}`, colors.yellow);
        }
        this.log('');
      }

      // Test 13: Test invalid mode
      this.log('### Test 13: Test Invalid Action', colors.cyan);
      try {
        const invalidResult = await this.callTool('unfugit_ignores', { 
          mode: 'invalid_mode', 
          patterns: ['*.test'] 
        });
        this.log('**Command:** Invalid mode');
        this.log('**Result:**');
        this.printContent(invalidResult);
      } catch (error) {
        this.log(`**Expected error for invalid mode:** ${error.message}`, colors.yellow);
      }
      this.log('');

      // Test 14: Test long patterns
      this.log('### Test 14: Test Very Long Patterns', colors.cyan);
      const longPattern = 'a'.repeat(100) + '/*.txt';
      try {
        const longResult = await this.callTool('unfugit_ignores', { 
          mode: 'add', 
          patterns: [longPattern] 
        });
        this.log(`**Command:** Add very long pattern (100+ chars)`);
        this.log('**Result:**');
        this.printContent(longResult);
      } catch (error) {
        this.log(`**Error with long pattern:** ${error.message}`, colors.red);
      }
      this.log('');

      // Test 15: Create test files to verify ignore functionality
      this.log('### Test 15: Create Test Files to Verify Ignore Functionality', colors.cyan);
      await this.createTestFiles();
      
      // Test 16: Final pattern list
      this.log('### Test 16: Final Pattern List', colors.cyan);
      try {
        const finalList = await this.callTool('unfugit_ignores', { mode: 'check' });
        this.log('**Command:** Final pattern list');
        this.log('**Result:**');
        this.printContent(finalList);
      } catch (error) {
        this.log(`**Error:** ${error.message}`, colors.red);
      }
      this.log('');

      this.log('## Comprehensive unfugit_ignores Testing Complete!', colors.green);
      this.log(`Full test log saved to: ${this.logFile}`, colors.blue);

    } catch (error) {
      this.log(`Test failed: ${error.message}`, colors.red);
    }
  }

  async createTestFiles() {
    this.log('**Creating test files to verify ignore patterns:**');
    
    const testFiles = [
      'test.tmp',
      'test.log', 
      'temp/file.txt',
      'build/output.js',
      'test.backup',
      'backup/file.txt',
      'logs/app.log',
      'important.log',
      'test-dir/file.txt',
      '.DS_Store',
      'file.bak'
    ];

    for (const file of testFiles) {
      try {
        const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : null;
        if (dir && !existsSync(join(this.repoPath, dir))) {
          mkdirSync(join(this.repoPath, dir), { recursive: true });
        }
        writeFileSync(join(this.repoPath, file), `Test content for ${file}`);
        this.log(`Created: ${file}`);
      } catch (error) {
        this.log(`Failed to create ${file}: ${error.message}`, colors.red);
      }
    }
    this.log('');
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
  const tester = new UnfugitIgnoresTest(repoPath);

  try {
    await tester.start();
    await tester.runComprehensiveTests();
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