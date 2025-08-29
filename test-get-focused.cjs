#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

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
        console.log(`Parameters used:`, JSON.stringify(params, null, 2));
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
            if (text.startsWith('PATH_NOT_FOUND:')) {
              console.log(`Message: ${text}`);
            } else if (text.length > 300) {
              console.log(`Preview: ${text.substring(0, 300)}...`);
            } else {
              console.log(`Full content:\n${text}`);
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

  async getHistory() {
    try {
      const response = await this.sendMessage({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'tools/call',
        params: {
          name: 'unfugit_history',
          arguments: { limit: 50 }
        }
      });
      return response;
    } catch (error) {
      console.error('Failed to get history:', error);
      return null;
    }
  }

  async close() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }
}

async function createTestFiles() {
  console.log('\n📝 Creating test files...');
  
  // Create various test files
  const testFiles = [
    { path: 'test-get-text.txt', content: 'This is a simple text file for testing unfugit_get.\nLine 2\nLine 3' },
    { path: 'test-get-json.json', content: '{"name": "test", "value": 123, "nested": {"key": "value"}}' },
    { path: 'test-get-large.txt', content: 'Large file content\n'.repeat(1000) },
    { path: 'test-get-empty.txt', content: '' },
    { path: 'test-get-unicode.txt', content: 'Unicode test: 🚀 测试 файл Ñoño' },
    { path: 'test-get-code.py', content: 'def hello_world():\n    print("Hello, World!")\n    return True\n' },
  ];

  for (const file of testFiles) {
    await fs.writeFile(file.path, file.content, 'utf8');
    console.log(`Created: ${file.path} (${file.content.length} chars)`);
  }

  // Create a test directory with nested files
  await fs.mkdir('test-get-dir', { recursive: true });
  await fs.writeFile('test-get-dir/nested.txt', 'Nested file content\nLine 2');
  console.log(`Created: test-get-dir/nested.txt`);

  // Create a binary test file
  const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  await fs.writeFile('test-get-binary.bin', binaryData);
  console.log(`Created: test-get-binary.bin (${binaryData.length} bytes)`);

  // Create a file with special characters in name
  await fs.writeFile('test-get space & symbols!@#.txt', 'Special filename test content');
  console.log(`Created: test-get space & symbols!@#.txt`);

  console.log('✅ Test files created\n');
  
  // Wait a moment for the unfugit watcher to pick up changes
  console.log('⏳ Waiting for unfugit to detect file changes...');
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function runTests() {
  const client = new MCPClient();
  await client.start();

  // Wait for unfugit to initialize and start watching
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create test files
  await createTestFiles();

  console.log('\n🚀 Starting Focused unfugit_get Tests\n');

  // First get the history to see what files are available
  console.log('📜 Getting audit history...');
  const history = await client.getHistory();
  if (history && history.result && history.result.content) {
    console.log('Recent commits:');
    const historyText = history.result.content[0].text;
    console.log(historyText.substring(0, 500) + '...');
  }

  // Test 1: Get recently created text file
  await client.testGet(
    "Get recently created text file", 
    { path: "test-get-text.txt" }
  );

  // Test 2: Get JSON file
  await client.testGet(
    "Get JSON file", 
    { path: "test-get-json.json" }
  );

  // Test 3: Get file from specific commit (use HEAD~1)
  await client.testGet(
    "Get file from HEAD~1", 
    { path: "test-get-text.txt", ref: "HEAD~1" }
  );

  // Test 4: Get large file
  await client.testGet(
    "Get large text file", 
    { path: "test-get-large.txt" }
  );

  // Test 5: Get empty file
  await client.testGet(
    "Get empty file", 
    { path: "test-get-empty.txt" }
  );

  // Test 6: Get unicode file
  await client.testGet(
    "Get unicode file", 
    { path: "test-get-unicode.txt" }
  );

  // Test 7: Get code file
  await client.testGet(
    "Get Python code file", 
    { path: "test-get-code.py" }
  );

  // Test 8: Get binary file
  await client.testGet(
    "Get binary file", 
    { path: "test-get-binary.bin" }
  );

  // Test 9: Get nested file
  await client.testGet(
    "Get nested file", 
    { path: "test-get-dir/nested.txt" }
  );

  // Test 10: Get file with special characters
  await client.testGet(
    "Get file with special characters in name", 
    { path: "test-get space & symbols!@#.txt" }
  );

  // Test 11: Try to get non-existent file
  await client.testGet(
    "Get non-existent file", 
    { path: "does-not-exist.txt" }
  );

  // Test 12: Try to get directory
  await client.testGet(
    "Try to get directory (should fail)", 
    { path: "test-get-dir" }
  );

  // Test 13: Get file from non-existent commit
  await client.testGet(
    "Get file from non-existent commit", 
    { path: "test-get-text.txt", ref: "nonexistent123" }
  );

  // Test 14: Test with invalid path
  await client.testGet(
    "Test with invalid path", 
    { path: "../../../etc/passwd" }
  );

  // Test 15: Test with empty path
  await client.testGet(
    "Test with empty path", 
    { path: "" }
  );

  // Test 16: Test missing path parameter
  await client.testGet(
    "Test missing path parameter", 
    { ref: "HEAD" }
  );

  // Test 17: Test with various ref formats
  await client.testGet(
    "Test with HEAD ref", 
    { path: "test-get-text.txt", ref: "HEAD" }
  );

  // Test 18: Test with HEAD~2 ref
  await client.testGet(
    "Test with HEAD~2 ref", 
    { path: "test-get-text.txt", ref: "HEAD~2" }
  );

  // Test 19: Test with branch name (should work with main)
  await client.testGet(
    "Test with branch name", 
    { path: "test-get-text.txt", ref: "main" }
  );

  // Test 20: Test with short commit hash (get from history if available)
  await client.testGet(
    "Test with HEAD^ notation", 
    { path: "test-get-text.txt", ref: "HEAD^" }
  );

  // Summary
  console.log('\n📊 Test Summary');
  console.log(`Total tests: ${testCount}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${testCount - passCount}`);
  console.log(`Success rate: ${((passCount / testCount) * 100).toFixed(1)}%`);

  await client.close();

  // Clean up test files
  console.log('\n🧹 Cleaning up test files...');
  const cleanupFiles = [
    'test-get-text.txt', 
    'test-get-json.json',
    'test-get-large.txt',
    'test-get-empty.txt', 
    'test-get-unicode.txt',
    'test-get-code.py',
    'test-get-binary.bin',
    'test-get space & symbols!@#.txt'
  ];

  for (const file of cleanupFiles) {
    try {
      await fs.unlink(file);
      console.log(`Deleted: ${file}`);
    } catch (err) {
      console.log(`Could not delete ${file}: ${err.message}`);
    }
  }

  try {
    await fs.rm('test-get-dir', { recursive: true });
    console.log('Deleted: test-get-dir/');
  } catch (err) {
    console.log(`Could not delete test-get-dir: ${err.message}`);
  }
}

runTests().catch(console.error);