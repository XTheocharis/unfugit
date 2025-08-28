#!/usr/bin/env node

// Test restore functionality
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let messageId = 1;

function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    method,
    id: messageId++,
    params
  };
  console.log(JSON.stringify(request));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let restoreToken = null;

async function runTests() {
  // Initialize
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'restore-test', version: '1.0.0' }
  });
  await sleep(500);

  // First, show the current history
  console.error('\n=== Current History ===');
  sendRequest('tools/call', {
    name: 'unfugit_history',
    arguments: {
      limit: 3
    }
  });
  await sleep(1000);

  // Show the current state of Test3.txt
  console.error('\n=== Current Test3.txt Content ===');
  sendRequest('tools/call', {
    name: 'unfugit_get',
    arguments: {
      commit: 'HEAD',
      path: 'Test3.txt'
    }
  });
  await sleep(1000);

  // Get content from an earlier commit
  console.error('\n=== Test3.txt from HEAD~5 ===');
  sendRequest('tools/call', {
    name: 'unfugit_get',
    arguments: {
      commit: 'HEAD~5',
      path: 'Test3.txt'
    }
  });
  await sleep(1000);

  // Preview restore from an earlier commit
  console.error('\n=== Preview Restore from HEAD~5 ===');
  sendRequest('tools/call', {
    name: 'unfugit_restore_preview',
    arguments: {
      commit: 'HEAD~5',
      paths: ['Test3.txt']
    }
  });
  await sleep(2000);

  // The token should be captured from the preview response
  // For testing, we'll just exit here
  console.error('\n=== Test Complete ===');
  process.exit(0);
}

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.error) {
      console.error(`❌ Error: ${JSON.stringify(response.error, null, 2)}`);
    } else if (response.result) {
      // Check if this is a restore preview response with a token
      if (response.result.structuredContent?.confirm_token) {
        restoreToken = response.result.structuredContent.confirm_token;
        console.error(`\n📝 Got restore token: ${restoreToken}`);
        
        // Now apply the restore
        console.error('\n=== Applying Restore ===');
        sendRequest('tools/call', {
          name: 'unfugit_restore_apply',
          arguments: {
            confirm_token: restoreToken,
            idempotency_key: `restore-${Date.now()}`
          }
        });
      }
      
      // Show result summary
      let resultStr = JSON.stringify(response.result, null, 2);
      if (resultStr.length > 800) {
        resultStr = resultStr.substring(0, 800) + '...';
      }
      console.error(`✅ Success: ${resultStr}`);
    }
  } catch (_e) {
    // Not JSON, likely a notification
    if (!line.includes('notification')) {
      console.error(`📢 ${line}`);
    }
  }
});

// Start tests
setTimeout(runTests, 100);