#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

class MCPClient {
  constructor() {
    this.messageId = 1;
    this.serverProcess = null;
    this.rl = null;
  }

  async start() {
    console.log('Starting unfugit server...');
    this.serverProcess = spawn('node', ['dist/unfugit.js', process.cwd()], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    this.rl = readline.createInterface({
      input: this.serverProcess.stdout,
      output: process.stdout,
      terminal: false
    });

    // Initialize
    const initResponse = await this.sendMessage({
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: {}
        },
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });
    
    console.log('Server initialized');
    return initResponse;
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message) + '\n';
      
      const timeout = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 10000);

      const handleResponse = (line) => {
        try {
          const response = JSON.parse(line);
          if (response.id === message.id) {
            clearTimeout(timeout);
            this.rl.off('line', handleResponse);
            resolve(response);
          }
        } catch (e) {
          // Ignore parsing errors for partial lines
        }
      };

      this.rl.on('line', handleResponse);
      this.serverProcess.stdin.write(messageStr);
    });
  }

  async listResources() {
    try {
      const response = await this.sendMessage({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'resources/list',
        params: {}
      });
      return response;
    } catch (error) {
      console.error('Failed to list resources:', error);
      return null;
    }
  }

  async readResource(uri) {
    try {
      const response = await this.sendMessage({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'resources/read',
        params: { uri }
      });
      return response;
    } catch (error) {
      console.error('Failed to read resource:', error);
      return null;
    }
  }

  async testGetWithResources(path, ref = 'HEAD') {
    console.log(`\n🔍 Testing unfugit_get with: ${path} (ref: ${ref})`);
    
    try {
      const response = await this.sendMessage({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'tools/call',
        params: {
          name: 'unfugit_get',
          arguments: { path, ref }
        }
      });

      if (response.error) {
        console.log(`❌ Tool call failed: ${response.error.message}`);
        return;
      }

      console.log(`✅ Tool call successful`);
      
      if (response.result && response.result.content) {
        const content = response.result.content[0];
        console.log(`Content type: ${content.type}`);
        console.log(`Content text: ${content.text}`);
        
        // Check if there are resources
        if (content.type === 'resource') {
          console.log(`🎯 Found resource!`);
          console.log(`Resource URI: ${content.resource.uri}`);
          console.log(`MIME type: ${content.resource.mimeType}`);
          
          if (content.resource.text) {
            console.log(`Text content length: ${content.resource.text.length}`);
            console.log(`Text preview: ${content.resource.text.substring(0, 100)}...`);
          }
          
          if (content.resource.blob) {
            console.log(`Binary content length: ${content.resource.blob.length}`);
          }
        }
      }
      
      // Also check if response has any resources in separate field
      if (response.result && response.result.resources) {
        console.log(`🔗 Found ${response.result.resources.length} resources in result`);
        for (const resource of response.result.resources) {
          console.log(`Resource: ${resource.uri} (${resource.mimeType})`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Exception: ${error.message}`);
    }
  }

  async close() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }
}

async function runTests() {
  const client = new MCPClient();
  await client.start();

  console.log('\n📋 Listing available resources...');
  const resources = await client.listResources();
  if (resources && resources.result && resources.result.resources) {
    console.log(`Found ${resources.result.resources.length} resources:`);
    for (const resource of resources.result.resources.slice(0, 5)) {
      console.log(`- ${resource.uri} (${resource.mimeType || 'no mime type'})`);
    }
  } else {
    console.log('No resources found or failed to list resources');
  }

  // Test getting files and examining resources
  await client.testGetWithResources('node_modules/.bin/acorn');
  await client.testGetWithResources('node_modules/.bin/eslint');
  await client.testGetWithResources('does-not-exist.txt');

  await client.close();
}

runTests().catch(console.error);