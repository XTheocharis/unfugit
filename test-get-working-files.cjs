#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

let testCount = 0;
let passCount = 0;

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
        capabilities: {},
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

  async testGet(description, params, expectSuccess = null) {
    testCount++;
    console.log(`\n--- Test ${testCount}: ${description} ---`);
    console.log(`Parameters: ${JSON.stringify(params)}`);
    
    try {
      const response = await this.sendMessage({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'tools/call',
        params: {
          name: 'unfugit_get',
          arguments: params
        }
      });

      const isError = !!response.error;
      const shouldExpectError = expectSuccess === false;
      
      if (isError && !shouldExpectError) {
        console.log(`❌ FAILED: ${response.error.message}`);
        return { success: false, error: response.error };
      } else if (!isError && shouldExpectError) {
        console.log(`❌ FAILED: Expected error but got success`);
        return { success: false, error: 'Expected error but got success' };
      } else {
        console.log(`✅ SUCCESS`);
        passCount++;
        
        // Log detailed response information
        if (response.result && response.result.content) {
          const content = response.result.content[0];
          console.log(`Response type: ${content.type}`);
          
          if (content.type === 'text') {
            const text = content.text;
            console.log(`Text length: ${text.length} characters`);
            
            if (text.includes('PATH_NOT_FOUND:')) {
              console.log(`Status: Path not found - ${text.trim()}`);
            } else if (text.includes('Internal error:')) {
              console.log(`Status: Internal error - ${text.trim()}`);
            } else if (text.length === 0) {
              console.log(`Status: Empty file content`);
            } else if (text.length > 500) {
              console.log(`Status: Large content`);
              console.log(`Preview: ${text.substring(0, 200)}...`);
              console.log(`...ending: ...${text.substring(text.length - 100)}`);
            } else {
              console.log(`Status: File content retrieved successfully`);
              console.log(`Content:\n${text}`);
            }
          } else if (content.type === 'resource') {
            console.log(`Resource URI: ${content.resource.uri}`);
            console.log(`Resource MIME type: ${content.resource.mimeType || 'not specified'}`);
            
            if (content.resource.text) {
              console.log(`Resource has text content: ${content.resource.text.length} chars`);
            }
            if (content.resource.blob) {
              console.log(`Resource has binary content: ${content.resource.blob.length} bytes`);
            }
          }
        }
        
        return { success: true, result: response.result };
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      return { success: false, error: error.message };
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

  console.log('\n🔍 Testing unfugit_get with files that exist in audit repo\n');

  // Test with files that we know exist in the audit repo (node_modules files)
  await client.testGet(
    "Get node_modules binary (acorn)", 
    { path: "node_modules/.bin/acorn" }
  );

  await client.testGet(
    "Get node_modules binary (eslint)", 
    { path: "node_modules/.bin/eslint" }
  );

  await client.testGet(
    "Get node_modules binary (prettier)", 
    { path: "node_modules/.bin/prettier" }
  );

  // Test different ref formats with existing files
  await client.testGet(
    "Get file with HEAD ref explicitly", 
    { path: "node_modules/.bin/acorn", ref: "HEAD" }
  );

  await client.testGet(
    "Get file from HEAD~1", 
    { path: "node_modules/.bin/acorn", ref: "HEAD~1" }
  );

  await client.testGet(
    "Get file from HEAD^", 
    { path: "node_modules/.bin/acorn", ref: "HEAD^" }
  );

  // Test error conditions
  await client.testGet(
    "Get non-existent file", 
    { path: "definitely-does-not-exist.txt" }
  );

  await client.testGet(
    "Get existing file from non-existent commit", 
    { path: "node_modules/.bin/acorn", ref: "nonexistent123" }
  );

  await client.testGet(
    "Test with invalid path characters", 
    { path: "../../../etc/passwd" }
  );

  await client.testGet(
    "Test with directory instead of file", 
    { path: "node_modules" }
  );

  await client.testGet(
    "Test with empty string path", 
    { path: "" }
  );

  // Test parameter validation (these should fail)
  await client.testGet(
    "Test missing path parameter (should fail)", 
    { ref: "HEAD" },
    false // expect failure
  );

  await client.testGet(
    "Test with null path", 
    { path: null },
    false // expect failure
  );

  // Test various ref formats that should work
  await client.testGet(
    "Test with full commit hash from history", 
    { path: "node_modules/.bin/acorn", ref: "7d170c10afbea200f215076aa5ace41ed3b43d85" }
  );

  await client.testGet(
    "Test with abbreviated commit hash", 
    { path: "node_modules/.bin/acorn", ref: "7d170c1" }
  );

  // Test edge cases
  await client.testGet(
    "Test with deeply nested path", 
    { path: "node_modules/.bin/../.bin/acorn" }
  );

  await client.testGet(
    "Test case sensitivity", 
    { path: "NODE_MODULES/.bin/acorn" }
  );

  console.log('\n📊 Test Summary');
  console.log(`Total tests: ${testCount}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${testCount - passCount}`);
  console.log(`Success rate: ${((passCount / testCount) * 100).toFixed(1)}%`);

  await client.close();
}

runTests().catch(console.error);