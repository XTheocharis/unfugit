#!/usr/bin/env node

/**
 * Interactive test client for unfugit MCP server
 * Allows manual testing of unfugit against any repository
 */

import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import * as readline from 'readline';

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

class InteractiveUnfugitClient {
  constructor(repoPath, serverPath) {
    this.repoPath = resolve(repoPath);
    this.serverPath = serverPath || join(process.cwd(), 'dist', 'unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.initialized = false;
    this.tools = [];
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.cyan}unfugit> ${colors.reset}`
    });
  }

  log(message, color = '') {
    console.log(`${color}${message}${colors.reset}`);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.log(`Starting unfugit server for: ${this.repoPath}`, colors.green);
      
      if (!existsSync(this.repoPath)) {
        reject(new Error(`Repository path does not exist: ${this.repoPath}`));
        return;
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
            name: 'unfugit-interactive-client',
            version: '1.0.0'
          }
        }).then(() => {
          this.initialized = true;
          this.log('✓ Server initialized successfully', colors.green);
          
          // Get available tools
          return this.sendRequest('tools/list', {});
        }).then(response => {
          this.tools = response.tools || [];
          this.log(`Available tools: ${this.tools.length}`, colors.blue);
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
        } else if (message.method === 'notifications/message') {
          const level = message.params?.level || 'info';
          const data = message.params?.data || {};
          if (level !== 'debug') {
            this.log(`[${level}] ${data.message || JSON.stringify(data)}`, colors.yellow);
          }
        }
      } catch (_e) {
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
      }, 10000);
    });
  }

  async callTool(toolName, args = {}) {
    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      return result;
    } catch (_error) {
      throw error;
    }
  }

  printHelp() {
    this.log('\n=== Available Commands ===', colors.bright);
    this.log('help                     - Show this help message');
    this.log('tools                    - List available tools');
    this.log('ping                     - Test server connectivity');
    this.log('history [limit]          - Show commit history');
    this.log('stats                    - Show repository statistics');
    this.log('diff <from> <to>         - Show diff between refs');
    this.log('show <ref>               - Show commit details');
    this.log('search <term>            - Search for content changes');
    this.log('get <ref> <path>         - Get file content at ref');
    this.log('timeline <path>          - Show file timeline');
    this.log('ignores                  - List ignore patterns');
    this.log('resources                - List available resources');
    this.log('raw <tool> [json-args]   - Call any tool with raw JSON args');
    this.log('exit                     - Exit the interactive client');
    this.log('');
  }

  async handleCommand(input) {
    const parts = input.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    
    if (!command) return;
    
    try {
      switch (command) {
        case 'help':
        case '?':
          this.printHelp();
          break;
          
        case 'tools':
          this.log('\n=== Available Tools ===', colors.bright);
          this.tools.forEach(tool => {
            this.log(`• ${tool.name}`, colors.cyan);
            if (tool.description) {
              this.log(`  ${tool.description.substring(0, 70)}...`, colors.dim);
            }
          });
          break;
          
        case 'ping':
          const ping = await this.callTool('ping');
          this.log('Server ping response:', colors.green);
          console.log(JSON.stringify(ping, null, 2));
          break;
          
        case 'history':
          const limit = parseInt(parts[1]) || 10;
          const history = await this.callTool('unfugit_history', { limit });
          this.log(`\n=== Commit History (last ${limit}) ===`, colors.bright);
          
          if (history.content) {
            history.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'stats':
          const stats = await this.callTool('unfugit_stats');
          this.log('\n=== Repository Statistics ===', colors.bright);
          if (stats.content) {
            stats.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'diff':
          if (parts.length < 3) {
            this.log('Usage: diff <from_ref> <to_ref>', colors.red);
            break;
          }
          const diff = await this.callTool('unfugit_diff', {
            from_ref: parts[1],
            to_ref: parts[2],
            stat_only: parts[3] === '--stat'
          });
          this.log(`\n=== Diff ${parts[1]}..${parts[2]} ===`, colors.bright);
          if (diff.content) {
            diff.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'show':
          if (!parts[1]) {
            this.log('Usage: show <ref>', colors.red);
            break;
          }
          const show = await this.callTool('unfugit_show', {
            ref: parts[1],
            stat: true
          });
          this.log(`\n=== Commit ${parts[1]} ===`, colors.bright);
          if (show.content) {
            show.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'search':
          if (!parts[1]) {
            this.log('Usage: search <term>', colors.red);
            break;
          }
          const searchTerm = parts.slice(1).join(' ');
          const search = await this.callTool('unfugit_find_by_content', {
            term: searchTerm,
            context_lines: 2
          });
          this.log(`\n=== Search Results for "${searchTerm}" ===`, colors.bright);
          if (search.content) {
            search.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'get':
          if (parts.length < 3) {
            this.log('Usage: get <ref> <path>', colors.red);
            break;
          }
          const get = await this.callTool('unfugit_get', {
            ref: parts[1],
            path: parts.slice(2).join(' ')
          });
          this.log(`\n=== File ${parts.slice(2).join(' ')} at ${parts[1]} ===`, colors.bright);
          if (get.content) {
            get.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'timeline':
          if (!parts[1]) {
            this.log('Usage: timeline <path>', colors.red);
            break;
          }
          const timeline = await this.callTool('unfugit_timeline', {
            path: parts.slice(1).join(' '),
            limit: 10
          });
          this.log(`\n=== Timeline for ${parts.slice(1).join(' ')} ===`, colors.bright);
          if (timeline.content) {
            timeline.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'ignores':
          const ignores = await this.callTool('unfugit_ignores', {
            mode: 'list'
          });
          this.log('\n=== Ignore Patterns ===', colors.bright);
          if (ignores.content) {
            ignores.content.forEach(item => {
              if (item.type === 'text') {
                console.log(item.text);
              }
            });
          }
          break;
          
        case 'resources':
          const resources = await this.sendRequest('resources/list', {});
          this.log('\n=== Available Resources ===', colors.bright);
          if (resources.resources) {
            resources.resources.forEach(r => {
              this.log(`• ${r.uri}`, colors.cyan);
              this.log(`  ${r.name}`, colors.dim);
            });
          }
          break;
          
        case 'raw':
          if (parts.length < 2) {
            this.log('Usage: raw <tool_name> [json_args]', colors.red);
            break;
          }
          const toolName = parts[1];
          let args = {};
          if (parts.length > 2) {
            try {
              args = JSON.parse(parts.slice(2).join(' '));
            } catch (_e) {
              this.log('Invalid JSON arguments', colors.red);
              break;
            }
          }
          const rawResult = await this.callTool(toolName, args);
          console.log(JSON.stringify(rawResult, null, 2));
          break;
          
        case 'exit':
        case 'quit':
          this.log('Goodbye!', colors.green);
          process.exit(0);
          break;
          
        default:
          this.log(`Unknown command: ${command}. Type 'help' for available commands.`, colors.red);
      }
    } catch (_error) {
      this.log(`Error: ${error.message}`, colors.red);
    }
  }

  async startInteractive() {
    this.printHelp();
    
    this.rl.on('line', async (input) => {
      await this.handleCommand(input);
      this.rl.prompt();
    });
    
    this.rl.on('close', () => {
      this.log('\nExiting...', colors.yellow);
      if (this.server) {
        this.server.kill();
      }
      process.exit(0);
    });
    
    this.rl.prompt();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${colors.bright}Interactive Unfugit Test Client${colors.reset}`);
    console.log(`Usage: node test-interactive.js <path-to-repo> [path-to-unfugit.js]`);
    console.log('\nExamples:');
    console.log('  node test-interactive.js .');
    console.log('  node test-interactive.js /path/to/my-project');
    process.exit(1);
  }

  const repoPath = args[0];
  const serverPath = args[1];

  const client = new InteractiveUnfugitClient(repoPath, serverPath);

  try {
    await client.start();
    await client.startInteractive();
  } catch (_error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});