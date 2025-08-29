#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test results storage
const testResults = {
  tests: [],
  summary: { total: 0, passed: 0, failed: 0, errors: [] }
};

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
        clientInfo: { name: 'timeline-test', version: '1.0.0' }
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
          } else {
            resolve({
              success: false,
              error: toolResponse?.error || 'No valid response',
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
      }, 3000);
    }, 1000);
  });
}

// Test runner function
async function runTest(testName, toolName, params) {
  console.log(`\n🧪 Running test: ${testName}`);
  console.log(`   Tool: ${toolName}`);
  console.log(`   Params: ${JSON.stringify(params, null, 2)}`);
  
  try {
    const result = await callUnfugitTool(toolName, params);
    
    const testResult = {
      testName,
      toolName,
      params,
      result,
      timestamp: new Date().toISOString()
    };
    
    testResults.tests.push(testResult);
    testResults.summary.total++;
    
    if (result.success) {
      testResults.summary.passed++;
      console.log(`✅ ${testName}: PASSED`);
      if (result.data && result.data.content) {
        console.log(`   Timeline entries: ${result.data.content.length || 'N/A'}`);
      }
    } else {
      testResults.summary.failed++;
      testResults.summary.errors.push({ testName, error: result.error });
      console.log(`❌ ${testName}: FAILED`);
      console.log(`   Error: ${result.error}`);
      if (result.stderr) {
        console.log(`   Stderr: ${result.stderr}`);
      }
    }
    
    return testResult;
  } catch (error) {
    console.log(`💥 ${testName}: EXCEPTION - ${error.message}`);
    testResults.summary.total++;
    testResults.summary.failed++;
    testResults.summary.errors.push({ testName, error: error.message });
    return { testName, error: error.message };
  }
}

