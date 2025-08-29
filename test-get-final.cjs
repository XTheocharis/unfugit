#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs').promises;

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
      }, 15000);

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

  async testGet(description, params) {
    testCount++;
    console.log(`\n--- Test ${testCount}: ${description} ---`);
    
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

      if (response.error) {
        console.log(`❌ FAILED: ${response.error.message}`);
        return { success: false, error: response.error };
      } else {
        console.log(`✅ SUCCESS`);
        passCount++;
        
        console.log(`Parameters: ${JSON.stringify(params)}`);
        
        if (response.result && response.result.content) {
          const content = response.result.content[0];
          console.log(`Content type: ${content.type}`);
          
          if (content.type === 'text') {
            const text = content.text;
            console.log(`Text length: ${text.length} characters`);
            
            // Check if this is just metadata or actual content
            if (text.startsWith('Retrieved ') && text.includes(' bytes, ')) {
              console.log(`Status: Metadata only - ${text.trim()}`);
              console.log(`Note: This appears to be metadata, not actual file content`);
            } else if (text.includes('PATH_NOT_FOUND:')) {
              console.log(`Status: ${text.trim()}`);
            } else if (text.includes('PATH_IS_DIRECTORY:')) {
              console.log(`Status: ${text.trim()}`);
            } else if (text.includes('Internal error:')) {
              console.log(`Status: ${text.trim()}`);
            } else {
              console.log(`Status: Actual file content retrieved`);
              if (text.length > 200) {
                console.log(`Preview: ${text.substring(0, 200)}...`);
              } else {
                console.log(`Full content: ${text}`);
              }
            }
          } else if (content.type === 'resource') {
            console.log(`Resource URI: ${content.resource.uri}`);
            console.log(`Resource MIME type: ${content.resource.mimeType || 'not specified'}`);
            
            if (content.resource.text) {
              const text = content.resource.text;
              console.log(`Resource text content: ${text.length} chars`);
              if (text.length > 200) {
                console.log(`Text preview: ${text.substring(0, 200)}...`);
              } else {
                console.log(`Full text: ${text}`);
              }
            }
            if (content.resource.blob) {
              const blob = content.resource.blob;
              console.log(`Resource binary content: ${blob.length} bytes`);
              console.log(`Binary preview: ${Buffer.from(blob.substring(0, Math.min(20, blob.length))).toString('hex')}`);
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

  console.log('\n🎯 Final Comprehensive unfugit_get Tests\n');

  // Test 1: Basic file retrieval
  await client.testGet(
    "Get basic file (acorn binary)", 
    { path: "node_modules/.bin/acorn" }
  );

  // Test 2: Get larger file  
  await client.testGet(
    "Get larger file (eslint binary)", 
    { path: "node_modules/.bin/eslint" }
  );

  // Test 3: Different ref formats
  await client.testGet(
    "Get file with explicit HEAD ref", 
    { path: "node_modules/.bin/prettier", ref: "HEAD" }
  );

  await client.testGet(
    "Get file from HEAD~1", 
    { path: "node_modules/.bin/prettier", ref: "HEAD~1" }
  );

  await client.testGet(
    "Get file from HEAD^", 
    { path: "node_modules/.bin/prettier", ref: "HEAD^" }
  );

  // Test 4: Full commit hash
  await client.testGet(
    "Get file from full commit hash", 
    { path: "node_modules/.bin/acorn", ref: "7d170c10afbea200f215076aa5ace41ed3b43d85" }
  );

  // Test 5: Short commit hash
  await client.testGet(
    "Get file from short commit hash", 
    { path: "node_modules/.bin/acorn", ref: "7d170c1" }
  );

  // Test 6: Get multiple different files
  const testFiles = [
    "node_modules/.bin/crc32",
    "node_modules/.bin/esbuild", 
    "node_modules/.bin/js-yaml",
    "node_modules/.bin/nanoid",
    "node_modules/.bin/rollup"
  ];

  for (const file of testFiles) {
    await client.testGet(
      `Get file: ${file}`,
      { path: file }
    );
  }

  // Test 7: Error conditions
  await client.testGet(
    "Non-existent file", 
    { path: "does-not-exist.txt" }
  );

  await client.testGet(
    "Directory instead of file", 
    { path: "node_modules" }
  );

  await client.testGet(
    "Invalid path with traversal", 
    { path: "../../../etc/passwd" }
  );

  await client.testGet(
    "Empty path", 
    { path: "" }
  );

  // Test 8: Parameter validation
  await client.testGet(
    "Missing path parameter", 
    { ref: "HEAD" }
  );

  // Test 9: Invalid refs
  await client.testGet(
    "Non-existent commit", 
    { path: "node_modules/.bin/acorn", ref: "nonexistent123456" }
  );

  await client.testGet(
    "Malformed ref", 
    { path: "node_modules/.bin/acorn", ref: "HEAD~999" }
  );

  // Test 10: Path edge cases
  await client.testGet(
    "Path with spaces (if any exist)", 
    { path: "node modules/.bin/acorn" }  // This should fail
  );

  await client.testGet(
    "Case sensitivity test", 
    { path: "NODE_MODULES/.bin/acorn" }  // This should fail on case-sensitive systems
  );

  await client.testGet(
    "Path with dot navigation", 
    { path: "node_modules/.bin/../.bin/acorn" }  // This should fail
  );

  // Test 11: All different binary files to see size variations
  await client.testGet(
    "Small binary (nanoid)", 
    { path: "node_modules/.bin/nanoid" }
  );

  await client.testGet(
    "Large binary (vitest)", 
    { path: "node_modules/.bin/vitest" }
  );

  await client.testGet(
    "Medium binary (tsc)", 
    { path: "node_modules/.bin/tsc" }
  );

  console.log('\n📊 Test Summary');
  console.log(`Total tests: ${testCount}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${testCount - passCount}`);
  console.log(`Success rate: ${((passCount / testCount) * 100).toFixed(1)}%`);

  await client.close();
}

runTests().catch(console.error);