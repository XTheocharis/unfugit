import { spawn } from 'child_process';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

async function debugTest() {
  // Create test directory
  const testDir = join(tmpdir(), 'unfugit-debug-test');
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
  mkdirSync(testDir, { recursive: true });

  console.log('Test directory:', testDir);

  // Start the server
  const server = spawn('node', ['dist/unfugit.js', testDir], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  server.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
  });

  let serverOutput = '';
  server.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });

  // Give server time to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '1.0.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };

  console.log('Sending initialize request:', JSON.stringify(initRequest));
  server.stdin.write(JSON.stringify(initRequest) + '\n');

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create a test file
  writeFileSync(join(testDir, 'restore_test.txt'), 'Original content for restore test');
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Modify the file
  writeFileSync(join(testDir, 'restore_test.txt'), 'Modified content');
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Send restore preview request
  const previewRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'unfugit_restore_preview',
      arguments: {
        commit: 'HEAD~1',
        paths: ['restore_test.txt']
      }
    }
  };

  console.log('Sending preview request:', JSON.stringify(previewRequest));
  server.stdin.write(JSON.stringify(previewRequest) + '\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Server output received:', serverOutput);

  server.kill();
}

debugTest().catch(console.error);