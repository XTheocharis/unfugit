#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Helper function to call unfugit tools via MCP
async function callUnfugitTool(toolName, params = {}) {
  return new Promise((resolve) => {
    const serverPath = path.join(process.cwd(), 'dist', 'unfugit.js');
    const projectPath = process.cwd();
    
    const child = spawn('node', [serverPath, projectPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send MCP initialization
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'timeline-deep-test', version: '1.0.0' }
      }
    };

    const toolCall = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    child.stdin.write(JSON.stringify(initMessage) + '\n');
    
    setTimeout(() => {
      child.stdin.write(JSON.stringify(toolCall) + '\n');
      
      setTimeout(() => {
        child.kill('SIGTERM');
        
        try {
          const responses = stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
              try { return JSON.parse(line); } 
              catch { return null; }
            })
            .filter(Boolean);
          
          const toolResponse = responses.find(r => r.id === 2);
          
          if (toolResponse && toolResponse.result) {
            resolve({
              success: true,
              data: toolResponse.result,
              stderr: stderr.trim()
            });
          } else if (toolResponse && toolResponse.error) {
            resolve({
              success: false,
              error: JSON.stringify(toolResponse.error, null, 2),
              stderr: stderr.trim()
            });
          } else {
            resolve({
              success: false,
              error: 'No valid response',
              stderr: stderr.trim(),
              rawOutput: stdout
            });
          }
        } catch (error) {
          resolve({
            success: false,
            error: error.message,
            stderr: stderr.trim(),
            rawOutput: stdout
          });
        }
      }, 4000); // Longer timeout for detailed analysis
    }, 1000);
  });
}

async function deepTimelineAnalysis() {
  console.log('🔍 Starting deep timeline analysis...');
  
  // First, create some test files and modifications to generate timeline history
  console.log('\n📝 Creating test file with modifications...');
  
  const testFile = 'timeline-test-file.txt';
  const testFile2 = 'timeline-renamed-file.txt';
  
  // Create initial file
  fs.writeFileSync(testFile, 'Initial content\nLine 2\nLine 3\n', 'utf8');
  
  // Wait a bit then modify
  await new Promise(resolve => setTimeout(resolve, 1000));
  fs.appendFileSync(testFile, 'Added line 4\n', 'utf8');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  fs.writeFileSync(testFile, 'Modified content\nLine 2 changed\nLine 3\nAdded line 4\nLine 5 added\n', 'utf8');
  
  // Create another file for rename testing
  fs.writeFileSync(testFile2, 'This file will be renamed\n', 'utf8');
  
  // Wait a bit to let unfugit audit track these changes
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('📊 Getting detailed timeline data...\n');
  
  // Test 1: Get timeline for our test file
  console.log('=== Test 1: Timeline for created/modified file ===');
  const result1 = await callUnfugitTool('unfugit_timeline', { path: testFile });
  if (result1.success) {
    console.log(`✅ Success: ${result1.data.content.length} entries`);
    console.log('Full response structure:');
    console.log(JSON.stringify(result1.data, null, 2));
  } else {
    console.log(`❌ Failed: ${result1.error}`);
  }
  
  // Test 2: Test with different limits
  console.log('\n=== Test 2: Timeline with limit=1 ===');
  const result2 = await callUnfugitTool('unfugit_timeline', { path: testFile, limit: 1 });
  if (result2.success) {
    console.log(`✅ Success: ${result2.data.content.length} entries (limit=1)`);
    console.log('Limited response:');
    console.log(JSON.stringify(result2.data, null, 2));
  } else {
    console.log(`❌ Failed: ${result2.error}`);
  }
  
  // Test 3: Test with offset
  console.log('\n=== Test 3: Timeline with offset=1 ===');
  const result3 = await callUnfugitTool('unfugit_timeline', { path: testFile, limit: 5, offset: 1 });
  if (result3.success) {
    console.log(`✅ Success: ${result3.data.content.length} entries (offset=1)`);
    console.log('Offset response:');
    console.log(JSON.stringify(result3.data, null, 2));
  } else {
    console.log(`❌ Failed: ${result3.error}`);
  }
  
  // Test 4: Test an existing file that has been modified
  console.log('\n=== Test 4: Timeline for existing modified file ===');
  const result4 = await callUnfugitTool('unfugit_timeline', { path: 'diff-test-a.txt' });
  if (result4.success) {
    console.log(`✅ Success: ${result4.data.content.length} entries`);
    console.log('Existing file timeline:');
    console.log(JSON.stringify(result4.data, null, 2));
  } else {
    console.log(`❌ Failed: ${result4.error}`);
  }
  
  // Test 5: Rename file and test timeline tracking
  console.log('\n=== Test 5: Rename file and check timeline ===');
  const renamedFile = 'timeline-renamed-to-this.txt';
  try {
    fs.renameSync(testFile2, renamedFile);
    console.log(`Renamed ${testFile2} to ${renamedFile}`);
    
    // Wait for unfugit to notice
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const result5a = await callUnfugitTool('unfugit_timeline', { path: testFile2 });
    console.log(`Timeline for original name (${testFile2}):`);
    if (result5a.success) {
      console.log(`✅ Success: ${result5a.data.content.length} entries`);
      console.log(JSON.stringify(result5a.data, null, 2));
    } else {
      console.log(`❌ Failed: ${result5a.error}`);
    }
    
    const result5b = await callUnfugitTool('unfugit_timeline', { path: renamedFile });
    console.log(`Timeline for new name (${renamedFile}):`);
    if (result5b.success) {
      console.log(`✅ Success: ${result5b.data.content.length} entries`);
      console.log(JSON.stringify(result5b.data, null, 2));
    } else {
      console.log(`❌ Failed: ${result5b.error}`);
    }
  } catch (error) {
    console.log(`❌ Rename failed: ${error.message}`);
  }
  
  // Test 6: Test binary file timeline
  console.log('\n=== Test 6: Timeline for binary file ===');
  const result6 = await callUnfugitTool('unfugit_timeline', { path: 'test-binary.bin' });
  if (result6.success) {
    console.log(`✅ Success: ${result6.data.content.length} entries`);
    console.log('Binary file timeline:');
    console.log(JSON.stringify(result6.data, null, 2));
  } else {
    console.log(`❌ Failed: ${result6.error}`);
  }
  
  // Test 7: Test deep nested file
  console.log('\n=== Test 7: Timeline for deep nested file ===');
  const result7 = await callUnfugitTool('unfugit_timeline', { path: 'deep/nested/structure/file.txt' });
  if (result7.success) {
    console.log(`✅ Success: ${result7.data.content.length} entries`);
    console.log('Deep nested file timeline:');
    console.log(JSON.stringify(result7.data, null, 2));
  } else {
    console.log(`❌ Failed: ${result7.error}`);
  }
  
  // Test 8: Test non-existent file
  console.log('\n=== Test 8: Timeline for non-existent file ===');
  const result8 = await callUnfugitTool('unfugit_timeline', { path: 'completely-non-existent-file.txt' });
  if (result8.success) {
    console.log(`✅ Success: ${result8.data.content.length} entries`);
    console.log('Non-existent file timeline:');
    console.log(JSON.stringify(result8.data, null, 2));
  } else {
    console.log(`❌ Failed: ${result8.error}`);
  }
  
  console.log('\n=== Analysis Complete ===');
  console.log('All test files created and timeline data captured.');
  console.log('Check the full JSON output above for detailed timeline structure.');
}

// Run the deep analysis
if (require.main === module) {
  deepTimelineAnalysis().catch(console.error);
}

module.exports = { deepTimelineAnalysis };