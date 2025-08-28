#!/usr/bin/env node

/**
 * Test script for unfugit MCP server
 * Usage: node test-any-repo.js [path-to-git-repo]
 * 
 * This script starts the unfugit server with the specified repository
 * and runs various test queries against it.
 */

import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
// Removed unused readdir import

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

class UnfugitTester {
  constructor(repoPath, serverPath) {
    this.repoPath = resolve(repoPath);
    this.serverPath = serverPath || join(process.cwd(), 'dist', 'unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.initialized = false;
    this.tools = [];
    this.resources = [];
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const levelColors = {
      'INFO': colors.green,
      'DEBUG': colors.dim,
      'ERROR': colors.red,
      'WARN': colors.yellow,
      'TEST': colors.cyan,
      'RESULT': colors.magenta
    };
    
    const color = levelColors[level] || '';
    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}${level.padEnd(6)}${colors.reset} ${message}`);
    
    if (data) {
      const jsonStr = JSON.stringify(data, null, 2);
      const lines = jsonStr.split('\n');
      lines.forEach(line => {
        console.log(`${colors.dim}        ${line}${colors.reset}`);
      });
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.log('INFO', `Starting unfugit server for repository: ${this.repoPath}`);
      
      if (!existsSync(this.repoPath)) {
        reject(new Error(`Repository path does not exist: ${this.repoPath}`));
        return;
      }

      if (!existsSync(join(this.repoPath, '.git'))) {
        this.log('WARN', 'No .git directory found, unfugit will create audit repo');
      }

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
          if (line.trim()) {
            this.log('DEBUG', `Server: ${line.trim()}`);
          }
        });
      });

      this.server.on('error', (error) => {
        this.log('ERROR', `Failed to start server: ${error.message}`);
        reject(error);
      });

      this.server.on('exit', (code, signal) => {
        this.log('INFO', `Server exited with code ${code}, signal ${signal}`);
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
            name: 'unfugit-test-client',
            version: '1.0.0'
          }
        }).then(() => {
          this.initialized = true;
          this.log('INFO', 'Server initialized successfully');
          
          // List tools
          this.sendRequest('tools/list', {}).then(response => {
            this.tools = response.tools || [];
            this.log('INFO', `Available tools: ${this.tools.length}`);
            this.tools.forEach(tool => {
              this.log('DEBUG', `  - ${tool.name}: ${tool.description?.substring(0, 60)}...`);
            });
            
            resolve();
          });
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
          const { resolve, reject, method } = this.pendingRequests.get(message.id);
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            this.log('ERROR', `Response error for ${method}:`, message.error);
            reject(new Error(message.error.message));
          } else {
            this.log('DEBUG', `Response for ${method} (id: ${message.id})`);
            resolve(message.result);
          }
        } else if (message.method === 'notifications/message') {
          const level = message.params?.level || 'info';
          const data = message.params?.data || {};
          if (level !== 'debug') {
            this.log('INFO', `Notification: ${data.message || JSON.stringify(data)}`);
          }
        } else if (message.method === 'notifications/resources/updated') {
          this.log('DEBUG', 'Resources updated notification received');
        }
      } catch (parseError) {
        // Not JSON, might be server startup message
        this.log('DEBUG', `Parse error: ${parseError.message}`);
        if (!line.includes('MCP server running')) {
          this.log('DEBUG', `Non-JSON output: ${line}`);
        }
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

      this.pendingRequests.set(id, { resolve, reject, method });
      this.log('DEBUG', `Sending request: ${method} (id: ${id})`);
      
      this.server.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 10000);
    });
  }

  async callTool(toolName, args = {}) {
    this.log('TEST', `Calling tool: ${toolName}`);
    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      
      if (result.content) {
        result.content.forEach(item => {
          if (item.type === 'text') {
            this.log('RESULT', item.text.substring(0, 200) + (item.text.length > 200 ? '...' : ''));
          }
        });
      }
      
      return result;
    } catch (error) {
      this.log('ERROR', `Tool call failed: ${error.message}`);
      return null;
    }
  }

  async runTests() {
    this.log('INFO', `${colors.bright}=== Starting unfugit Tests ===${colors.reset}`);
    
    // Test 1: Get stats
    this.log('TEST', 'Test 1: Get server stats');
    const stats = await this.callTool('unfugit_stats');
    if (stats?.structuredContent) {
      this.log('RESULT', 'Server stats:', stats.structuredContent);
    }

    // Test 2: Get history
    this.log('TEST', 'Test 2: Get commit history');
    const history = await this.callTool('unfugit_history', {
      limit: 5
    });
    if (history?.structuredContent?.commits) {
      this.log('RESULT', `Found ${history.structuredContent.commits.length} commits`);
      history.structuredContent.commits.forEach(commit => {
        this.log('DEBUG', `  ${commit.short_hash} - ${commit.subject}`);
      });
    }

    // Test 3: Get statistics
    this.log('TEST', 'Test 3: Get repository statistics');
    const detailedStats = await this.callTool('unfugit_stats');
    if (detailedStats?.structuredContent) {
      const s = detailedStats.structuredContent;
      this.log('RESULT', `Commits: ${s.audit_commits}, Files: ${s.unique_files_tracked}, Role: ${s.session_role}`);
    }

    // Test 4: Search for content
    this.log('TEST', 'Test 4: Search for content changes');
    const search = await this.callTool('unfugit_find_by_content', {
      term: 'TODO',  // Changed from 'search' to 'term'
      context_lines: 2
    });
    if (search?.structuredContent?.matches) {
      this.log('RESULT', `Found ${search.structuredContent.matches.length} matches for "TODO"`);
    }

    // Test 5: Show latest commit
    this.log('TEST', 'Test 5: Show latest commit details');
    const show = await this.callTool('unfugit_show', {
      ref: 'HEAD',
      stat: true
    });
    if (show?.structuredContent?.commit) {
      const c = show.structuredContent.commit;
      this.log('RESULT', `Latest: ${c.hash?.substring(0, 8)} - ${c.subject}`);
      if (show.structuredContent.stats) {
        this.log('DEBUG', `  Files changed: ${show.structuredContent.stats.files_changed}`);
      }
    }

    // Test 6: Get diff between commits
    this.log('TEST', 'Test 6: Get diff between HEAD~1 and HEAD');
    const diff = await this.callTool('unfugit_diff', {
      from_ref: 'HEAD~1',
      to_ref: 'HEAD',
      stat_only: true
    });
    if (diff?.structuredContent?.stats) {
      const s = diff.structuredContent.stats;
      this.log('RESULT', `Changes: +${s.insertions} -${s.deletions} in ${s.files_changed} files`);
    }

    // Test 7: Check ignore patterns
    this.log('TEST', 'Test 7: Check ignore patterns');
    const ignores = await this.callTool('unfugit_ignores', {
      mode: 'list'  // Changed from 'action' to 'mode'
    });
    if (ignores?.structuredContent?.patterns) {
      this.log('RESULT', `Active ignore patterns: ${ignores.structuredContent.patterns.length}`);
      ignores.structuredContent.patterns.slice(0, 5).forEach(p => {
        this.log('DEBUG', `  - ${p}`);
      });
    }

    // Test 8: Timeline for a file
    this.log('TEST', 'Test 8: Get timeline for a file');
    // First, let's find a file to track
    if (history?.structuredContent?.commits?.length > 0) {
      const firstCommit = history.structuredContent.commits[0];
      if (firstCommit.files?.length > 0) {
        const file = firstCommit.files[0];
        this.log('DEBUG', `  Tracking timeline for: ${file}`);
        const timeline = await this.callTool('unfugit_timeline', {
          path: file,
          limit: 5
        });
        if (timeline?.structuredContent?.entries) {
          this.log('RESULT', `Timeline entries: ${timeline.structuredContent.entries.length}`);
        }
      }
    }

    // Test 9: List resources
    this.log('TEST', 'Test 9: List available resources');
    const resources = await this.sendRequest('resources/list', {});
    if (resources?.resources) {
      this.log('RESULT', `Available resources: ${resources.resources.length}`);
      resources.resources.slice(0, 5).forEach(r => {
        this.log('DEBUG', `  - ${r.uri}: ${r.name}`);
      });
    }

    this.log('INFO', `${colors.bright}=== Tests Completed ===${colors.reset}`);
  }

  async stop() {
    if (this.server) {
      this.log('INFO', 'Stopping server...');
      this.server.kill('SIGTERM');
      
      // Give it time to cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!this.server.killed) {
        this.server.kill('SIGKILL');
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${colors.bright}Usage: node test-any-repo.js <path-to-git-repo> [path-to-unfugit.js]${colors.reset}`);
    console.log('\nExamples:');
    console.log('  node test-any-repo.js .');
    console.log('  node test-any-repo.js /path/to/my-project');
    console.log('  node test-any-repo.js ~/projects/my-repo dist/unfugit.js');
    process.exit(1);
  }

  const repoPath = args[0];
  const serverPath = args[1];

  const tester = new UnfugitTester(repoPath, serverPath);

  try {
    await tester.start();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Let server stabilize
    await tester.runTests();
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
    await tester.stop();
  }
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});