// Main test suite
async function runTimelineTests() {
  console.log('🔍 Starting comprehensive unfugit_timeline tests...');
  console.log(`📁 Working directory: ${process.cwd()}`);
  
  // Check what files exist
  const files = fs.readdirSync('.').filter(f => f.endsWith('.txt') || f.endsWith('.md'));
  console.log(`📄 Found ${files.length} test files:`, files.slice(0, 10));

  // Test 1: Get timeline for existing files
  await runTest(
    'Timeline for existing text file', 
    'unfugit_timeline', 
    { file_path: 'diff-test-a.txt' }
  );

  await runTest(
    'Timeline for README.md', 
    'unfugit_timeline', 
    { file_path: 'README.md' }
  );

  await runTest(
    'Timeline for renamed file', 
    'unfugit_timeline', 
    { file_path: 'renamed_file.txt' }
  );

  // Test 2: Test with non-existent files
  await runTest(
    'Timeline for non-existent file', 
    'unfugit_timeline', 
    { file_path: 'non-existent-file.txt' }
  );

  // Test 3: Test with binary files
  await runTest(
    'Timeline for binary file', 
    'unfugit_timeline', 
    { file_path: 'test-binary.bin' }
  );

  // Test 4: Test with subdirectory files
  await runTest(
    'Timeline for subdirectory file', 
    'unfugit_timeline', 
    { file_path: 'subdir/nested-test.txt' }
  );

  await runTest(
    'Timeline for deep nested file', 
    'unfugit_timeline', 
    { file_path: 'deep/nested/structure/file.txt' }
  );

  // Test 5: Test with special characters
  await runTest(
    'Timeline for file with spaces', 
    'unfugit_timeline', 
    { file_path: 'test file with spaces.txt' }
  );

  await runTest(
    'Timeline for file with special chars', 
    'unfugit_timeline', 
    { file_path: 'test@#$%^&()_+.txt' }
  );

  // Test 6: Test with limit parameter (if supported)
  await runTest(
    'Timeline with limit parameter', 
    'unfugit_timeline', 
    { file_path: 'diff-test-a.txt', limit: 5 }
  );

  // Test 7: Test with various file types
  await runTest(
    'Timeline for Python file', 
    'unfugit_timeline', 
    { file_path: 'src/main.py' }
  );

  await runTest(
    'Timeline for TypeScript file', 
    'unfugit_timeline', 
    { file_path: 'src/unfugit.ts' }
  );

  await runTest(
    'Timeline for JSON file', 
    'unfugit_timeline', 
    { file_path: 'package.json' }
  );

  // Test 8: Test absolute vs relative paths
  await runTest(
    'Timeline with absolute path', 
    'unfugit_timeline', 
    { file_path: path.join(process.cwd(), 'diff-test-a.txt') }
  );

  // Test 9: Test error conditions
  await runTest(
    'Timeline with empty path', 
    'unfugit_timeline', 
    { file_path: '' }
  );

  await runTest(
    'Timeline with null path', 
    'unfugit_timeline', 
    { file_path: null }
  );

  // Test 10: Test directory path (should fail)
  await runTest(
    'Timeline for directory', 
    'unfugit_timeline', 
    { file_path: 'src/' }
  );

  // Generate final report
  console.log('\n' + '='.repeat(80));
  console.log('📊 UNFUGIT_TIMELINE COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`Passed: ${testResults.summary.passed}`);
  console.log(`Failed: ${testResults.summary.failed}`);
  console.log(`Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);

  if (testResults.summary.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    testResults.summary.errors.forEach((error, i) => {
      console.log(`${i + 1}. ${error.testName}: ${error.error}`);
    });
  }

  // Save detailed results to file
  const reportPath = 'temp2_timeline.md';
  await generateMarkdownReport(reportPath);
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// Generate markdown report
async function generateMarkdownReport(filePath) {
  let markdown = `# Unfugit Timeline Tool Comprehensive Test Report

Generated: ${new Date().toISOString()}

## Summary

- **Total Tests**: ${testResults.summary.total}
- **Passed**: ${testResults.summary.passed} 
- **Failed**: ${testResults.summary.failed}
- **Success Rate**: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%

## Test Results

`;

  testResults.tests.forEach((test, i) => {
    markdown += `### ${i + 1}. ${test.testName}\n\n`;
    markdown += `**Tool**: \`${test.toolName}\`\n\n`;
    markdown += `**Parameters**:\n\`\`\`json\n${JSON.stringify(test.params, null, 2)}\n\`\`\`\n\n`;
    
    if (test.result && test.result.success) {
      markdown += `**Status**: ✅ PASSED\n\n`;
      
      if (test.result.data) {
        markdown += `**Response Data**:\n\`\`\`json\n${JSON.stringify(test.result.data, null, 2)}\n\`\`\`\n\n`;
      }
      
      if (test.result.stderr) {
        markdown += `**Stderr**: \`${test.result.stderr}\`\n\n`;
      }
    } else {
      markdown += `**Status**: ❌ FAILED\n\n`;
      markdown += `**Error**: \`${test.result?.error || test.error || 'Unknown error'}\`\n\n`;
      
      if (test.result && test.result.stderr) {
        markdown += `**Stderr**:\n\`\`\`\n${test.result.stderr}\n\`\`\`\n\n`;
      }
      
      if (test.result && test.result.rawOutput) {
        markdown += `**Raw Output**:\n\`\`\`\n${test.result.rawOutput.substring(0, 1000)}${test.result.rawOutput.length > 1000 ? '...' : ''}\n\`\`\`\n\n`;
      }
    }
    
    markdown += '---\n\n';
  });

  if (testResults.summary.errors.length > 0) {
    markdown += '## Error Summary\n\n';
    testResults.summary.errors.forEach((error, i) => {
      markdown += `${i + 1}. **${error.testName}**: ${error.error}\n`;
    });
    markdown += '\n';
  }

  markdown += '## Conclusions\n\n';
  markdown += 'This report shows the comprehensive testing results for the unfugit_timeline MCP tool, ';
  markdown += 'including tests for existing files, non-existent files, binary files, files in subdirectories, ';
  markdown += 'files with special characters, and various error conditions.\n';

  fs.writeFileSync(filePath, markdown, 'utf8');
}

// Run the tests
if (require.main === module) {
  runTimelineTests().catch(console.error);
}

module.exports = { runTimelineTests, callUnfugitTool };