#!/usr/bin/env node

// Fixed test script for unfugit MCP features with correct parameters
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

  console.error('\n=== Testing unfugit_stats ===');
  sendRequest('tools/call', {
    name: 'unfugit_stats',
    arguments: {
      extended: true
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_history ===');
  sendRequest('tools/call', {
    name: 'unfugit_history',
    arguments: {
      limit: 5,
      grep: 'Test'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_diff ===');
  sendRequest('tools/call', {
    name: 'unfugit_diff',
    arguments: {
      base: 'HEAD~2',
      head: 'HEAD'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_show ===');
  sendRequest('tools/call', {
    name: 'unfugit_show',
    arguments: {
      commit: 'HEAD'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_get ===');
  sendRequest('tools/call', {
    name: 'unfugit_get',
    arguments: {
      commit: 'HEAD~1',
      path: 'Test3.txt'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_find_by_content ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'Test',
      limit: 5
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_ignores - list ===');
  sendRequest('tools/call', {
    name: 'unfugit_ignores',
    arguments: {
      mode: 'list',
      which: 'all'
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_ignores - add ===');
  sendRequest('tools/call', {
    name: 'unfugit_ignores',
    arguments: {
      mode: 'add',
      patterns: ['*.log', '*.tmp']
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_ignores - check ===');
  sendRequest('tools/call', {
    name: 'unfugit_ignores',
    arguments: {
      mode: 'check',
      patterns: ['test.log', 'data.json']
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_timeline ===');
  sendRequest('tools/call', {
    name: 'unfugit_timeline',
    arguments: {
      path: 'Test3.txt',
      limit: 10
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_trace_lines ===');
  sendRequest('tools/call', {
    name: 'unfugit_trace_lines',
    arguments: {
      path: 'Test3.txt',
      start_line: 1,
      end_line: 5,
      limit: 10
    }
  });
  await sleep(500);

  console.error('\n=== Testing unfugit_restore_preview ===');
  sendRequest('tools/call', {
    name: 'unfugit_restore_preview',
    arguments: {
      commit: 'HEAD~2',
      paths: ['Test3.txt']
    }
  });
  await sleep(1000);

  console.error('\n=== Testing resource listing ===');
  sendRequest('resources/list');
  await sleep(500);

  console.error('\n=== Testing resource read (stats) ===');
  sendRequest('resources/read', {
    uri: 'unfugit://stats'
  });
  await sleep(500);

  console.error('\n=== Testing resource read (recent commits) ===');
  sendRequest('resources/read', {
    uri: 'resource://unfugit/commits/recent'
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
      console.error(`❌ Error: ${JSON.stringify(response.error, null, 2)}`);
    } else if (response.result) {
      // Shorten long results for readability
      let resultStr = JSON.stringify(response.result, null, 2);
      if (resultStr.length > 500) {
        resultStr = resultStr.substring(0, 500) + '...';
      }
      console.error(`✅ Success: ${resultStr}`);
    }
  } catch (_e) {
    // Not JSON, likely a notification
    if (line.includes('"level":"error"')) {
      console.error(`❌ Notification: ${line}`);
    } else {
      console.error(`📢 Notification: ${line}`);
    }
  }
});

// Start tests after a short delay
setTimeout(runTests, 100);