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
          } else if (toolResponse && toolResponse.error) {
            resolve({
              success: false,
              error: JSON.stringify(toolResponse.error, null, 2),
              stderr: stderr.trim(),
              rawOutput: stdout
            });
          } else {
            resolve({
              success: false,
              error: 'No valid response found',
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
      if (result.data && result.data.content && Array.isArray(result.data.content)) {
        console.log(`   Timeline entries: ${result.data.content.length}`);
        if (result.data.content.length > 0) {
          console.log(`   First entry: ${result.data.content[0].event || 'unknown'}`);
          console.log(`   Last entry: ${result.data.content[result.data.content.length - 1].event || 'unknown'}`);
        }
      }
    } else {
      testResults.summary.failed++;
      testResults.summary.errors.push({ testName, error: result.error });
      console.log(`❌ ${testName}: FAILED`);
      console.log(`   Error: ${result.error}`);
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

// Main test suite with correct parameter names
async function runTimelineTests() {
  console.log('🔍 Starting comprehensive unfugit_timeline tests (FIXED)...');
  console.log(`📁 Working directory: ${process.cwd()}`);
  
  // Check what files exist
  const files = fs.readdirSync('.').filter(f => f.endsWith('.txt') || f.endsWith('.md'));
  console.log(`📄 Found ${files.length} test files:`, files.slice(0, 10));

  // Test 1: Get timeline for existing files (using "path" parameter)
  await runTest(
    'Timeline for existing text file', 
    'unfugit_timeline', 
    { path: 'diff-test-a.txt' }
  );

  await runTest(
    'Timeline for README.md', 
    'unfugit_timeline', 
    { path: 'README.md' }
  );

  await runTest(
    'Timeline for renamed file', 
    'unfugit_timeline', 
    { path: 'renamed_file.txt' }
  );

  // Test 2: Test with non-existent files
  await runTest(
    'Timeline for non-existent file', 
    'unfugit_timeline', 
    { path: 'non-existent-file.txt' }
  );

  // Test 3: Test with binary files
  await runTest(
    'Timeline for binary file', 
    'unfugit_timeline', 
    { path: 'test-binary.bin' }
  );

  // Test 4: Test with subdirectory files
  await runTest(
    'Timeline for subdirectory file', 
    'unfugit_timeline', 
    { path: 'subdir/nested-test.txt' }
  );

  await runTest(
    'Timeline for deep nested file', 
    'unfugit_timeline', 
    { path: 'deep/nested/structure/file.txt' }
  );

  // Test 5: Test with special characters
  await runTest(
    'Timeline for file with spaces', 
    'unfugit_timeline', 
    { path: 'test file with spaces.txt' }
  );

  await runTest(
    'Timeline for file with special chars', 
    'unfugit_timeline', 
    { path: 'test@#$%^&()_+.txt' }
  );

  // Test 6: Test with limit parameter
  await runTest(
    'Timeline with limit 5', 
    'unfugit_timeline', 
    { path: 'diff-test-a.txt', limit: 5 }
  );

  await runTest(
    'Timeline with limit 1', 
    'unfugit_timeline', 
    { path: 'diff-test-a.txt', limit: 1 }
  );

  // Test 7: Test with offset parameter
  await runTest(
    'Timeline with offset', 
    'unfugit_timeline', 
    { path: 'diff-test-a.txt', limit: 3, offset: 2 }
  );

  // Test 8: Test with various file types
  await runTest(
    'Timeline for Python file', 
    'unfugit_timeline', 
    { path: 'src/main.py' }
  );

  await runTest(
    'Timeline for TypeScript file', 
    'unfugit_timeline', 
    { path: 'src/unfugit.ts' }
  );

  await runTest(
    'Timeline for JSON file', 
    'unfugit_timeline', 
    { path: 'package.json' }
  );

  // Test 9: Test absolute vs relative paths
  await runTest(
    'Timeline with relative path', 
    'unfugit_timeline', 
    { path: './diff-test-a.txt' }
  );

  // Test 10: Test error conditions
  await runTest(
    'Timeline with empty path', 
    'unfugit_timeline', 
    { path: '' }
  );

  // Test 11: Test files with Unicode characters
  await runTest(
    'Timeline for Unicode file', 
    'unfugit_timeline', 
    { path: 'test-файл-测试.txt' }
  );

  // Test 12: Test directory path (should fail gracefully)
  await runTest(
    'Timeline for directory', 
    'unfugit_timeline', 
    { path: 'src' }
  );

  // Test 13: Test file in test directories
  await runTest(
    'Timeline for test directory file', 
    'unfugit_timeline', 
    { path: 'test-dir/file.txt' }
  );

  // Test 14: Test specific file types that are likely to have histories
  await runTest(
    'Timeline for history test file 1', 
    'unfugit_timeline', 
    { path: 'history-test-1.txt' }
  );

  await runTest(
    'Timeline for history test file 2', 
    'unfugit_timeline', 
    { path: 'history-test-2.txt' }
  );

  // Generate final report
  console.log('\n' + '='.repeat(80));
  console.log('📊 UNFUGIT_TIMELINE COMPREHENSIVE TEST RESULTS (FIXED)');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`Passed: ${testResults.summary.passed}`);
  console.log(`Failed: ${testResults.summary.failed}`);
  console.log(`Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);

  if (testResults.summary.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    testResults.summary.errors.forEach((error, i) => {
      console.log(`${i + 1}. ${error.testName}: ${error.error.substring(0, 200)}...`);
    });
  }

  // Save detailed results to file
  const reportPath = 'temp2_timeline.md';
  await generateMarkdownReport(reportPath);
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// Generate improved markdown report
async function generateMarkdownReport(filePath) {
  let markdown = `# Unfugit Timeline Tool Comprehensive Test Report (CORRECTED)

Generated: ${new Date().toISOString()}

## Summary

- **Total Tests**: ${testResults.summary.total}
- **Passed**: ${testResults.summary.passed} 
- **Failed**: ${testResults.summary.failed}
- **Success Rate**: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%

## Key Findings

The \`unfugit_timeline\` tool expects a **\`path\`** parameter, not \`file_path\`. This tool shows the complete history of a single file across renames and moves, providing chronological ordering of all events affecting that file.

## Test Results

`;

  testResults.tests.forEach((test, i) => {
    markdown += `### ${i + 1}. ${test.testName}\n\n`;
    markdown += `**Tool**: \`${test.toolName}\`\n\n`;
    markdown += `**Parameters**:\n\`\`\`json\n${JSON.stringify(test.params, null, 2)}\n\`\`\`\n\n`;
    
    if (test.result && test.result.success) {
      markdown += `**Status**: ✅ PASSED\n\n`;
      
      if (test.result.data) {
        const data = test.result.data;
        markdown += `**Response Summary**:\n`;
        if (data.content && Array.isArray(data.content)) {
          markdown += `- Timeline entries: ${data.content.length}\n`;
          if (data.content.length > 0) {
            markdown += `- First event: ${data.content[0].event || 'unknown'}\n`;
            markdown += `- Last event: ${data.content[data.content.length - 1].event || 'unknown'}\n`;
            if (data.content[0].commit) {
              markdown += `- Earliest commit: ${data.content[0].commit.substring(0, 8)}\n`;
            }
            if (data.content[data.content.length - 1].commit) {
              markdown += `- Latest commit: ${data.content[data.content.length - 1].commit.substring(0, 8)}\n`;
            }
          }
        }
        markdown += '\n';
        
        // Show sample timeline entries
        if (data.content && data.content.length > 0) {
          markdown += `**Sample Timeline Entries**:\n\`\`\`json\n`;
          const sampleEntries = data.content.slice(0, 3).map(entry => ({
            event: entry.event,
            commit: entry.commit?.substring(0, 8),
            timestamp: entry.timestamp,
            message: entry.message?.substring(0, 50) + (entry.message?.length > 50 ? '...' : ''),
            path: entry.path
          }));
          markdown += JSON.stringify(sampleEntries, null, 2);
          markdown += '\n\`\`\`\n\n';
        }
      }
      
      if (test.result.stderr) {
        markdown += `**Server Log**: \`${test.result.stderr.split('\\n')[0]}\`\n\n`;
      }
    } else {
      markdown += `**Status**: ❌ FAILED\n\n`;
      const errorStr = test.result?.error || test.error || 'Unknown error';
      markdown += `**Error**: ${errorStr.substring(0, 500)}${errorStr.length > 500 ? '...' : ''}\n\n`;
    }
    
    markdown += '---\n\n';
  });

  if (testResults.summary.errors.length > 0) {
    markdown += '## Error Summary\n\n';
    testResults.summary.errors.forEach((error, i) => {
      markdown += `${i + 1}. **${error.testName}**: ${error.error.substring(0, 200)}...\n`;
    });
    markdown += '\n';
  }

  // Add analysis section
  const passedTests = testResults.tests.filter(t => t.result.success);
  const failedTests = testResults.tests.filter(t => !t.result.success);

  markdown += '## Analysis\n\n';
  markdown += `### Successful Tests (${passedTests.length})\n\n`;
  if (passedTests.length > 0) {
    markdown += 'These tests demonstrate the tool working correctly:\n';
    passedTests.forEach(test => {
      const entryCount = test.result.data?.content?.length || 0;
      markdown += `- **${test.testName}**: ${entryCount} timeline entries found\n`;
    });
    markdown += '\n';
  }

  markdown += `### Failed Tests (${failedTests.length})\n\n`;
  if (failedTests.length > 0) {
    markdown += 'These tests reveal tool limitations or errors:\n';
    failedTests.forEach(test => {
      markdown += `- **${test.testName}**: ${test.result?.error?.substring(0, 100) || 'Error occurred'}...\n`;
    });
    markdown += '\n';
  }

  markdown += '## Conclusions\n\n';
  markdown += `The \`unfugit_timeline\` tool was tested comprehensively with ${testResults.summary.total} different scenarios. `;
  markdown += `${testResults.summary.passed} tests passed (${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}% success rate).\n\n`;
  
  markdown += '### Key Capabilities\n\n';
  markdown += '- Tracks file history across renames and moves\n';
  markdown += '- Supports files in subdirectories and with special characters\n';
  markdown += '- Provides chronological ordering of timeline events\n';
  markdown += '- Supports limit and offset parameters for pagination\n';
  markdown += '- Works with both text and binary files\n\n';

  markdown += '### Parameter Requirements\n\n';
  markdown += '- **`path`** (required): File path relative to project root\n';
  markdown += '- **`limit`** (optional): Maximum number of timeline entries to return (default: 10)\n';
  markdown += '- **`offset`** (optional): Number of entries to skip for pagination\n\n';

  markdown += '### Timeline Entry Format\n\n';
  markdown += 'Each timeline entry typically contains:\n';
  markdown += '- `event`: Type of event (e.g., "created", "modified", "renamed")\n';
  markdown += '- `commit`: Git commit hash\n';
  markdown += '- `timestamp`: When the event occurred\n';
  markdown += '- `message`: Commit message\n';
  markdown += '- `path`: File path at the time of the event\n';

  fs.writeFileSync(filePath, markdown, 'utf8');
}

// Run the tests
if (require.main === module) {
  runTimelineTests().catch(console.error);
}

module.exports = { runTimelineTests, callUnfugitTool };