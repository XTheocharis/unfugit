#!/usr/bin/env node
/**
 * Unfugit Test Mode
 *
 * This is a special version of unfugit that treats the target repository
 * AS the audit repository for testing purposes. This allows us to test
 * all read-only query functionality against real git repositories.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import * as git from "isomorphic-git";
import * as fsFull from "fs";
// Configuration
const TEST_MODE = true; // This flag indicates we're in test mode
let targetRepo;
let server;
// Helper function to format commit info
function formatCommitInfo(commit) {
    const hash = commit.oid?.substring(0, 8) || 'unknown';
    const author = commit.commit?.author?.name || 'unknown';
    const date = commit.commit?.author?.timestamp ?
        new Date(commit.commit.author.timestamp * 1000).toISOString() : 'unknown';
    const message = commit.commit?.message?.split('\n')[0] || 'no message';
    return `${hash} - ${author} - ${date} - ${message}`;
}
// Helper to get commits
async function getCommits(repo, limit = 10) {
    try {
        const commits = await git.log({
            fs: fsFull,
            dir: repo,
            depth: limit
        });
        return commits;
    }
    catch (error) {
        console.error('Error getting commits:', error);
        return [];
    }
}
// Initialize server
async function initializeServer(repoPath) {
    targetRepo = path.resolve(repoPath);
    // Verify it's a git repository
    const gitDir = path.join(targetRepo, '.git');
    try {
        const stats = await fs.stat(gitDir);
        if (!stats.isDirectory()) {
            throw new Error(`Not a git repository: ${targetRepo}`);
        }
    }
    catch (error) {
        throw new Error(`Invalid repository: ${targetRepo} - ${error}`);
    }
    server = new McpServer({
        name: "unfugit-test-mode",
        version: "1.0.0"
    });
    // Tool: ping
    server.addTool({
        name: "ping",
        description: "Test connectivity",
        inputSchema: z.object({}).strict(),
        handler: async () => {
            return {
                content: [{
                        type: "text",
                        text: `Unfugit Test Mode - Repository: ${targetRepo}`
                    }]
            };
        }
    });
    // Tool: history
    server.addTool({
        name: "history",
        description: "Get commit history",
        inputSchema: z.object({
            limit: z.number().default(10),
            skip: z.number().default(0)
        }).strict(),
        handler: async (args) => {
            const commits = await getCommits(targetRepo, args.limit + args.skip);
            const sliced = commits.slice(args.skip, args.skip + args.limit);
            const output = sliced.map(c => formatCommitInfo(c)).join('\n');
            return {
                content: [{
                        type: "text",
                        text: output || "No commits found"
                    }]
            };
        }
    });
    // Tool: diff
    server.addTool({
        name: "diff",
        description: "Get diff between commits",
        inputSchema: z.object({
            from: z.string().default("HEAD~1"),
            to: z.string().default("HEAD")
        }).strict(),
        handler: async (args) => {
            try {
                // Get the OIDs for the refs
                const fromOid = await git.resolveRef({
                    fs: fsFull,
                    dir: targetRepo,
                    ref: args.from
                });
                const toOid = await git.resolveRef({
                    fs: fsFull,
                    dir: targetRepo,
                    ref: args.to
                });
                return {
                    content: [{
                            type: "text",
                            text: `Diff ${args.from} (${fromOid?.substring(0, 8)}) .. ${args.to} (${toOid?.substring(0, 8)})\n[Diff calculation would go here]`
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{
                            type: "text",
                            text: `Error calculating diff: ${error.message}`
                        }]
                };
            }
        }
    });
    // Tool: show
    server.addTool({
        name: "show",
        description: "Show commit details",
        inputSchema: z.object({
            ref: z.string().default("HEAD")
        }).strict(),
        handler: async (args) => {
            try {
                const oid = await git.resolveRef({
                    fs: fsFull,
                    dir: targetRepo,
                    ref: args.ref
                });
                const commit = await git.readCommit({
                    fs: fsFull,
                    dir: targetRepo,
                    oid: oid
                });
                const info = formatCommitInfo({ oid, commit });
                const fullMessage = commit.commit.message || '';
                return {
                    content: [{
                            type: "text",
                            text: `Commit: ${info}\n\nFull message:\n${fullMessage}`
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{
                            type: "text",
                            text: `Error showing commit: ${error.message}`
                        }]
                };
            }
        }
    });
    // Tool: search
    server.addTool({
        name: "search",
        description: "Search in commit messages",
        inputSchema: z.object({
            term: z.string(),
            limit: z.number().default(10)
        }).strict(),
        handler: async (args) => {
            try {
                const commits = await getCommits(targetRepo, 100);
                const matches = commits.filter(c => c.commit?.message?.toLowerCase().includes(args.term.toLowerCase())).slice(0, args.limit);
                if (matches.length === 0) {
                    return {
                        content: [{
                                type: "text",
                                text: `No commits found containing "${args.term}"`
                            }]
                    };
                }
                const output = matches.map(c => formatCommitInfo(c)).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Found ${matches.length} commits containing "${args.term}":\n\n${output}`
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{
                            type: "text",
                            text: `Error searching: ${error.message}`
                        }]
                };
            }
        }
    });
    // Tool: stats
    server.addTool({
        name: "stats",
        description: "Get repository statistics",
        inputSchema: z.object({}).strict(),
        handler: async () => {
            try {
                const commits = await getCommits(targetRepo, 1000);
                const branches = await git.listBranches({
                    fs: fsFull,
                    dir: targetRepo
                });
                const tags = await git.listTags({
                    fs: fsFull,
                    dir: targetRepo
                });
                return {
                    content: [{
                            type: "text",
                            text: `Repository Statistics:
- Path: ${targetRepo}
- Total commits: ${commits.length}
- Branches: ${branches.length} (${branches.slice(0, 5).join(', ')}${branches.length > 5 ? '...' : ''})
- Tags: ${tags.length}
- Test Mode: Active`
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{
                            type: "text",
                            text: `Error getting stats: ${error.message}`
                        }]
                };
            }
        }
    });
    // Tool: branches
    server.addTool({
        name: "branches",
        description: "List branches",
        inputSchema: z.object({}).strict(),
        handler: async () => {
            try {
                const branches = await git.listBranches({
                    fs: fsFull,
                    dir: targetRepo
                });
                const current = await git.currentBranch({
                    fs: fsFull,
                    dir: targetRepo
                });
                const output = branches.map(b => b === current ? `* ${b}` : `  ${b}`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: output || "No branches found"
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{
                            type: "text",
                            text: `Error listing branches: ${error.message}`
                        }]
                };
            }
        }
    });
    // Tool: files
    server.addTool({
        name: "files",
        description: "List files at a commit",
        inputSchema: z.object({
            ref: z.string().default("HEAD"),
            path: z.string().default("/")
        }).strict(),
        handler: async (args) => {
            try {
                const oid = await git.resolveRef({
                    fs: fsFull,
                    dir: targetRepo,
                    ref: args.ref
                });
                // This would list files, but isomorphic-git has limitations here
                return {
                    content: [{
                            type: "text",
                            text: `Files at ${args.ref} (${oid?.substring(0, 8)}):\n[File listing would go here - limited by isomorphic-git]`
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{
                            type: "text",
                            text: `Error listing files: ${error.message}`
                        }]
                };
            }
        }
    });
    // Set up transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Unfugit Test Mode - Using repository: ${targetRepo}`);
    console.error(`Ready for read-only queries against git history`);
}
// Main entry point
async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error("Usage: node unfugit-test-mode.js <repository-path>");
        process.exit(1);
    }
    try {
        await initializeServer(args[0]);
    }
    catch (error) {
        console.error(`Failed to initialize: ${error.message}`);
        process.exit(1);
    }
}
main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});
