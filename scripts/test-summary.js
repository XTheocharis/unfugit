#!/usr/bin/env node

/**
 * Quick summary test for unfugit against various repositories
 * Shows key metrics for each repository tested
 */

import { spawn } from 'child_process';
import { resolve, join, basename } from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';

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

class QuickTest {
  constructor(repoPath) {
    this.repoPath = resolve(repoPath);
    this.serverPath = join(process.cwd(), 'dist', 'unfugit.js');
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      if (!existsSync(this.repoPath)) {
        reject(new Error(`Path not found: ${this.repoPath}`));
        return;
      }

      this.server = spawn('node', [this.serverPath, this.repoPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.server.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.server.stderr.on('data', () => {
        // Suppress stderr output
      });

      this.server.on('error', (error) => {
        reject(error);
      });

      // Initialize
      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: { subscribe: true },
            prompts: {}
          },
          clientInfo: {
            name: 'unfugit-quick-test',
            version: '1.0.0'
          }
        }).then(() => resolve()).catch(reject);
      }, 500);
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
      } catch (_e) {
        // Ignore non-JSON
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
          reject(new Error(`Timeout`));
        }
      }, 5000);
    });
  }

  async callTool(toolName, args = {}) {
    try {
      return await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });
    } catch {
      return null;
    }
  }

  async getQuickStats() {
    const stats = {
      path: this.repoPath,
      name: basename(this.repoPath),
      server_ok: false,
      commits: 0,
      role: 'unknown',
      resources: 0,
      errors: []
    };

    try {
      // Get stats
      const serverStats = await this.callTool('unfugit_stats');
      if (serverStats?.structuredContent?.auditRepo) {
        stats.server_ok = true;
      }
      if (serverStats?.content?.[0]?.text) {
        const text = serverStats.content[0].text;
        const roleMatch = text.match(/role: (\w+)/);
        const commitsMatch = text.match(/(\d+) commits/);
        
        if (roleMatch) stats.role = roleMatch[1];
        if (commitsMatch) stats.commits = parseInt(commitsMatch[1]);
      }

      // Get resources
      const resources = await this.sendRequest('resources/list', {});
      if (resources?.resources) {
        stats.resources = resources.resources.length;
      }

      // Get history
      const history = await this.callTool('unfugit_history', { limit: 1 });
      if (history?.content?.[0]?.text) {
        const text = history.content[0].text;
        if (text.includes('error')) {
          stats.errors.push('History fetch error');
        }
      }

    } catch (_error) {
      stats.errors.push(error.message);
    }

    return stats;
  }

  async stop() {
    if (this.server) {
      this.server.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

async function testRepository(repoPath) {
  const test = new QuickTest(repoPath);
  
  try {
    await test.start();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Let server stabilize
    const stats = await test.getQuickStats();
    await test.stop();
    return stats;
  } catch (_error) {
    await test.stop();
    return {
      path: repoPath,
      name: basename(repoPath),
      server_ok: false,
      error: error.message
    };
  }
}

async function main() {
  console.log(`${colors.blue}${colors.bright}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}${colors.bright}     unfugit Quick Test Summary${colors.reset}`);
  console.log(`${colors.blue}${colors.bright}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const repos = [
    '/home/user/.claude/mcp-servers/autogit',
    '/home/user/.claude/mcp-servers/unfugit',
    '/home/user/.claude/mcp-servers/polyglot-mcp',
    process.cwd() // Current directory
  ];

  const results = [];
  
  for (const repo of repos) {
    if (!existsSync(repo)) continue;
    
    process.stdout.write(`Testing ${colors.cyan}${basename(repo)}${colors.reset}... `);
    const stats = await testRepository(repo);
    results.push(stats);
    
    if (stats.server_ok) {
      console.log(`${colors.green}✓${colors.reset}`);
    } else {
      console.log(`${colors.red}✗${colors.reset}`);
    }
  }

  // Display results table
  console.log(`\n${colors.bright}Results:${colors.reset}`);
  console.log('─'.repeat(70));
  console.log(`${'Repository'.padEnd(25)} ${'Status'.padEnd(8)} ${'Role'.padEnd(10)} ${'Commits'.padEnd(10)} ${'Resources'}`);
  console.log('─'.repeat(70));
  
  for (const result of results) {
    const name = result.name.substring(0, 24).padEnd(25);
    const status = result.server_ok ? `${colors.green}OK${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    const role = result.role.padEnd(10);
    const commits = result.commits.toString().padEnd(10);
    const resources = result.resources.toString();
    
    console.log(`${name} ${status.padEnd(17)} ${role} ${commits} ${resources}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`  ${colors.yellow}⚠ ${result.errors.join(', ')}${colors.reset}`);
    }
  }
  
  console.log('─'.repeat(70));

  // Summary
  const successful = results.filter(r => r.server_ok).length;
  const failed = results.length - successful;
  
  console.log(`\n${colors.bright}Summary:${colors.reset}`);
  console.log(`  Total tested: ${results.length}`);
  console.log(`  ${colors.green}✓ Successful: ${successful}${colors.reset}`);
  if (failed > 0) {
    console.log(`  ${colors.red}✗ Failed: ${failed}${colors.reset}`);
  }
  
  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});