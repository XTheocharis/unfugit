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
        console.log(`Error details:`, JSON.stringify(response.error, null, 2));
        return { success: false, error: response.error };
      } else {
        console.log(`✅ SUCCESS`);
        passCount++;
        
        // Log key information about the response
        if (response.result && response.result.content) {
          const content = response.result.content[0];
          console.log(`Content type: ${content.type}`);
          if (content.type === 'text') {
            const text = content.text;
            console.log(`Text length: ${text.length} characters`);
            if (text.length > 200) {
              console.log(`Preview: ${text.substring(0, 200)}...`);
            } else {
              console.log(`Full content: ${text}`);
            }
          } else if (content.type === 'resource') {
            console.log(`Resource URI: ${content.resource.uri}`);
            if (content.resource.text) {
              console.log(`Resource text length: ${content.resource.text.length}`);
            }
            if (content.resource.blob) {
              console.log(`Resource blob length: ${content.resource.blob.length}`);
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

  console.log('\n🚀 Starting Comprehensive unfugit_get Tests\n');

  // Test 1: Get file from HEAD commit
  await client.testGet(
    "Get file from HEAD commit", 
    { path: "diff-test-a.txt" }
  );

  // Test 2: Get file from specific commit hash
  await client.testGet(
    "Get file from specific commit hash", 
    { path: "diff-test-a.txt", ref: "8d04e4f" }
  );

  // Test 3: Get file from HEAD~1 reference
  await client.testGet(
    "Get file from HEAD~1 reference", 
    { path: "diff-test-a.txt", ref: "HEAD~1" }
  );

  // Test 4: Get text file
  await client.testGet(
    "Get text file", 
    { path: "README.md" }
  );

  // Test 5: Get binary file
  await client.testGet(
    "Get binary file", 
    { path: "test-binary.bin" }
  );

  // Test 6: Get image file
  await client.testGet(
    "Get image file", 
    { path: "assets/logo.png" }
  );

  // Test 7: Get code file
  await client.testGet(
    "Get code file", 
    { path: "src/unfugit.ts" }
  );

  // Test 8: Get file in subdirectory
  await client.testGet(
    "Get file in subdirectory", 
    { path: "deep/file1.txt" }
  );

  // Test 9: Get file in nested subdirectory
  await client.testGet(
    "Get file in deeply nested subdirectory", 
    { path: "deep/nested/structure/file.txt" }
  );

  // Test 10: Get non-existent file
  await client.testGet(
    "Get non-existent file", 
    { path: "non-existent-file.txt" }
  );

  // Test 11: Get file from non-existent commit
  await client.testGet(
    "Get file from non-existent commit", 
    { path: "README.md", ref: "non-existent-commit" }
  );

  // Test 12: Get file with special characters in name
  await client.testGet(
    "Get file with special characters", 
    { path: "test file with spaces.txt" }
  );

  // Test 13: Get file with unicode characters
  await client.testGet(
    "Get file with unicode characters", 
    { path: "test-файл-测试.txt" }
  );

  // Test 14: Get file with special symbols in name
  await client.testGet(
    "Get file with special symbols", 
    { path: "test@#$%^&()_+.txt" }
  );

  // Test 15: Get empty file (if one exists)
  await client.testGet(
    "Get empty/small file", 
    { path: "test-ascii.txt" }
  );

  // Test 16: Get large file
  await client.testGet(
    "Get large file", 
    { path: "test-large-content.txt" }
  );

  // Test 17: Get JSON file
  await client.testGet(
    "Get JSON file", 
    { path: "test-data.json" }
  );

  // Test 18: Get log file
  await client.testGet(
    "Get log file", 
    { path: "important.log" }
  );

  // Test 19: Try to get directory (should fail)
  await client.testGet(
    "Try to get directory", 
    { path: "src" }
  );

  // Test 20: Get file with invalid path characters
  await client.testGet(
    "Get file with invalid path", 
    { path: "../../../etc/passwd" }
  );

  // Test 21: Get file from very old commit
  await client.testGet(
    "Get file from very old commit", 
    { path: "README.md", ref: "d744bed" }
  );

  // Test 22: Get file that was deleted in current commit but exists in older commit
  await client.testGet(
    "Get potentially deleted file from older commit", 
    { path: "some-old-file.txt", ref: "HEAD~5" }
  );

  // Test 23: Test with empty path
  await client.testGet(
    "Test with empty path", 
    { path: "" }
  );

  // Test 24: Test with null/undefined path
  await client.testGet(
    "Test with missing path parameter", 
    { ref: "HEAD" }
  );

  // Test 25: Get file with only ref parameter (should fail)
  await client.testGet(
    "Test with only ref parameter", 
    { ref: "HEAD" }
  );

  // Summary
  console.log('\n📊 Test Summary');
  console.log(`Total tests: ${testCount}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${testCount - passCount}`);
  console.log(`Success rate: ${((passCount / testCount) * 100).toFixed(1)}%`);

  await client.close();
}

runTests().catch(console.error);