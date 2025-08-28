#!/usr/bin/env node

// Comprehensive test script for all unfugit MCP features
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

async function runTests() {
  // Initialize connection
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });
  await sleep(500);

  console.error('\n=== Testing ping ===');
  sendRequest('tools/call', {
    name: 'ping',
    arguments: {}
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_history ===');
  sendRequest('tools/call', {
    name: 'unfugit_history',
    arguments: {
      limit: 5,
      format: 'detailed'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_history with pagination ===');
  sendRequest('tools/call', {
    name: 'unfugit_history',
    arguments: {
      limit: 3,
      cursor: 'HEAD~3',
      format: 'oneline'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_diff ===');
  sendRequest('tools/call', {
    name: 'unfugit_diff',
    arguments: {
      from: 'HEAD~2',
      to: 'HEAD'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_show ===');
  sendRequest('tools/call', {
    name: 'unfugit_show',
    arguments: {
      ref: 'HEAD',
      format: 'full'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_get ===');
  sendRequest('tools/call', {
    name: 'unfugit_get',
    arguments: {
      ref: 'HEAD',
      path: 'Test1.txt'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_find_by_content ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      content: 'Test',
      limit: 10
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_stats ===');
  sendRequest('tools/call', {
    name: 'unfugit_stats',
    arguments: {}
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_ignores - list ===');
  sendRequest('tools/call', {
    name: 'unfugit_ignores',
    arguments: {
      operation: 'list'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_ignores - add ===');
  sendRequest('tools/call', {
    name: 'unfugit_ignores',
    arguments: {
      operation: 'add',
      pattern: '*.log'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_timeline ===');
  sendRequest('tools/call', {
    name: 'unfugit_timeline',
    arguments: {
      path: 'Test1.txt',
      limit: 10
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_trace_lines ===');
  sendRequest('tools/call', {
    name: 'unfugit_trace_lines',
    arguments: {
      path: 'Test1.txt',
      startLine: 1,
      endLine: 5,
      limit: 10
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_restore_preview ===');
  sendRequest('tools/call', {
    name: 'unfugit_restore_preview',
    arguments: {
      ref: 'HEAD~1',
      paths: ['Test1.txt']
    }
  });
  await sleep(500);

  console.error('\n=== Testing resource listing ===');
  sendRequest('resources/list');
  await sleep(500);

  console.error('\n=== Testing resource read (stats) ===');
  sendRequest('resources/read', {
    uri: 'unfugit://stats'
  });
  await sleep(500);

  console.error('\n=== All tests completed ===');
  process.exit(0);
}

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.error) {
      console.error(`Error: ${JSON.stringify(response.error, null, 2)}`);
    } else if (response.result) {
      console.error(`Success: ${JSON.stringify(response.result, null, 2).substring(0, 500)}...`);
    }
  } catch (_e) {
    // Not JSON, likely a notification
    console.error(`Notification: ${line}`);
  }
});

// Start tests after a short delay
setTimeout(runTests, 100);