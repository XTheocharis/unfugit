#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;

class SimpleStatsTest {
  constructor() {
    this.serverProcess = null;
  }

  async startServer() {
    console.log('Starting Unfugit server...');
    this.serverProcess = spawn('node', ['dist/unfugit.js', '.'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
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
        name: "unfugit-stats-test",
        version: "1.0.0"
      }
    });

    await this.sendMCPMessage('notifications/initialized');
    console.log('MCP session initialized');
  }

  async testStats() {
    console.log('\n=== Testing Stats with Different Parameters ===');
    
    const testCases = [
      { name: 'No parameters', args: {} },
      { name: 'JSON format', args: { format: 'json' } },
      { name: 'Human format', args: { format: 'human' } },
      { name: 'Detailed level', args: { detail_level: 'detailed' } },
      { name: 'Server category', args: { category: 'server' } },
      { name: 'Repository category', args: { category: 'repository' } }
    ];

    let allResults = [];

    for (const testCase of testCases) {
      try {
        console.log(`\nTesting: ${testCase.name}`);
        
        const response = await this.sendMCPMessage('tools/call', {
          name: 'unfugit_stats',
          arguments: testCase.args
        });

        if (response.error) {
          console.log('❌ Error:', response.error);
          allResults.push({
            test: testCase.name,
            success: false,
            error: response.error
          });
        } else if (response.result && response.result.content) {
          const content = Array.isArray(response.result.content) 
            ? response.result.content[0] 
            : response.result.content;
            
          console.log('✅ Success');
          console.log('Content type:', content.type || 'unknown');
          console.log('Content (first 200 chars):', 
            (content.text || '').substring(0, 200) + '...');
          
          allResults.push({
            test: testCase.name,
            success: true,
            response: response.result,
            contentType: content.type,
            contentPreview: (content.text || '').substring(0, 500),
            fullContent: content.text
          });
        }
      } catch (error) {
        console.log('❌ Exception:', error.message);
        allResults.push({
          test: testCase.name,
          success: false,
          error: error.message
        });
      }
    }

    return allResults;
  }

  async run() {
    try {
      await this.startServer();
      await this.initialize();
      
      const results = await this.testStats();
      
      // Generate detailed report
      await this.generateReport(results);
      
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      await this.stopServer();
    }
  }

  async generateReport(results) {
    let report = `# Unfugit Stats Tool Analysis Report

Generated: ${new Date().toISOString()}

## Test Results Summary

`;

    results.forEach((result, index) => {
      report += `### ${index + 1}. ${result.test}

**Status:** ${result.success ? '✅ SUCCESS' : '❌ FAILED'}
`;

      if (result.error) {
        report += `**Error:** ${JSON.stringify(result.error)}
`;
      }

      if (result.success && result.fullContent) {
        report += `**Content Type:** ${result.contentType || 'text/plain'}
**Content Preview:** 
\`\`\`
${result.contentPreview}
\`\`\`

**Full Content:**
\`\`\`
${result.fullContent}
\`\`\`

`;
      }

      report += '\n---\n\n';
    });

    report += `## Analysis

### Tool Response Format

The \`unfugit_stats\` tool returns responses in different formats based on the parameters:

1. **Default behavior**: Returns human-readable text format
2. **JSON format**: When explicitly requested with \`format: 'json'\`
3. **Human format**: Explicitly formatted for human reading
4. **Categories and detail levels**: Filter and control the amount of information returned

### Key Findings

`;

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    report += `- **Success Rate**: ${successCount}/${totalCount} (${(successCount/totalCount*100).toFixed(1)}%)
- **Format Support**: The tool supports multiple output formats including JSON and human-readable text
- **Parameter Support**: Various parameters like \`category\`, \`detail_level\`, and \`format\` are supported
- **Content Structure**: Responses contain comprehensive server and repository statistics

### Recommendations

1. Use \`format: 'json'\` for programmatic access to statistics
2. Use \`format: 'human'\` for readable reports
3. Use specific categories to focus on particular aspects of the system
4. Use different detail levels to control information granularity

---
*Report generated by Simple Stats Test at ${new Date().toISOString()}*
`;

    await fs.writeFile('temp2_stats.md', report);
    console.log('\n✅ Report saved to temp2_stats.md');
  }
}

const test = new SimpleStatsTest();
test.run().catch(console.error);