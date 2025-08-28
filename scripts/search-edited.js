#!/usr/bin/env node

// Search for commits containing "edited"
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

async function runSearch() {
  // Initialize
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'search-client', version: '1.0.0' }
  });
  await sleep(500);

  // Search for commits containing "edited"
  console.error('\n=== Searching for commits with "edited" ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: 'edited',
      limit: 20
    }
  });
  await sleep(2000);

  // Also try with regex for case-insensitive search
  console.error('\n=== Searching with case-insensitive pattern ===');
  sendRequest('tools/call', {
    name: 'unfugit_find_by_content',
    arguments: {
      term: '[Ee]dited',
      regex: true,
      limit: 20
    }
  });
  await sleep(2000);

  console.error('\n=== Search Complete ===');
  process.exit(0);
}

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.error) {
      console.error(`❌ Error: ${JSON.stringify(response.error, null, 2)}`);
    } else if (response.result) {
      if (response.result.structuredContent?.commits) {
        const commits = response.result.structuredContent.commits;
        console.error(`\n📋 Found ${commits.length} commits with "edited":`);
        commits.forEach(commit => {
          console.error(`  - ${commit.hash.substring(0, 8)} | ${commit.date} | Files: ${commit.files.join(', ')}`);
          if (commit.additions) {
            commit.additions.forEach(add => {
              console.error(`    + "${add}"`);
            });
          }
          if (commit.deletions) {
            commit.deletions.forEach(del => {
              console.error(`    - "${del}"`);
            });
          }
        });
      }
      
      // Show abbreviated result
      let resultStr = JSON.stringify(response.result, null, 2);
      if (resultStr.length > 1000) {
        resultStr = resultStr.substring(0, 1000) + '...';
      }
      console.error(`\n✅ Full response: ${resultStr}`);
    }
  } catch (_e) {
    // Not JSON, likely a notification
    if (!line.includes('notification') && !line.includes('list_changed')) {
      console.error(`📢 ${line}`);
    }
  }
});

// Start search
setTimeout(runSearch, 100);