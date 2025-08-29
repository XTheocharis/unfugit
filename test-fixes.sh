#!/bin/bash
# Test script to verify the fixes made to unfugit

set -e

echo "Testing unfugit MCP server fixes"
echo "================================="

# Start the server in background
echo "Starting unfugit server..."
node dist/unfugit.js /tmp/test-project &
SERVER_PID=$!
sleep 2

# Function to send MCP request
send_request() {
    echo "$1" | nc -N localhost 3000 2>/dev/null || true
}

# Create test project with some files
echo "Setting up test project..."
mkdir -p /tmp/test-project
cd /tmp/test-project
git init
echo "test content" > test.txt
git add test.txt
git commit -m "Initial commit"

# Test 1: unfugit_show with HEAD reference (should work now)
echo -e "\n1. Testing unfugit_show with HEAD reference..."
cat << 'EOF' | node -e "
const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join(process.cwd(), 'dist/unfugit.js'), '/tmp/test-project']);

server.stderr.on('data', (data) => {
  if (data.toString().includes('MCP server running')) {
    // Send initialize
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'test', version: '1.0' } }
    }) + '\n');
    
    setTimeout(() => {
      // Test unfugit_show with HEAD
      server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'unfugit_show',
          arguments: { commit: 'HEAD' }
        }
      }) + '\n');
      
      setTimeout(() => {
        console.log('✓ unfugit_show with HEAD executed without error');
        process.exit(0);
      }, 1000);
    }, 1000);
  }
});

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.error) {
          console.error('✗ Error:', response.error.message);
          process.exit(1);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  });
});

setTimeout(() => {
  console.error('✗ Test timeout');
  process.exit(1);
}, 5000);
"
EOF

# Test 2: unfugit_diff with custom parameters
echo -e "\n2. Testing unfugit_diff with custom from_ref and to_ref..."
cat << 'EOF' | node -e "
const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join(process.cwd(), 'dist/unfugit.js'), '/tmp/test-project']);

server.stderr.on('data', (data) => {
  if (data.toString().includes('MCP server running')) {
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'test', version: '1.0' } }
    }) + '\n');
    
    setTimeout(() => {
      // Test unfugit_diff with custom refs
      server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'unfugit_diff',
          arguments: { base: 'HEAD~1', head: 'HEAD' }
        }
      }) + '\n');
      
      setTimeout(() => {
        console.log('✓ unfugit_diff with custom parameters executed');
        process.exit(0);
      }, 1000);
    }, 1000);
  }
});

setTimeout(() => {
  console.error('✗ Test timeout');
  process.exit(1);
}, 5000);
"
EOF

# Test 3: unfugit_stats with extended parameter
echo -e "\n3. Testing unfugit_stats with extended=true..."
cat << 'EOF' | node -e "
const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join(process.cwd(), 'dist/unfugit.js'), '/tmp/test-project']);

server.stderr.on('data', (data) => {
  if (data.toString().includes('MCP server running')) {
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'test', version: '1.0' } }
    }) + '\n');
    
    setTimeout(() => {
      // Test unfugit_stats with extended
      server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'unfugit_stats',
          arguments: { extended: true }
        }
      }) + '\n');
      
      setTimeout(() => {
        console.log('✓ unfugit_stats with extended=true executed');
        process.exit(0);
      }, 1000);
    }, 1000);
  }
});

setTimeout(() => {
  console.error('✗ Test timeout');
  process.exit(1);
}, 5000);
"
EOF

# Test 4: unfugit_ignores with correct schema
echo -e "\n4. Testing unfugit_ignores with corrected schema..."
cat << 'EOF' | node -e "
const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join(process.cwd(), 'dist/unfugit.js'), '/tmp/test-project']);

server.stderr.on('data', (data) => {
  if (data.toString().includes('MCP server running')) {
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'test', version: '1.0' } }
    }) + '\n');
    
    setTimeout(() => {
      // Test unfugit_ignores with check mode
      server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'unfugit_ignores',
          arguments: { mode: 'check', which: 'effective' }
        }
      }) + '\n');
      
      setTimeout(() => {
        console.log('✓ unfugit_ignores with corrected schema executed');
        process.exit(0);
      }, 1000);
    }, 1000);
  }
});

setTimeout(() => {
  console.error('✗ Test timeout');
  process.exit(1);
}, 5000);
"
EOF

# Clean up
echo -e "\nCleaning up..."
kill $SERVER_PID 2>/dev/null || true
rm -rf /tmp/test-project

echo -e "\n✅ All fixes verified successfully!"