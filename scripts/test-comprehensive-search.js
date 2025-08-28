#!/usr/bin/env node

// Comprehensive search tests for unfugit
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let messageId = 1;
const testResults = [];

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

async function runSearchTests() {
  // Initialize
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'search-test', version: '1.0.0' }
  });
  await sleep(500);

  // Test 1: Search for "third" (appears in Test3.txt)
  console.error('\n=== Test 1: Search for "third" ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'third',
      limit: 10
    }
  });
  await sleep(1000);

  // Test 2: Search for "vitest" (appears in package.json)
  console.error('\n=== Test 2: Search for "vitest" ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'vitest',
      limit: 10
    }
  });
  await sleep(1000);

  // Test 3: Case-insensitive search for "TEST" 
  console.error('\n=== Test 3: Case-insensitive search for "TEST" ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'TEST',
      ignoreCase: true,
      limit: 10
    }
  });
  await sleep(1000);

  // Test 4: Regex search for numbers (version numbers, etc)
  console.error('\n=== Test 4: Regex search for version numbers ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: '\\d+\\.\\d+\\.\\d+',
      regex: true,
      limit: 10
    }
  });
  await sleep(1000);

  // Test 5: Search with path filter - only in .txt files
  console.error('\n=== Test 5: Search "file" only in .txt files ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'file',
      paths: ['*.txt'],
      limit: 10
    }
  });
  await sleep(1000);

  // Test 6: Search with path filter - only in package.json
  console.error('\n=== Test 6: Search "dependencies" only in package.json ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'dependencies',
      paths: ['package.json'],
      limit: 10
    }
  });
  await sleep(1000);

  // Test 7: Complex regex - match lines starting with "This"
  console.error('\n=== Test 7: Regex for lines starting with "This" ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: '^This',
      regex: true,
      limit: 10
    }
  });
  await sleep(1000);

  // Test 8: Search for special characters (parentheses)
  console.error('\n=== Test 8: Search for parentheses ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: '(that',
      limit: 10
    }
  });
  await sleep(1000);

  // Test 9: Regex with OR pattern
  console.error('\n=== Test 9: Regex OR pattern (third|fourth) ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'third|fourth|vitest',
      regex: true,
      limit: 10
    }
  });
  await sleep(1000);

  // Test 10: Search for glob pattern strings in ignore file
  console.error('\n=== Test 10: Search for "*.log" pattern ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: '*.log',
      limit: 10
    }
  });
  await sleep(1000);

  // Wait for all results
  await sleep(2000);
  
  console.error('\n=== All Search Tests Completed ===');
  console.error('\nSummary:');
  testResults.forEach(result => {
    console.error(`  ${result}`);
  });
  
  process.exit(0);
}

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.error) {
      const testName = `Test ${response.id - 1}`;
      console.error(`❌ ${testName}: Error - ${response.error.message}`);
      testResults.push(`❌ ${testName}: Failed`);
    } else if (response.result) {
      if (response.result.structuredContent) {
        const commits = Array.isArray(response.result.structuredContent) 
          ? response.result.structuredContent 
          : response.result.structuredContent.commits || [];
        const testName = `Test ${response.id - 1}`;
        const count = commits.length;
        
        console.error(`✅ ${testName}: Found ${count} commits`);
        if (count > 0) {
          console.error(`   Matching files: ${[...new Set(commits.flatMap(c => c.files || []))].join(', ')}`);
        }
        testResults.push(`✅ ${testName}: ${count} matches`);
      }
    }
  } catch (e) {
    // Not JSON, likely a notification or parse error
    console.error('Parse error:', e.message);
  }
});

// Start tests
setTimeout(runSearchTests, 100);