#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;

class ActiveModeTest {
  constructor() {
    this.serverProcess = null;
  }

  async startServer() {
    console.log('Starting Unfugit server in active mode...');
    this.serverProcess = spawn('node', ['dist/unfugit.js', '.'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('Server started with PID:', this.serverProcess.pid);
  }

  async stopServer() {
    if (this.serverProcess && !this.serverProcess.killed) {
      this.serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async sendMCPMessage(method, params = {}) {
    const message = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: method,
      params: params
    };

    const messageStr = JSON.stringify(message) + '\n';
    
    return new Promise((resolve, reject) => {
      let responseData = '';
      let timeout;
      
      const cleanup = () => {
        this.serverProcess.stdout.removeListener('data', onData);
        if (timeout) clearTimeout(timeout);
      };
      
      const onData = (data) => {
        responseData += data.toString();
        const lines = responseData.split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === message.id) {
                cleanup();
                resolve(response);
                return;
              }
            } catch (e) {
              // Not complete JSON yet
            }
          }
        }
      };
      
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for response'));
      }, 10000);
      
      this.serverProcess.stdout.on('data', onData);
      this.serverProcess.stdin.write(messageStr);
    });
  }

  async initialize() {
    const initResponse = await this.sendMCPMessage('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
        sampling: {}
      },
      clientInfo: {
        name: "active-mode-test",
        version: "1.0.0"
      }
    });

    await this.sendMCPMessage('notifications/initialized');
    console.log('MCP session initialized');
  }

  async testActiveMode() {
    console.log('\n=== Testing Active Mode Statistics Updates ===');
    
    // Get initial stats
    const initialResponse = await this.sendMCPMessage('tools/call', {
      name: 'unfugit_stats',
      arguments: { extended: true }
    });
    
    const initialResource = initialResponse.result?.content?.find(c => c.type === 'resource');
    const initialStats = JSON.parse(initialResource?.resource?.text || '{}');
    
    console.log(`Initial state - Role: ${initialStats.role}, Commits: ${initialStats.repo?.total_commits}, Session: ${initialStats.repo?.session_commits}`);
    
    // Create a file
    await fs.writeFile('active-mode-test.txt', 'Testing active mode tracking\n');
    console.log('Created test file');
    
    // Wait for watcher to process (if active)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get stats after file creation
    const afterResponse = await this.sendMCPMessage('tools/call', {
      name: 'unfugit_stats',
      arguments: { extended: true }
    });
    
    const afterResource = afterResponse.result?.content?.find(c => c.type === 'resource');
    const afterStats = JSON.parse(afterResource?.resource?.text || '{}');
    
    console.log(`After file creation - Role: ${afterStats.role}, Commits: ${afterStats.repo?.total_commits}, Session: ${afterStats.repo?.session_commits}`);
    
    // Check if commits increased
    const commitsIncreased = (afterStats.repo?.total_commits || 0) > (initialStats.repo?.total_commits || 0);
    const sessionCommitsIncreased = (afterStats.repo?.session_commits || 0) > (initialStats.repo?.session_commits || 0);
    
    console.log('\n=== Results ===');
    console.log(`Server role: ${afterStats.role}`);
    console.log(`Commits increased: ${commitsIncreased ? 'YES' : 'NO'} (${initialStats.repo?.total_commits || 0} → ${afterStats.repo?.total_commits || 0})`);
    console.log(`Session commits increased: ${sessionCommitsIncreased ? 'YES' : 'NO'} (${initialStats.repo?.session_commits || 0} → ${afterStats.repo?.session_commits || 0})`);
    console.log(`File tracking: ${commitsIncreased ? 'WORKING' : 'NOT DETECTED'}`);
    
    // Cleanup
    try {
      await fs.unlink('active-mode-test.txt');
      console.log('Test file cleaned up');
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return {
      role: afterStats.role,
      commitsIncreased,
      sessionCommitsIncreased,
      initialCommits: initialStats.repo?.total_commits || 0,
      finalCommits: afterStats.repo?.total_commits || 0
    };
  }

  async run() {
    try {
      await this.startServer();
      await this.initialize();
      
      const results = await this.testActiveMode();
      
      console.log('\n=== SUMMARY ===');
      console.log(`Server operated in ${results.role} mode`);
      console.log(`Commit tracking: ${results.commitsIncreased ? 'FUNCTIONAL' : 'NOT ACTIVE'}`);
      
      if (results.role === 'passive') {
        console.log('\nNote: Server ran in passive mode. To test active mode, ensure no other unfugit instances are running.');
      }
      
    } catch (error) {
      console.error('Active mode test failed:', error);
    } finally {
      await this.stopServer();
    }
  }
}

const test = new ActiveModeTest();
test.run().catch(console.error);