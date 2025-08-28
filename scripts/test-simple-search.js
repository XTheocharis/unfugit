#!/usr/bin/env node

// Simple search test
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

async function runTest() {
  // Initialize
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'search-test', version: '1.0.0' }
  });
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 500));

  // Search for "third"
  console.error('Searching for "third"...');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'third',
      limit: 10
    }
  });

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  process.exit(0);
}

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.error('Response:', JSON.stringify(response, null, 2));
  } catch (_e) {
    console.error('Non-JSON:', line);
  }
});

// Start test
setTimeout(runTest, 100);