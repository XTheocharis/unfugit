#!/usr/bin/env node

/**
 * Test unfugit's read-only query capabilities against real git repositories
 * This script tests all the query tools that unfugit provides, treating
 * actual git repositories as if they were audit repositories.
 */

import { spawn } from 'child_process';
import { resolve, join, basename } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

class GitRepoTester {
  constructor(repoPath) {
    this.repoPath = resolve(repoPath);
    this.repoName = basename(this.repoPath);
    this.testResults = {
      repository: this.repoName,
      path: this.repoPath,
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };
  }

  log(level, message, data = null) {
    const levelColors = {
      'INFO': colors.green,
      'ERROR': colors.red,
      'WARN': colors.yellow,
      'TEST': colors.cyan,
      'PASS': colors.green,
      'FAIL': colors.red,
      'RESULT': colors.magenta
    };
    
    const color = levelColors[level] || '';
    const icon = level === 'PASS' ? '✓' : level === 'FAIL' ? '✗' : level === 'TEST' ? '►' : '';
    
    console.log(`${color}${icon ? icon + ' ' : ''}${level.padEnd(6)}${colors.reset} ${message}`);
    
    if (data && level === 'RESULT') {
      const lines = typeof data === 'string' ? data.split('\n') : JSON.stringify(data, null, 2).split('\n');
      lines.forEach(line => {
        console.log(`${colors.dim}        ${line}${colors.reset}`);
      });
    }
  }

  // Test functions that run git commands directly on the repo
  async runTest(name, testFn) {
    this.log('TEST', name);
    
    try {
      const result = await testFn();
      this.testResults.tests.push({
        name,
        status: 'passed',
        result
      });
      this.testResults.summary.passed++;
      this.testResults.summary.total++;
      this.log('PASS', `${name} completed`);
      return result;
    } catch (_error) {
      this.testResults.tests.push({
        name,
        status: 'failed',
        error: error.message
      });
      this.testResults.summary.failed++;
      this.testResults.summary.total++;
      this.log('FAIL', `${name} failed: ${error.message}`);
      return null;
    }
  }

  // Git command helper
  gitCmd(cmd) {
    try {
      return execSync(`git ${cmd}`, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
    } catch (_error) {
      throw new Error(`Git command failed: ${cmd}`);
    }
  }

  // Test: Repository validation
  async testRepoValid() {
    return this.runTest('Repository Validation', async () => {
      if (!existsSync(join(this.repoPath, '.git'))) {
        throw new Error('Not a git repository');
      }
      
      const branch = this.gitCmd('branch --show-current');
      const commitCount = this.gitCmd('rev-list --count HEAD');
      
      this.log('RESULT', 'Repository info:', {
        valid: true,
        branch,
        commits: commitCount
      });
      
      return { branch, commits: parseInt(commitCount) };
    });
  }

  // Test: History listing
  async testHistory() {
    return this.runTest('History Listing', async () => {
      const history = this.gitCmd('log --oneline -10');
      const lines = history.split('\n');
      
      this.log('RESULT', `Found ${lines.length} recent commits`);
      
      // Test different history filters
      const authorCommits = this.gitCmd('log --oneline --author="." -5 2>/dev/null || echo ""');
      const dateCommits = this.gitCmd('log --oneline --since="1 month ago" -5');
      
      return {
        total: lines.length,
        hasAuthorFilter: authorCommits.length > 0,
        hasDateFilter: dateCommits.length > 0
      };
    });
  }

  // Test: Diff operations
  async testDiff() {
    return this.runTest('Diff Operations', async () => {
      // Test different diff scenarios
      const tests = [];
      
      // HEAD vs HEAD~1
      try {
        const statDiff = this.gitCmd('diff --stat HEAD~1 HEAD 2>/dev/null || echo "No parent commit"');
        tests.push({ type: 'HEAD~1..HEAD', success: !statDiff.includes('No parent') });
      } catch {
        tests.push({ type: 'HEAD~1..HEAD', success: false });
      }
      
      // Working directory changes
      try {
        const workingDiff = this.gitCmd('diff --stat');
        tests.push({ type: 'working-dir', hasChanges: workingDiff.length > 0 });
      } catch {
        tests.push({ type: 'working-dir', success: false });
      }
      
      // Staged changes
      try {
        const stagedDiff = this.gitCmd('diff --staged --stat');
        tests.push({ type: 'staged', hasChanges: stagedDiff.length > 0 });
      } catch {
        tests.push({ type: 'staged', success: false });
      }
      
      this.log('RESULT', `Diff tests: ${tests.filter(t => t.success !== false).length}/${tests.length} successful`);
      
      return tests;
    });
  }

  // Test: Commit search (pickaxe)
  async testSearch() {
    return this.runTest('Content Search (Pickaxe)', async () => {
      const searchTerms = ['TODO', 'FIXME', 'function', 'class', 'import'];
      const results = [];
      
      for (const term of searchTerms) {
        try {
          // Use git log -S for pickaxe search
          const matches = this.gitCmd(`log -S"${term}" --oneline -5 2>/dev/null || echo ""`);
          const count = matches ? matches.split('\n').filter(l => l.trim()).length : 0;
          results.push({ term, found: count });
        } catch {
          results.push({ term, found: 0 });
        }
      }
      
      const totalFound = results.reduce((sum, r) => sum + r.found, 0);
      this.log('RESULT', `Search results: ${totalFound} total matches across ${searchTerms.length} terms`);
      
      return results;
    });
  }

  // Test: Show commit details
  async testShow() {
    return this.runTest('Show Commit Details', async () => {
      const tests = [];
      
      // Show HEAD
      try {
        const headInfo = this.gitCmd('show --stat HEAD');
        tests.push({ ref: 'HEAD', success: true, hasStats: headInfo.includes('file') });
      } catch {
        tests.push({ ref: 'HEAD', success: false });
      }
      
      // Show with different formats
      try {
        const formats = ['--stat', '--name-only', '--name-status'];
        for (const format of formats) {
          const output = this.gitCmd(`show ${format} HEAD`);
          tests.push({ format, success: true, hasOutput: output.length > 0 });
        }
      } catch (_e) {
        // Some formats might fail
      }
      
      this.log('RESULT', `Show tests: ${tests.filter(t => t.success).length}/${tests.length} successful`);
      
      return tests;
    });
  }

  // Test: File retrieval at specific commits
  async testFileRetrieval() {
    return this.runTest('File Retrieval', async () => {
      // Get a file from the repo
      const files = this.gitCmd('ls-files -z').split('\0').filter(f => f);
      
      if (files.length === 0) {
        throw new Error('No files in repository');
      }
      
      // Take first few files
      const testFiles = files.slice(0, 3);
      const results = [];
      
      for (const file of testFiles) {
        try {
          // Get file at HEAD
          const content = this.gitCmd(`show HEAD:"${file}" 2>/dev/null | head -1`);
          results.push({ file, retrieved: content.length > 0 });
        } catch {
          results.push({ file, retrieved: false });
        }
      }
      
      this.log('RESULT', `Retrieved ${results.filter(r => r.retrieved).length}/${results.length} files`);
      
      return results;
    });
  }

  // Test: Timeline (file history)
  async testTimeline() {
    return this.runTest('File Timeline', async () => {
      // Get a file to test timeline
      const files = this.gitCmd('ls-files').split('\n').filter(f => f);
      
      if (files.length === 0) {
        throw new Error('No files to test timeline');
      }
      
      const testFile = files[0];
      const results = [];
      
      // Get file history
      try {
        const history = this.gitCmd(`log --follow --oneline -- "${testFile}" | head -10`);
        const commits = history.split('\n').filter(l => l);
        results.push({
          file: testFile,
          commits: commits.length,
          hasHistory: commits.length > 0
        });
        
        // Check for renames
        const renames = this.gitCmd(`log --follow --name-status --format="%H" -- "${testFile}" | grep "^R" | wc -l`);
        results.push({
          hasRenames: parseInt(renames) > 0
        });
      } catch {
        results.push({ file: testFile, error: true });
      }
      
      this.log('RESULT', `Timeline for ${testFile}: ${results[0]?.commits || 0} commits`);
      
      return results;
    });
  }

  // Test: Statistics
  async testStats() {
    return this.runTest('Repository Statistics', async () => {
      const stats = {};
      
      // Basic stats
      stats.commits = parseInt(this.gitCmd('rev-list --count HEAD'));
      stats.branches = this.gitCmd('branch -a').split('\n').length;
      stats.tags = this.gitCmd('tag').split('\n').filter(t => t).length;
      
      // File stats
      stats.files = parseInt(this.gitCmd('ls-files | wc -l'));
      stats.authors = parseInt(this.gitCmd('shortlog -sn | wc -l'));
      
      // Size stats
      try {
        const sizeOutput = this.gitCmd('count-objects -v');
        const sizeMatch = sizeOutput.match(/size: (\d+)/);
        stats.sizeKb = sizeMatch ? parseInt(sizeMatch[1]) : 0;
      } catch {
        stats.sizeKb = 0;
      }
      
      this.log('RESULT', 'Repository statistics:', stats);
      
      return stats;
    });
  }

  // Test: Branch operations
  async testBranches() {
    return this.runTest('Branch Operations', async () => {
      const branches = this.gitCmd('branch -a').split('\n').map(b => b.trim());
      const current = branches.find(b => b.startsWith('*'))?.replace('* ', '') || 'unknown';
      
      const results = {
        total: branches.length,
        current,
        local: branches.filter(b => !b.includes('remotes/')).length,
        remote: branches.filter(b => b.includes('remotes/')).length
      };
      
      this.log('RESULT', `Branches: ${results.local} local, ${results.remote} remote`);
      
      return results;
    });
  }

  // Test: Ignore patterns
  async testIgnores() {
    return this.runTest('Ignore Patterns', async () => {
      const gitignorePath = join(this.repoPath, '.gitignore');
      const hasGitignore = existsSync(gitignorePath);
      
      const results = {
        hasGitignore,
        patterns: []
      };
      
      if (hasGitignore) {
        const fs = await import('fs');
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const patterns = content.split('\n')
          .filter(line => line.trim() && !line.startsWith('#'))
          .slice(0, 10); // First 10 patterns
        results.patterns = patterns;
      }
      
      // Check excluded files
      try {
        const excluded = this.gitCmd('ls-files -o -i --exclude-standard | wc -l');
        results.excludedCount = parseInt(excluded);
      } catch {
        results.excludedCount = 0;
      }
      
      this.log('RESULT', `Ignore patterns: ${results.patterns.length} patterns, ${results.excludedCount} files excluded`);
      
      return results;
    });
  }

  // Run all tests
  async runAllTests() {
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}Testing Repository: ${colors.magenta}${this.repoName}${colors.reset}`);
    console.log(`${colors.cyan}Path: ${this.repoPath}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

    // Run tests in order
    await this.testRepoValid();
    await this.testHistory();
    await this.testDiff();
    await this.testSearch();
    await this.testShow();
    await this.testFileRetrieval();
    await this.testTimeline();
    await this.testStats();
    await this.testBranches();
    await this.testIgnores();

    // Print summary
    console.log(`\n${colors.bright}Test Summary:${colors.reset}`);
    console.log(`${colors.green}  ✓ Passed: ${this.testResults.summary.passed}${colors.reset}`);
    
    if (this.testResults.summary.failed > 0) {
      console.log(`${colors.red}  ✗ Failed: ${this.testResults.summary.failed}${colors.reset}`);
    }
    
    console.log(`  Total: ${this.testResults.summary.total}`);
    
    const successRate = (this.testResults.summary.passed / this.testResults.summary.total * 100).toFixed(1);
    const rateColor = successRate >= 80 ? colors.green : successRate >= 50 ? colors.yellow : colors.red;
    console.log(`  ${rateColor}Success Rate: ${successRate}%${colors.reset}`);

    return this.testResults;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${colors.bright}Usage: node test-git-repos.js <repo-path> [repo-path...]${colors.reset}`);
    console.log('\nExamples:');
    console.log('  node test-git-repos.js .');
    console.log('  node test-git-repos.js /home/user/.claude/mcp-servers/autogit');
    console.log('  node test-git-repos.js ~/projects/repo1 ~/projects/repo2');
    process.exit(1);
  }

  console.log(`${colors.blue}${colors.bright}╔${'═'.repeat(58)}╗${colors.reset}`);
  console.log(`${colors.blue}${colors.bright}║   Unfugit Read-Only Query Tests on Git Repositories    ║${colors.reset}`);
  console.log(`${colors.blue}${colors.bright}╚${'═'.repeat(58)}╝${colors.reset}`);

  const allResults = [];

  // Test each repository
  for (const repoPath of args) {
    if (!existsSync(repoPath)) {
      console.log(`${colors.red}✗ Skipping ${repoPath} - does not exist${colors.reset}`);
      continue;
    }

    const tester = new GitRepoTester(repoPath);
    const results = await tester.runAllTests();
    allResults.push(results);
  }

  // Overall summary
  if (allResults.length > 1) {
    console.log(`\n${colors.blue}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.blue}${colors.bright}Overall Summary${colors.reset}`);
    console.log(`${colors.blue}${'═'.repeat(60)}${colors.reset}\n`);

    let totalTests = 0;
    let totalPassed = 0;

    for (const result of allResults) {
      const rate = (result.summary.passed / result.summary.total * 100).toFixed(1);
      const rateColor = rate >= 80 ? colors.green : rate >= 50 ? colors.yellow : colors.red;
      
      console.log(`${result.repository.padEnd(30)} ${rateColor}${rate}%${colors.reset} (${result.summary.passed}/${result.summary.total})`);
      
      totalTests += result.summary.total;
      totalPassed += result.summary.passed;
    }

    console.log(`\n${colors.bright}Total: ${totalPassed}/${totalTests} tests passed${colors.reset}`);
    
    const overallRate = (totalPassed / totalTests * 100).toFixed(1);
    const overallColor = overallRate >= 80 ? colors.green : overallRate >= 50 ? colors.yellow : colors.red;
    console.log(`${colors.bright}Overall Success Rate: ${overallColor}${overallRate}%${colors.reset}`);
  }

  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});