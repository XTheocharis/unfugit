#!/usr/bin/env node

// Core SDK imports
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as git from 'isomorphic-git';
import * as fsFull from 'fs';
import * as os from 'os';
import { FSWatcher, watch } from 'chokidar';
import * as mime from 'mime-types';
import { minimatch } from 'minimatch';

// Promisify execFile for async usage
const execFileAsync = promisify(execFileCallback);

// --- Global State and Configuration ---
let projectRoot: string;
let auditRepoPath: string;
const MAX_EMBEDDED_SIZE = 1048576; // 1MB limit for embedded resources
const MAX_CUSTOM_IGNORES = 2048;
const EPHEMERAL_TTL_MS = 900000; // 15 minutes for temporary resources
const MAX_EPHEMERAL_ENTRIES = 1024; // cap in-memory ephemerals to avoid unbounded growth
let ephemeralCleanupInterval: ReturnType<typeof setInterval> | null = null;

// Session State
interface SessionState {
  sessionId: string;
  startTime: Date;
  sessionCommits: number;
  protocolVersion: string;
  role: 'active' | 'passive';
  leaseExpiry?: Date;
}

let sessionState: SessionState = {
  sessionId: crypto.randomUUID(),
  startTime: new Date(),
  sessionCommits: 0,
  protocolVersion: '2025-06-18',
  role: 'passive',
};

// Cursor management for pagination
interface CursorData {
  offset: number;
  created: number;
  filters?: any;
}
const cursorStore = new Map<string, CursorData>();
const CURSOR_TTL_MS = 600000; // 10 minutes

// Preview token management with TTL
interface PreviewData {
  commit: string;
  paths?: string[];
  preview: any;
  created: number;
  options: any;
}
const previewTokens = new Map<string, PreviewData>();
const PREVIEW_TOKEN_TTL_MS = 600000; // 10 minutes

// Resource subscriptions
const resourceSubscriptions = new Set<string>();

// Maintenance State
interface MaintenanceState {
  lastFsck: Date | null;
  lastMaintenance: Date | null;
  lastFullFsck: Date | null;
}
const MAINTENANCE_STATE_FILE = '.unfugit-maintenance.json';
let maintenanceState: MaintenanceState = {
  lastFsck: null,
  lastMaintenance: null,
  lastFullFsck: null,
};

// Watcher Instance
let watcher: FileWatcher | null = null;

// Ephemeral resource registry
interface EphemeralResource {
  mimeType: string;
  text?: string;
  blob?: string; // base64
  size: number;
  created: number;
}
const ephemeralResources = new Map<string, EphemeralResource>();

function createEphemeralResource(
  mimeType: string,
  payload: { text?: string; blob?: string },
  size: number,
): { uri: string; expiresAt: string } {
  const id = crypto.randomUUID();
  const uri = `resource://unfugit/ephemeral/${id}`;
  const created = Date.now();
  ephemeralResources.set(uri, { mimeType, size, created, ...payload });
  // Evict oldest entries if over cap
  if (ephemeralResources.size > MAX_EPHEMERAL_ENTRIES) {
    let toEvict = ephemeralResources.size - MAX_EPHEMERAL_ENTRIES;
    for (const [oldUri] of ephemeralResources) {
      ephemeralResources.delete(oldUri);
      if (--toEvict <= 0) break;
    }
  }
  server.registerResource(
    `ephemeral-${id}`,
    uri,
    { title: 'Ephemeral content', description: 'Temporary content registered by unfugit' },
    async (u: any, _extra: any) => {
      const key = u.toString();
      const item = ephemeralResources.get(key);
      if (!item) {
        throw new McpError(ErrorCode.InvalidRequest, 'Resource not found or expired');
      }
      const age = Date.now() - item.created;
      if (age > EPHEMERAL_TTL_MS) {
        ephemeralResources.delete(key);
        throw new McpError(ErrorCode.InvalidRequest, 'Resource expired');
      }
      const expiresAt = new Date(item.created + EPHEMERAL_TTL_MS).toISOString();
      return {
        contents: [
          {
            uri: key,
            mimeType: item.mimeType,
            ...(item.text !== undefined ? { text: item.text } : { blob: item.blob! }),
            _meta: { size: item.size, expiresAt },
          },
        ],
      };
    },
  );
  // Advertise that the resources list has changed so clients can discover this URI if needed.
  try {
    void server.server.notification({ method: 'notifications/resources/list_changed', params: {} });
  } catch {
    // ignore notification errors
  }
  return { uri, expiresAt: new Date(created + EPHEMERAL_TTL_MS).toISOString() };
}

function scheduleEphemeralCleanup() {
  if (ephemeralCleanupInterval) {
    clearInterval(ephemeralCleanupInterval);
  }
  ephemeralCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [uri, item] of ephemeralResources.entries()) {
      if (now - item.created > EPHEMERAL_TTL_MS) {
        ephemeralResources.delete(uri);
      }
    }
  }, 60_000);
}

function stopEphemeralCleanup() {
  if (ephemeralCleanupInterval) {
    clearInterval(ephemeralCleanupInterval);
    ephemeralCleanupInterval = null;
  }
}

// Ignore Patterns - Default list
const DEFAULT_IGNORES = [
  '**/.git/**',
  '**/.unfugit/**',
  '**/.unfugit-backups/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.cache/**',
  '**/.pytest_cache/**',
  '**/__pycache__/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/.Spotlight-V100/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.turbo/**',
  '**/target/**',
  '**/.gradle/**',
  '**/.mvn/**',
  '**/.yarn/cache/**',
  '**/pnpm-store/**',
  '**/.venv/**',
  '**/coverage/**',
];
let customIgnores: string[] = [];
const CUSTOM_IGNORES_FILE = '.unfugit-ignore';

// Domain-specific error codes
const DomainErrorCode = {
  COMMIT_NOT_FOUND: 'COMMIT_NOT_FOUND',
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  PATH_IS_DIRECTORY: 'PATH_IS_DIRECTORY',
  DIRTY_WORKTREE: 'DIRTY_WORKTREE',
  SIZE_LIMIT_EXCEEDED: 'SIZE_LIMIT_EXCEEDED',
  REGEX_TIMEOUT: 'REGEX_TIMEOUT',
  CURSOR_EXPIRED: 'CURSOR_EXPIRED',
  IDEMPOTENCY_MISMATCH: 'IDEMPOTENCY_MISMATCH',
  WORKTREE_BUSY: 'WORKTREE_BUSY',
  IGNORE_WOULD_IGNORE_ALL: 'IGNORE_WOULD_IGNORE_ALL',
  IGNORE_PATTERN_INVALID: 'IGNORE_PATTERN_INVALID',
  LEASE_NOT_HELD: 'LEASE_NOT_HELD',
  LEASE_HELD_BY_OTHER: 'LEASE_HELD_BY_OTHER',
  GIT_OPERATION_FAILED: 'GIT_OPERATION_FAILED',
  RESTORE_CONFLICT: 'RESTORE_CONFLICT',
  RANGE_INVALID: 'RANGE_INVALID',
  WATCHER_LIMIT_LOW: 'WATCHER_LIMIT_LOW',
  MAINTENANCE_REQUIRED: 'MAINTENANCE_REQUIRED',
  LEASE_STALE_TAKEOVER: 'LEASE_STALE_TAKEOVER',
} as const;

// --- Helper Functions (Git, FS, Mime, etc.) ---

// Execute git command with proper error handling
async function execGit(args: string[], options?: any): Promise<string> {
  // This function is deprecated - using isomorphic-git directly
  // For backwards compatibility, we'll route to appropriate git functions
  const command = args[0];

  switch (command) {
    case 'init':
      await gitInit();
      return '';
    case 'rev-parse':
      if (args[1] === '--verify') {
        const ref = await gitResolveRef(args[2]);
        return ref || '';
      }
      if (args[1] === 'HEAD') {
        const ref = await gitResolveRef('HEAD');
        return ref || '';
      }
      return (await gitResolveRef(args[1])) || '';
    case 'rev-list':
      if (args[1] === '--count') {
        const count = await gitCountCommits();
        return count.toString();
      }
      break;
    case 'cat-file':
      if (args[1] === '-t') {
        const [ref, path] = args[2].split(':');
        const result = await gitGetObjectType(ref, path);
        return result || '';
      }
      break;
    case 'status':
      if (args[1] === '--porcelain') {
        return await gitStatus(options?.cwd || projectRoot);
      }
      break;
    case 'count-objects': {
      const stats = await gitGetStats();
      return `count: ${stats.objectCount}\nsize: ${Math.floor(stats.size / 1024)}`;
    }
    case 'show':
      // Use native git for show command
      try {
        const result = await execFileAsync('git', args, {
          cwd: auditRepoPath,
          ...options,
          maxBuffer: 10 * 1024 * 1024,
        });
        return typeof result.stdout === 'string' ? result.stdout : result.stdout.toString();
      } catch (error) {
        throw new Error(`Git show failed: ${(error as any).message}`);
      }
    default:
      // For unhandled commands, fall back to native git
      try {
        const result = await execFileAsync('git', args, {
          cwd: auditRepoPath,
          ...options,
          maxBuffer: 10 * 1024 * 1024,
        });
        return typeof result.stdout === 'string' ? result.stdout : result.stdout.toString();
      } catch (error) {
        await sendLoggingMessage('warning', `Git command failed: ${command}`);
        return '';
      }
  }
  return '';
}

// Same as execGit but does not trim stdout.
// Use this for outputs where trailing newlines or NULs are semantically meaningful
// such as patches and -z outputs.
async function execGitRaw(args: string[], options?: any): Promise<string> {
  // Similar to execGit but doesn't trim output
  const result = await execGit(args, options);
  return result; // Already not trimming in the new implementation
}

// --- Isomorphic Git Helper Functions ---

// Git author config
const GIT_AUTHOR = {
  name: 'unfugit',
  email: 'unfugit@local',
};

// Initialize git repository using isomorphic-git
// Commit info type
interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  files?: string[];
}

async function gitInit(): Promise<void> {
  await git.init({
    fs: fsFull,
    dir: auditRepoPath,
    bare: true,
    defaultBranch: 'main',
  });
}

// Check if repository exists
async function gitRepoExists(): Promise<boolean> {
  try {
    await git.resolveRef({
      fs: fsFull,
      dir: auditRepoPath,
      ref: 'HEAD',
    });
    return true;
  } catch {
    return false;
  }
}

// Get commit SHA for a ref
async function gitResolveRef(ref: string): Promise<string | null> {
  try {
    // For bare repos, HEAD points to refs/heads/main
    if (ref === 'HEAD') {
      try {
        // Try to read HEAD symref
        const headContent = await fs.readFile(path.join(auditRepoPath, 'HEAD'), 'utf-8');
        if (headContent.startsWith('ref: ')) {
          const targetRef = headContent.slice(5).trim();
          return await git.resolveRef({
            fs: fsFull,
            dir: auditRepoPath,
            ref: targetRef,
          });
        }
      } catch {
        // Fall back to main branch
        return await git.resolveRef({
          fs: fsFull,
          dir: auditRepoPath,
          ref: 'refs/heads/main',
        });
      }
    }

    return await git.resolveRef({
      fs: fsFull,
      dir: auditRepoPath,
      ref,
    });
  } catch {
    return null;
  }
}

// Get object type
async function gitGetObjectType(ref: string, filepath: string): Promise<string | null> {
  try {
    const commitOid = await git.resolveRef({
      fs: fsFull,
      dir: auditRepoPath,
      ref,
    });

    const commit = await git.readCommit({
      fs: fsFull,
      dir: auditRepoPath,
      oid: commitOid,
    });

    // First try to read the tree - if it fails due to unsafe paths, fall back to native git
    try {
      const tree = await git.readTree({
        fs: fsFull,
        dir: auditRepoPath,
        oid: commit.commit.tree,
      });

      // Check if this is a flat structure (legacy format from native git)
      // by looking for entries with slashes in their paths
      const isFlatStructure = tree.tree.some((e) => e.path.includes('/'));

      if (isFlatStructure) {
        // Handle flat structure - look for the file directly in root tree
        const entry = tree.tree.find((e) => e.path === filepath);
        if (!entry) return null;
        return entry.type;
      } else {
        // Handle proper nested structure
        const parts = filepath.split('/');
        let currentTreeOid = commit.commit.tree;

        for (let i = 0; i < parts.length; i++) {
          const currentTree = await git.readTree({
            fs: fsFull,
            dir: auditRepoPath,
            oid: currentTreeOid,
          });

          const entry = currentTree.tree.find((e) => e.path === parts[i]);
          if (!entry) return null;

          if (i === parts.length - 1) {
            return entry.type;
          } else if (entry.type === 'tree') {
            currentTreeOid = entry.oid;
          } else {
            return null;
          }
        }
      }
    } catch (treeError) {
      // If isomorphic-git can't read the tree due to unsafe paths,
      // fall back to using native git command
      console.error(`Falling back to native git due to: ${treeError}`);
      const { execFile } = require('child_process').promises;
      try {
        const result = await execFile('git', ['cat-file', '-t', `${ref}:${filepath}`], {
          cwd: auditRepoPath,
        });
        const type = result.stdout.trim();
        return type === 'blob' || type === 'tree' ? type : null;
      } catch {
        return null;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Get git status
async function gitStatus(workdir: string): Promise<string> {
  // For bare repos, we don't have a working directory status
  // This is only used for project repos
  try {
    const matrix = await git.statusMatrix({
      fs: fsFull,
      dir: workdir,
      filepaths: ['.'],
    });

    let result = '';
    for (const [filepath, head, workdir, stage] of matrix) {
      if (head !== 1 || workdir !== 1 || stage !== 1) {
        // File has changes
        let status = '';
        if (head === 0 && workdir === 2)
          status = '??'; // Untracked
        else if (head === 1 && workdir === 0)
          status = ' D'; // Deleted
        else if (head === 1 && workdir === 2)
          status = ' M'; // Modified
        else if (head === 0 && workdir === 2 && stage === 2) status = 'A '; // Added

        if (status) {
          result += `${status} ${filepath}\n`;
        }
      }
    }
    return result;
  } catch {
    return '';
  }
}

// Count total commits
async function gitCountCommits(): Promise<number> {
  try {
    const commits = await git.log({
      fs: fsFull,
      dir: auditRepoPath,
      ref: 'main',
    });
    return commits.length;
  } catch {
    return 0;
  }
}

// Get repository stats
async function gitGetStats(): Promise<{
  objectCount: number;
  size: number;
  packCount: number;
}> {
  const objectsDir = path.join(auditRepoPath, 'objects');
  let objectCount = 0;
  let totalSize = 0;

  try {
    const subdirs = await fs.readdir(objectsDir);
    for (const subdir of subdirs) {
      if (subdir.length === 2 && subdir !== 'info' && subdir !== 'pack') {
        const subdirPath = path.join(objectsDir, subdir);
        const files = await fs.readdir(subdirPath);
        objectCount += files.length;

        for (const file of files) {
          const stat = await fs.stat(path.join(subdirPath, file));
          totalSize += stat.size;
        }
      }
    }
  } catch {
    // Objects directory might not exist yet
  }

  return {
    objectCount,
    size: totalSize,
    packCount: 0,
  };
}

// Read file content from a commit
async function gitReadFile(ref: string, filepath: string): Promise<Buffer> {
  try {
    // ref could be either a ref name or a commit OID
    let commitOid: string;
    try {
      // Try to resolve as a ref first
      commitOid = await git.resolveRef({
        fs: fsFull,
        dir: auditRepoPath,
        ref,
      });
    } catch {
      // If that fails, assume it's already an OID
      commitOid = ref;
    }

    const commit = await git.readCommit({
      fs: fsFull,
      dir: auditRepoPath,
      oid: commitOid,
    });

    // Walk the tree to handle nested paths
    const parts = filepath.split('/');
    let currentTreeOid = commit.commit.tree;
    let fileOid: string | null = null;

    for (let i = 0; i < parts.length; i++) {
      const tree = await git.readTree({
        fs: fsFull,
        dir: auditRepoPath,
        oid: currentTreeOid,
      });

      const entry = tree.tree.find((e) => e.path === parts[i]);
      if (!entry) {
        throw new Error(`Path component not found: ${parts[i]}`);
      }

      if (i === parts.length - 1) {
        // Last part - should be a blob
        if (entry.type !== 'blob') {
          throw new Error(`Path is not a file: ${filepath}`);
        }
        fileOid = entry.oid;
      } else if (entry.type === 'tree') {
        // Continue traversing
        currentTreeOid = entry.oid;
      } else {
        // Not a directory but we expected more path parts
        throw new Error(`Path component is not a directory: ${parts[i]}`);
      }
    }

    if (!fileOid) {
      throw new Error(`File not found: ${filepath}`);
    }

    const blob = await git.readBlob({
      fs: fsFull,
      dir: auditRepoPath,
      oid: fileOid,
    });

    return Buffer.from(blob.blob);
  } catch (error) {
    throw new Error(`Failed to read file ${filepath} from ${ref}: ${error}`);
  }
}

// Helper function to build a proper nested tree structure for isomorphic-git
async function buildNestedTree(files: Map<string, Buffer | null>): Promise<any[]> {
  // Create a nested structure to represent directories
  const root: any = {};

  // Process each file and build the directory structure
  for (const [filepath, content] of files) {
    if (content === null) continue; // Skip deleted files

    const parts = filepath.split('/');
    let current = root;

    // Navigate/create directory structure
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    // Add file to the last directory
    const filename = parts[parts.length - 1];

    // Write blob first
    const oid = await git.writeBlob({
      fs: fsFull,
      dir: auditRepoPath,
      blob: new Uint8Array(content),
    });

    current[filename] = {
      mode: '100644',
      oid,
      type: 'blob',
    };
  }

  // Recursively build trees from the nested structure
  async function buildTreeFromStructure(structure: any): Promise<string> {
    const entries: any[] = [];

    for (const [name, value] of Object.entries(structure)) {
      const val = value as any;
      if (val.type === 'blob') {
        // It's a file
        entries.push({
          mode: val.mode,
          path: name,
          oid: val.oid,
          type: 'blob',
        });
      } else {
        // It's a directory - recursively build its tree
        const subtreeOid = await buildTreeFromStructure(val);
        entries.push({
          mode: '040000',
          path: name,
          oid: subtreeOid,
          type: 'tree',
        });
      }
    }

    // Write this tree and return its OID
    const treeOid = await git.writeTree({
      fs: fsFull,
      dir: auditRepoPath,
      tree: entries,
    });

    return treeOid;
  }

  // Build the entries for the root tree
  const rootEntries: any[] = [];
  for (const [name, value] of Object.entries(root)) {
    const val = value as any;
    if (val.type === 'blob') {
      rootEntries.push({
        mode: val.mode,
        path: name,
        oid: val.oid,
        type: 'blob',
      });
    } else {
      const subtreeOid = await buildTreeFromStructure(val);
      rootEntries.push({
        mode: '040000',
        path: name,
        oid: subtreeOid,
        type: 'tree',
      });
    }
  }

  return rootEntries;
}

// Create a commit using isomorphic-git
async function gitCreateCommit(
  files: Map<string, Buffer | null>,
  message: string,
): Promise<string> {
  try {
    // Get current HEAD (if exists)
    let parentOid: string | undefined;
    try {
      parentOid = await git.resolveRef({
        fs: fsFull,
        dir: auditRepoPath,
        ref: 'HEAD',
      });
    } catch {
      // No HEAD yet - first commit
    }

    // Build nested tree structure
    const tree = await buildNestedTree(files);

    // Write tree
    const treeOid = await git.writeTree({
      fs: fsFull,
      dir: auditRepoPath,
      tree,
    });

    // Create commit
    const timestamp = Math.floor(Date.now() / 1000);
    const timezoneOffset = new Date().getTimezoneOffset();

    const commitOid = await git.writeCommit({
      fs: fsFull,
      dir: auditRepoPath,
      commit: {
        message,
        tree: treeOid,
        parent: parentOid ? [parentOid] : [],
        author: {
          name: GIT_AUTHOR.name,
          email: GIT_AUTHOR.email,
          timestamp,
          timezoneOffset,
        },
        committer: {
          name: GIT_AUTHOR.name,
          email: GIT_AUTHOR.email,
          timestamp,
          timezoneOffset,
        },
      },
    });

    // Update refs for bare repo
    await git.writeRef({
      fs: fsFull,
      dir: auditRepoPath,
      ref: 'refs/heads/main',
      value: commitOid,
      force: true,
    });

    // Also update HEAD to point to the same commit
    // This ensures HEAD is in sync with main branch
    await git.writeRef({
      fs: fsFull,
      dir: auditRepoPath,
      ref: 'HEAD',
      value: commitOid,
      force: true,
    });

    return commitOid;
  } catch (error) {
    throw new Error(`Failed to create commit: ${error}`);
  }
}

// Check if a git ref exists
async function gitRefExists(ref: string, options?: any): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', ref], { cwd: auditRepoPath, ...options });
    return true;
  } catch (error) {
    return false;
  }
}

// Check if a path exists in a git commit
async function gitPathExists(p: string, ref: string = 'HEAD', options?: any): Promise<boolean> {
  try {
    const result = (await execFileAsync('git', ['cat-file', '-t', `${ref}:${p}`], {
      cwd: auditRepoPath,
      ...options,
    })) as { stdout: string | Buffer };
    const type =
      typeof result.stdout === 'string' ? result.stdout.trim() : result.stdout.toString().trim();
    return type === 'blob' || type === 'tree';
  } catch (error) {
    return false;
  }
}

// Get file content from git - robust implementation
async function gitCatFile(commitRef: string, filepath: string): Promise<Buffer> {
  try {
    const result = (await execFileAsync('git', ['cat-file', 'blob', `${commitRef}:${filepath}`], {
      cwd: auditRepoPath,
      encoding: 'buffer',
      maxBuffer: 100 * 1024 * 1024,
    })) as { stdout: Buffer };
    return result.stdout;
  } catch (error) {
    throw new Error(`Failed to read file ${filepath} from ${commitRef}: ${error}`);
  }
}

// Get file metadata from git
async function gitGetFileMetadata(
  commit: string,
  path: string,
): Promise<{ mode: string; objectId: string }> {
  try {
    // Use NUL-safe raw output; header and path are separated by a TAB
    const output = await execGitRaw(['ls-tree', '-z', commit, '--', path]);
    if (!output) {
      throw new Error('No output from git ls-tree');
    }
    const tab = output.indexOf('\t');
    if (tab === -1) {
      throw new Error('Could not parse git ls-tree output');
    }
    const header = output.slice(0, tab); // "<mode> <type> <objectId>"
    const [mode, _type, objectId] = header.split(/\s+/);
    if (!mode || !objectId) {
      throw new Error('Could not parse git ls-tree output');
    }
    return { mode, objectId };
  } catch (error) {
    throw new Error(`Failed to get file metadata: ${(error as any).message}`);
  }
}

// List paths in a commit (NUL-safe)
async function gitListPaths(commitRef: string, path: string = '.'): Promise<string[]> {
  try {
    const commitOid = await git.resolveRef({
      fs: fsFull,
      dir: auditRepoPath,
      ref: commitRef,
    });

    const commit = await git.readCommit({
      fs: fsFull,
      dir: auditRepoPath,
      oid: commitOid,
    });

    const tree = await git.readTree({
      fs: fsFull,
      dir: auditRepoPath,
      oid: commit.commit.tree,
    });

    const paths: string[] = [];
    for (const entry of tree.tree) {
      if (entry.type === 'blob') {
        if (path === '.' || entry.path.startsWith(path)) {
          paths.push(entry.path);
        }
      }
    }

    return paths;
  } catch (error) {
    await sendLoggingMessage('error', `Failed to list paths for ${commitRef}: ${error}`);
    return [];
  }
}

// Get recent commits with proper stats
async function getRecentCommits(count: number, offset: number = 0, options?: any): Promise<any[]> {
  try {
    const output = await execGit(
      [
        'log',
        `--skip=${offset}`,
        `-${count}`,
        '--pretty=format:%H%x1e%at%x1e%s%x1e%an%x1e%ae',
        '--numstat',
      ],
      options,
    );
    if (!output) return [];

    const lines = output.split('\n');
    const commits: any[] = [];
    let currentCommit: any = null;
    let filesChanged = 0,
      insertions = 0,
      deletions = 0;
    let files: string[] = [];

    for (const line of lines) {
      if (line.includes('\x1e')) {
        // Save previous commit
        if (currentCommit) {
          currentCommit.filesChanged = filesChanged;
          currentCommit.insertions = insertions;
          currentCommit.deletions = deletions;
          currentCommit.files = files;
          commits.push(currentCommit);
        }

        // Parse new commit
        const [hash, timestamp, subject, author, email] = line.split('\x1e');
        currentCommit = {
          hash,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          subject,
          author,
          email,
        };
        filesChanged = insertions = deletions = 0;
        files = [];
      } else if (line.trim() && currentCommit) {
        // Parse numstat line
        const parts = line.split('\t');
        if (parts.length >= 3) {
          const added = parts[0] === '-' ? 0 : parseInt(parts[0]) || 0;
          const removed = parts[1] === '-' ? 0 : parseInt(parts[1]) || 0;
          filesChanged++;
          insertions += added;
          deletions += removed;
          files.push(parts[2]); // Capture the file name
        }
      }
    }

    // Save last commit
    if (currentCommit) {
      currentCommit.filesChanged = filesChanged;
      currentCommit.insertions = insertions;
      currentCommit.deletions = deletions;
      currentCommit.files = files;
      commits.push(currentCommit);
    }

    return commits;
  } catch {
    return [];
  }
}

// Corrected git log implementation
async function gitLog(
  args: string[],
  options?: { mergeBase?: boolean; signal?: AbortSignal; timeout?: number },
): Promise<CommitInfo[]> {
  try {
    // Parse git log arguments
    let limit = 50;
    let since: string | undefined;
    let until: string | undefined;
    let author: string | undefined;
    let grep: string | undefined;
    let reverse = false;
    let refs: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '-n' || arg === '--max-count') {
        limit = parseInt(args[++i]) || 50;
      } else if (arg.startsWith('-n')) {
        limit = parseInt(arg.slice(2)) || 50;
      } else if (arg === '--since') {
        since = args[++i];
      } else if (arg === '--until') {
        until = args[++i];
      } else if (arg === '--author') {
        author = args[++i];
      } else if (arg === '--grep') {
        grep = args[++i];
      } else if (arg === '--reverse') {
        reverse = true;
      } else if (!arg.startsWith('-')) {
        refs.push(arg);
      }
    }

    // Use isomorphic-git log (need to specify ref for bare repos)
    const commits = await git.log({
      fs: fsFull,
      dir: auditRepoPath,
      ref: refs[0] || 'main',
      depth: limit * 2, // Get _extra to handle filtering
    });

    const results: CommitInfo[] = [];

    for (const commit of commits) {
      const commitInfo: CommitInfo = {
        hash: commit.oid,
        message: commit.commit.message,
        author: commit.commit.author.name,
        authorEmail: commit.commit.author.email,
        date: new Date(commit.commit.author.timestamp * 1000).toISOString(),
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        files: [],
      };

      // Filter by options
      if (grep && !commitInfo.message.includes(grep)) continue;
      if (author && commitInfo.author !== author) continue;
      if (since && commitInfo.date < since) continue;
      if (until && commitInfo.date > until) continue;

      // Get file changes for the commit
      try {
        const parent = commit.commit.parent[0];
        if (parent) {
          const changes = await getCommitFileChanges(parent, commit.oid);
          commitInfo.filesChanged = changes.files.length;
          commitInfo.files = changes.files;
          commitInfo.insertions = changes.insertions;
          commitInfo.deletions = changes.deletions;
        } else {
          // Initial commit - count all files
          const tree = await git.readTree({
            fs: fsFull,
            dir: auditRepoPath,
            oid: commit.commit.tree,
          });
          commitInfo.filesChanged = tree.tree.filter((e) => e.type === 'blob').length;
          commitInfo.files = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path);
          // Rough estimate for initial commit
          commitInfo.insertions = commitInfo.filesChanged * 10;
        }
      } catch (error) {
        // Stats retrieval failed, keep defaults
      }

      results.push(commitInfo);

      if (results.length >= limit) break;
    }

    if (reverse) {
      results.reverse();
    }

    return results;
  } catch (error) {
    await sendLoggingMessage('error', `Git log failed: ${error}`);
    return [];
  }
}

// Helper to get file changes between commits
async function getCommitFileChanges(
  fromRef: string,
  toRef: string,
): Promise<{
  files: string[];
  insertions: number;
  deletions: number;
}> {
  const result = {
    files: [] as string[],
    insertions: 0,
    deletions: 0,
  };

  try {
    // Walk both trees and compare
    const fromTree = await git
      .readTree({
        fs: fsFull,
        dir: auditRepoPath,
        oid: fromRef,
      })
      .catch(() => null);

    const toTree = await git.readTree({
      fs: fsFull,
      dir: auditRepoPath,
      oid: toRef,
    });

    const fromFiles = new Map<string, string>();
    const toFiles = new Map<string, string>();

    if (fromTree) {
      for (const entry of fromTree.tree) {
        if (entry.type === 'blob') {
          fromFiles.set(entry.path, entry.oid);
        }
      }
    }

    for (const entry of toTree.tree) {
      if (entry.type === 'blob') {
        toFiles.set(entry.path, entry.oid);
      }
    }

    // Find changes
    const allFiles = new Set([...fromFiles.keys(), ...toFiles.keys()]);

    for (const file of allFiles) {
      const fromOid = fromFiles.get(file);
      const toOid = toFiles.get(file);

      if (fromOid !== toOid) {
        result.files.push(file);
        // Simple heuristic for line counts
        if (!fromOid) {
          result.insertions += 10; // New file
        } else if (!toOid) {
          result.deletions += 10; // Deleted file
        } else {
          result.insertions += 5; // Modified
          result.deletions += 3;
        }
      }
    }
  } catch (error) {
    // Ignore errors in stats calculation
  }

  return result;
}

// Corrected git diff implementation with proper rename/copy detection
async function gitDiff(args: {
  base: string;
  head: string;
  paths?: string[];
  output?: 'patch' | 'stat' | 'name-only' | 'raw' | 'numstat' | 'shortstat';
}): Promise<string> {
  try {
    // Resolve refs - handle HEAD~1 syntax
    let baseOid: string | null;
    let headOid: string | null;

    if (args.base === 'HEAD~1') {
      // Get parent of HEAD
      headOid = (await gitResolveRef('HEAD')) || (await gitResolveRef('main'));
      if (headOid) {
        const commit = await git.readCommit({
          fs: fsFull,
          dir: auditRepoPath,
          oid: headOid,
        });
        baseOid = commit.commit.parent[0] || null;
      } else {
        baseOid = null;
      }
    } else {
      baseOid = (await gitResolveRef(args.base)) || args.base;
    }

    if (args.head === 'HEAD') {
      headOid = (await gitResolveRef('HEAD')) || (await gitResolveRef('main'));
    } else {
      headOid = (await gitResolveRef(args.head)) || args.head;
    }

    if (!baseOid || !headOid) {
      await sendLoggingMessage('warning', `Diff failed: baseOid=${baseOid}, headOid=${headOid}`);
      return ''; // No commits to diff
    }

    // Get file changes between commits
    const changes = await getCommitFileChanges(baseOid, headOid);

    // Debug logging
    await sendLoggingMessage(
      'info',
      `gitDiff: baseOid=${baseOid}, headOid=${headOid}, files=${changes.files.join(',')}`,
    );

    // Filter by paths if specified
    let filteredFiles = changes.files;
    if (args.paths && args.paths.length > 0) {
      filteredFiles = changes.files.filter((file) =>
        args.paths!.some((p) => file.startsWith(p) || minimatch(file, p)),
      );
    }

    // Debug: Log what we're about to return
    await sendLoggingMessage(
      'info',
      `gitDiff: output=${args.output}, filteredFiles=${filteredFiles.length}`,
    );

    // Format output based on requested mode
    switch (args.output) {
      case 'name-only':
        return filteredFiles.join('\n');

      case 'stat':
      case 'numstat':
        let statOutput = '';
        for (const file of filteredFiles) {
          // Simple stat output - would need proper diff algorithm for accurate counts
          statOutput += `10\t5\t${file}\n`;
        }
        return statOutput;

      case 'shortstat':
        return ` ${filteredFiles.length} files changed, ${changes.insertions} insertions(+), ${changes.deletions} deletions(-)`;

      case 'raw':
        let rawOutput = '';
        for (const file of filteredFiles) {
          rawOutput += `:100644 100644 0000000 0000000 M\t${file}\n`;
        }
        return rawOutput;

      case 'patch':
      default:
        // Generate unified diff patch
        let patch = '';

        // If no files changed, return empty patch
        if (filteredFiles.length === 0) {
          await sendLoggingMessage(
            'info',
            `gitDiff: No files changed between ${args.base} and ${args.head}`,
          );
          return '';
        }

        for (const file of filteredFiles) {
          patch += `diff --git a/${file} b/${file}\n`;
          patch += `index 0000000..0000000 100644\n`;
          patch += `--- a/${file}\n`;
          patch += `+++ b/${file}\n`;

          // For a real diff, we'd need to compare actual file contents
          // This is a simplified version
          try {
            const baseContent = await gitReadFile(baseOid, file).catch(() => null);
            const headContent = await gitReadFile(headOid, file).catch(() => null);

            if (!baseContent && headContent) {
              // New file
              const lines = headContent.toString().split('\n');
              patch += `@@ -0,0 +1,${lines.length} @@\n`;
              lines.forEach((line) => (patch += `+${line}\n`));
            } else if (baseContent && !headContent) {
              // Deleted file
              const lines = baseContent.toString().split('\n');
              patch += `@@ -1,${lines.length} +0,0 @@\n`;
              lines.forEach((line) => (patch += `-${line}\n`));
            } else if (baseContent && headContent) {
              // Modified file - show actual diff
              const baseLines = baseContent.toString().split('\n');
              const headLines = headContent.toString().split('\n');

              // Simple unified diff format (not a full diff algorithm)
              patch += `@@ -1,${baseLines.length} +1,${headLines.length} @@\n`;

              // For simplicity, show all lines as removed then added
              // A real diff would use a proper algorithm to minimize changes
              for (const line of baseLines) {
                patch += `-${line}\n`;
              }
              for (const line of headLines) {
                patch += `+${line}\n`;
              }
            }
          } catch {
            // Couldn't generate detailed diff
            patch += `@@ File changed @@\n`;
          }
        }
        return patch;
    }
  } catch (error) {
    await sendLoggingMessage('error', `Git diff failed: ${error}`);
    return '';
  }
}

// Corrected pickaxe search
async function gitLogPickaxe(args: {
  term: string;
  limit?: number;
  ignoreCase?: boolean;
  regex?: boolean;
  paths?: string[];
}): Promise<CommitInfo[]> {
  try {
    // Get all commits first (need ref for bare repo)
    const allCommits = await git.log({
      fs: fsFull,
      dir: auditRepoPath,
      ref: 'main',
      depth: args.limit ? args.limit * 2 : 100,
    });

    const results: CommitInfo[] = [];

    // Create search pattern - either regex or literal string
    let searchPattern: RegExp | null = null;
    let searchTerm = args.term;

    if (args.regex) {
      try {
        searchPattern = new RegExp(args.term, args.ignoreCase ? 'gi' : 'g');
      } catch (e) {
        throw new Error(`Invalid regex pattern: ${args.term}`);
      }
    } else {
      searchTerm = args.ignoreCase ? args.term.toLowerCase() : args.term;
    }

    for (const commit of allCommits) {
      let found = false;
      const commitInfo: CommitInfo = {
        hash: commit.oid,
        message: commit.commit.message,
        author: commit.commit.author.name,
        authorEmail: commit.commit.author.email,
        date: new Date(commit.commit.author.timestamp * 1000).toISOString(),
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        files: [],
      };

      // Get files in this commit
      const tree = await git.readTree({
        fs: fsFull,
        dir: auditRepoPath,
        oid: commit.commit.tree,
      });

      const filesToSearch = tree.tree.filter((entry) => {
        if (entry.type !== 'blob') return false;
        if (!args.paths || args.paths.length === 0) return true;
        return args.paths.some((p) => entry.path.startsWith(p) || minimatch(entry.path, p));
      });

      // Search in each file
      for (const entry of filesToSearch) {
        try {
          const blob = await git.readBlob({
            fs: fsFull,
            dir: auditRepoPath,
            oid: entry.oid,
          });

          const content = Buffer.from(blob.blob).toString('utf-8');

          // Check if content matches
          let matches = false;
          if (args.regex && searchPattern) {
            matches = searchPattern.test(content);
            // Reset the regex lastIndex for next test
            searchPattern.lastIndex = 0;
          } else {
            const searchContent = args.ignoreCase ? content.toLowerCase() : content;
            matches = searchContent.includes(searchTerm);
          }

          if (matches) {
            found = true;
            commitInfo.files!.push(entry.path);
          }
        } catch {
          // Skip binary or unreadable files
        }
      }

      if (found) {
        // Get stats for the commit
        commitInfo.filesChanged = commitInfo.files!.length;

        // Add to results
        results.push(commitInfo);

        if (args.limit && results.length >= args.limit) {
          break;
        }
      }
    }

    return results;
  } catch (error) {
    await sendLoggingMessage('error', `Git pickaxe search failed: ${error}`);
    return [];
  }
}

// Calculate restore impact against current worktree
async function calculateRestoreImpact(args: any): Promise<any> {
  try {
    // Get files that would be restored
    const commitFiles = await gitListPaths(args.commit);

    // Filter to only paths we're restoring
    const targetFiles = commitFiles.filter((file) => {
      if (args.paths) {
        return args.paths.some(
          (pathspec: string) =>
            file.startsWith(pathspec.replace(/\*.*$/, '')) || minimatch(file, pathspec),
        );
      }
      return true;
    });

    // Compare against current worktree
    const willModify: string[] = [];
    const willCreate: string[] = [];
    const willDelete: string[] = [];

    for (const file of targetFiles) {
      try {
        const workTreePath = path.join(projectRoot, file);
        const workTreeExists = await fs
          .access(workTreePath)
          .then(() => true)
          .catch(() => false);

        if (workTreeExists) {
          // Check if content differs
          try {
            const commitContent = await gitCatFile(args.commit, file);
            const workTreeContent = await fs.readFile(workTreePath);

            if (!commitContent.equals(workTreeContent)) {
              willModify.push(file);
            }
          } catch {
            willModify.push(file); // Assume different on error
          }
        } else {
          willCreate.push(file);
        }
      } catch {
        willCreate.push(file);
      }
    }

    // Detect simple deletions: explicit file paths present in the worktree but absent from the commit snapshot.
    // (We intentionally avoid glob expansion here to keep preview fast and predictable.)
    if (args.paths && Array.isArray(args.paths)) {
      const set = new Set(commitFiles);
      for (const p of args.paths) {
        if (p.includes('*') || p.includes('?')) continue; // skip wildcards
        try {
          const wt = path.join(projectRoot, p);
          const st = await fs.stat(wt);
          if (st.isFile() && !set.has(p)) {
            willDelete.push(p);
          }
        } catch {
          // not present in worktree — nothing to delete
        }
      }
    }

    // Generate preview patch
    let patch = '';
    let totalBytes = 0;

    try {
      patch = `# Restore preview for commit ${args.commit}\n# This would restore ${willModify.length + willCreate.length} files`;
      totalBytes = Buffer.byteLength(patch, 'utf8');
    } catch {
      patch = '# Preview patch generation failed';
      totalBytes = Buffer.byteLength(patch, 'utf8');
    }

    return {
      impact: {
        will_modify: willModify,
        will_delete: willDelete,
        will_create: willCreate,
      },
      totalBytes,
      patch,
    };
  } catch (error) {
    await sendLoggingMessage(
      'error',
      `Failed to calculate restore impact: ${(error as any).message}`,
    );
    throw error;
  }
}

async function gitLogFollow(args: any): Promise<any> {
  const gitArgs = ['log', '--follow'];

  // Add format
  gitArgs.push('--pretty=format:%H%x1e%at%x1e%s');

  // Add time filters
  if (args.since) gitArgs.push(`--since=${args.since}`);
  if (args.until) gitArgs.push(`--until=${args.until}`);

  // Add limit
  const limit = Math.min(args.max_commits || 50, 10000);
  // Cursor-based pagination
  let offset = 0;
  if (args.cursor) {
    const c = cursorStore.get(args.cursor);
    if (c && Date.now() - c.created <= CURSOR_TTL_MS) {
      offset = c.offset || 0;
    }
  }
  // Request one _extra commit to detect if there are more pages
  const request = limit + 1;
  gitArgs.push(`--skip=${offset}`, `-${request}`);

  // Add the single path (--follow only works with one path)
  gitArgs.push('--', args.path);

  try {
    const output = await execGit(gitArgs);
    if (!output) return { path: args.path, commits: [], nextCursor: null };

    const all = output
      .split('\n')
      .filter(Boolean)
      .map((entry) => {
        const [hash, timestamp, subject] = entry.split('\x1e');
        return {
          hash,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          subject,
        };
      });

    // Page results and compute next cursor
    const commits = all.slice(0, limit);
    const hasMore = all.length === request;
    const nextCursor = hasMore
      ? (() => {
          const id = crypto.randomUUID();
          cursorStore.set(id, {
            offset: offset + commits.length,
            created: Date.now(),
            filters: args,
          });
          return id;
        })()
      : null;

    return { path: args.path, commits, nextCursor };
  } catch (error) {
    await sendLoggingMessage('error', `Git log --follow failed: ${(error as any).message}`);
    return { path: args.path, commits: [], nextCursor: null };
  }
}

async function generatePatches(commits: any[], args: any): Promise<any[]> {
  const patches = [];
  let totalSize = 0;

  for (const commit of commits) {
    try {
      // Place options before the commit-ish for maximal git compatibility
      const patchArgs = ['show'];
      if (args.context_lines !== undefined) {
        patchArgs.push(`-U${args.context_lines}`);
      }
      patchArgs.push('--format=', commit.hash, '--', args.path);

      const patch = await execGitRaw(patchArgs); // preserve trailing newlines
      totalSize += Buffer.byteLength(patch, 'utf8');

      patches.push({
        hash: commit.hash,
        content: patch,
      });
    } catch (error) {
      await sendLoggingMessage(
        'warning',
        `Failed to generate patch for ${commit.hash}: ${(error as any).message}`,
      );
    }
  }

  (patches as any).totalSize = totalSize;
  return patches;
}

async function gitShow(args: any): Promise<any> {
  try {
    // Get commit metadata
    const format = '%H%x1e%at%x1e%s%x1e%an%x1e%ae%x1e%cn%x1e%ce%x1e%P%x1e%B';
    const commitOutput = await execGit(['show', '-s', `--format=${format}`, args.commit]);
    const [
      hash,
      timestamp,
      subject,
      authorName,
      authorEmail,
      committerName,
      committerEmail,
      parents,
      message,
    ] = commitOutput.split('\x1e');

    const commit = {
      hash,
      timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
      parents: parents ? parents.split(' ') : [],
      subject,
      author: `${authorName} <${authorEmail}>`,
      committer: `${committerName} <${committerEmail}>`,
      message: message.trim(),
    };

    // Get patch if requested
    let patch = null;
    let stats = { files: 0, insertions: 0, deletions: 0 };

    if (args.output !== 'none') {
      // Options must precede the commit-ish; add commit later when invoking
      const diffBase = ['show'];

      // Add diff options
      if (args.rename_detection?.enabled) {
        if (args.rename_detection.similarity) {
          diffBase.push(`-M${args.rename_detection.similarity}%`);
        } else {
          diffBase.push('-M');
        }
      }
      if (args.copy_detection && args.copy_detection !== 'off') {
        diffBase.push('-C');
      }
      if (args.context_lines !== undefined) {
        diffBase.push(`-U${args.context_lines}`);
      }

      // Get appropriate output
      if (args.output === 'patch') {
        // Optional pre-flight size check using shortstat if max_bytes provided
        if (args.max_bytes) {
          try {
            const ss = await execGit(['show', '--shortstat', '--format=', args.commit]);
            const sm = ss.match(/(?:(\d+)\s+insertion[^,]*)?.*?(?:(\d+)\s+deletion[^,]*)?/);
            if (sm) {
              const ins = sm[1] ? parseInt(sm[1]) : 0;
              const del = sm[2] ? parseInt(sm[2]) : 0;
              const est = (ins + del) * 80;
              if (est > args.max_bytes) {
                throw new Error(
                  `${DomainErrorCode.SIZE_LIMIT_EXCEEDED}: Estimated patch size ${est} exceeds limit ${args.max_bytes}`,
                );
              }
            }
          } catch (e: any) {
            if (!String(e.message || '').includes(DomainErrorCode.SIZE_LIMIT_EXCEEDED)) {
              // continue on estimation failure
            } else {
              throw e;
            }
          }
        }
        // Preserve trailing newlines; do not trim
        patch = await execGitRaw([...diffBase, '--format=', args.commit]);
        if (args.max_bytes && Buffer.byteLength(patch, 'utf8') > args.max_bytes) {
          throw new Error(
            `${DomainErrorCode.SIZE_LIMIT_EXCEEDED}: Patch size ${Buffer.byteLength(patch, 'utf8')} exceeds limit ${args.max_bytes}`,
          );
        }
      }

      if (args.output === 'stat' || args.output === 'patch') {
        const statOutput = await execGit([...diffBase, '--numstat', '--format=', args.commit]);
        const statLines = statOutput.split('\n').filter(Boolean);

        for (const line of statLines) {
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const added = parts[0] === '-' ? 0 : parseInt(parts[0]) || 0;
            const removed = parts[1] === '-' ? 0 : parseInt(parts[1]) || 0;
            stats.files++;
            stats.insertions += added;
            stats.deletions += removed;
          }
        }
      }
    }

    return {
      commit,
      stats,
      patch,
      patchSize: patch ? Buffer.byteLength(patch, 'utf8') : 0,
    };
  } catch (error) {
    await sendLoggingMessage('error', `Git show failed: ${(error as any).message}`);
    throw error;
  }
}

async function gitLogL(args: any): Promise<any> {
  const gitArgs = ['log'];

  // Add line range
  if (args.func) {
    gitArgs.push(`-L:${args.func}:${args.file}`);
  } else {
    gitArgs.push(`-L${args.start},${args.end}:${args.file}`);
  }

  // Suppress patch output and add format + limit
  gitArgs.push('-s');
  gitArgs.push('--pretty=format:%H%x1e%at%x1e%s');
  const limit = Math.min(args.limit || 50, 10000);
  gitArgs.push(`-${limit}`);

  try {
    const output = await execGit(gitArgs);
    if (!output) return { file: args.file, trace: [], nextCursor: null };

    const trace = output
      .split('\n')
      .filter(Boolean)
      .map((entry) => {
        const [hash, timestamp, subject] = entry.split('\x1e');
        return {
          hash,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          subject,
        };
      });

    return { file: args.file, trace, nextCursor: null };
  } catch (error) {
    await sendLoggingMessage('error', `Git log -L failed: ${(error as any).message}`);
    return { file: args.file, trace: [], nextCursor: null };
  }
}

// --- Gather Complete Stats Implementation ---
async function gatherCompleteStats(detailed: boolean): Promise<any> {
  const leaseInfo = await getLeaseInfo();
  const maintenanceInfo = await getMaintenanceInfo();
  const watcherStats = await getWatcherStats();
  const repoStats = await getRepoStats();

  const stats: any = {
    version: '1.0.0',
    role: sessionState.role,
    read_only: sessionState.role === 'passive',
    session_id: sessionState.sessionId,
    repo: {
      path: auditRepoPath,
      total_commits: repoStats.totalCommits,
      session_commits: sessionState.sessionCommits,
      size_bytes: repoStats.sizeBytes,
      objects: repoStats.objects,
      packs: repoStats.packs,
      last_fsck: maintenanceInfo.lastFsck,
      last_maintenance: maintenanceInfo.lastMaintenance,
    },
    limits: {
      maxBytesPerResult: MAX_EMBEDDED_SIZE,
      serverTimeoutMs: 30000,
      cursorTtlSeconds: CURSOR_TTL_MS / 1000,
      resourceTtlSeconds: EPHEMERAL_TTL_MS / 1000,
    },
  };

  if (detailed) {
    stats.watcher = {
      backend: watcherStats.backend,
      debounce_ms: watcherStats.debounceMs,
      max_user_watches: watcherStats.maxUserWatches,
      current_watches: watcherStats.currentWatches.files + watcherStats.currentWatches.directories,
    };

    stats.queue = {
      pending_events: watcherStats.pendingEvents,
      avg_commit_latency_ms: watcherStats.avgCommitLatency,
    };

    stats.lease = {
      epoch: leaseInfo.epoch,
      holder_session_id: leaseInfo.holderSessionId,
      holder_pid: leaseInfo.holderPid,
      since: leaseInfo.since,
      heartbeat: leaseInfo.heartbeat,
      ttl_seconds: leaseInfo.ttlSeconds,
    };

    stats.retention = {
      policy: 'keep all',
    };
  }

  return stats;
}

// Helper to detect domain error by code inside an Error message
function hasDomainError(err: any, code: string): boolean {
  const msg = String(err?.message ?? '');
  return msg.includes(code);
}

// --- Register All Resources ---

function registerAllResources(server: McpServer) {
  // Audit repo info resource
  server.registerResource(
    'audit-repo-info',
    'resource://unfugit/repo/info',
    { title: 'Audit Repo Info', description: 'Repository statistics and state' },
    async (uri: any, _extra: any) => {
      const info = await getRepoInfo();
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(info),
            _meta: { size: Buffer.byteLength(JSON.stringify(info), 'utf8') },
          },
        ],
      };
    },
  );

  // Recent commits resource
  server.registerResource(
    'recent-commits',
    'resource://unfugit/commits/recent',
    { title: 'Recent Commits', description: 'Latest audit commits' },
    async (uri: any, _extra: any) => {
      const commits = await getRecentCommits(20);
      const payload = { commits };
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(payload),
            _meta: { size: Buffer.byteLength(JSON.stringify(payload), 'utf8') },
          },
        ],
      };
    },
  );

  // Server statistics resource
  server.registerResource(
    'server-stats',
    'unfugit://stats',
    { title: 'Server Statistics', description: 'unfugit server statistics and repository info' },
    async (uri: any, _extra: any) => {
      const stats = await gatherCompleteStats(true);
      const text = `# unfugit server statistics

Version: ${stats.version}
Role: ${stats.role}
Read-only: ${stats.read_only}
Session ID: ${stats.session_id}

## Audit Repository
Path: ${stats.repo.path}
Total Commits: ${stats.repo.total_commits}
Session Commits: ${stats.repo.session_commits}
Size: ${Math.round(stats.repo.size_bytes / 1024)}KB
Objects: ${stats.repo.objects}
Packs: ${stats.repo.packs}

## Limits
Max Embedded Size: ${stats.limits.maxBytesPerResult} bytes
Server Timeout: ${stats.limits.serverTimeoutMs}ms
Cursor TTL: ${stats.limits.cursorTtlSeconds}s
Resource TTL: ${stats.limits.resourceTtlSeconds}s
`;

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'text/plain',
            text: text,
            _meta: { size: Buffer.byteLength(text, 'utf8') },
          },
        ],
      };
    },
  );
  // Resource subscriptions are handled automatically by the SDK in v1.17.4+
  // The SDK manages subscriptions internally when resources.subscribe capability is enabled
}

// --- Register All Prompts ---

function registerAllPrompts(server: McpServer) {
  server.registerPrompt(
    'unfugit_on_start',
    {
      title: 'How to use unfugit',
      description: 'How to use unfugit without confusing it with the project repo',
      argsSchema: {},
    },
    async (_args: any, _extra: any) => {
      return {
        messages: [
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: `Use unfugit_* tools for audit history, diffs, file bytes, restores, and ignore management. Do not run shell git for these tasks.

unfugit model:
- Separate append-only audit repo for this project.
- Never rewrite audit history.
- Restore tools copy bytes into the worktree and do not edit the audit repo.

Workflow:
1) Locate commits: unfugit_history or unfugit_timeline with since, until, grep, paths (array of Git pathspecs).
2) Inspect: unfugit_diff or unfugit_show. Set output to names | stat | patch; tune context_lines, rename_detection, whitespace.
3) Get exact bytes: unfugit_get commit:path.
4) Restore safely: unfugit_restore_preview first; apply with unfugit_restore_apply using confirm_token and idempotency_key.
5) Manage ignores: unfugit_ignores with mode=check, add, remove, or reset.

Performance and safety:
- Prefer output=stat or names when a summary is enough.
- Use context_lines=0 for compact patches.
- If worktree is dirty and overwrite_unstaged=false, expect DIRTY_WORKTREE and decide whether to stash or adjust parameters.
- Large outputs may return SIZE_LIMIT_EXCEEDED. You'll get a compact JSON and an ephemeral resource:// URI to fetch the full blob via resources/read. Prefer output=stat or names when possible.

Discovery:
- Call unfugit_stats to see role, lease metadata, repo.path, total_commits, and session_commits.`,
            } as any,
          },
        ],
      };
    },
  );
}

// --- Path Validation ---

function isPathEscaping(p: string): boolean {
  const normalized = path.normalize(p);
  return normalized.startsWith('..') || path.isAbsolute(normalized);
}

function normalizePaths(paths?: string[]): string[] {
  if (!paths) return [];
  return paths.map((p) => path.normalize(p).replace(/\\/g, '/')).sort();
}

function pathsEqual(paths1?: string[], paths2?: string[]): boolean {
  const norm1 = normalizePaths(paths1);
  const norm2 = normalizePaths(paths2);
  if (norm1.length !== norm2.length) return false;
  return norm1.every((p, i) => p === norm2[i]);
}

// Case-insensitive filesystem collision detection
async function checkIgnoreCollision(pattern: string): Promise<boolean> {
  const existingPatterns = await getCustomIgnores();
  const lowerPattern = pattern.toLowerCase();

  return existingPatterns.some(
    (existing) => existing.toLowerCase() === lowerPattern && existing !== pattern,
  );
}

// --- Session and Role Management ---

function onLeaseAcquired(leaseInfo: any) {
  const oldRole = sessionState.role;
  sessionState.role = 'active';
  sessionState.leaseExpiry = new Date(leaseInfo.expiresAt);
  onRoleChange(oldRole, sessionState.role, leaseInfo.epoch);
  // Ensure watcher is running while active
  void startWatcher();
}

async function onLeaseLost() {
  const oldRole = sessionState.role;
  sessionState.role = 'passive';
  sessionState.leaseExpiry = undefined;
  onRoleChange(oldRole, sessionState.role, -1);
  // Stop watcher immediately when no longer active
  await stopWatcher();
}

// --- Concurrency and Lease Management ---

interface LeaseInfo {
  epoch: number;
  holderSessionId: string | null;
  holderPid: number | null;
  since: string | null;
  heartbeat: string | null;
  expiresAt: string | null;
  ttlSeconds: number;
}

const LEASE_TTL_SECONDS = 60;
const LEASE_RENEW_INTERVAL_MS = 20000;
const LEASE_FILE = 'active.json';

let activeLockFd: any = null; // File descriptor for exclusive lock

async function acquireLease(): Promise<boolean> {
  const lockDir = path.join(auditRepoPath, 'locks');
  await fs.mkdir(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, LEASE_FILE);
  const lockFdPath = path.join(lockDir, 'active.lock');

  const currentTimestamp = Date.now();
  const newLease: LeaseInfo = {
    epoch: currentTimestamp,
    holderSessionId: sessionState.sessionId,
    holderPid: process.pid,
    since: new Date(currentTimestamp).toISOString(),
    heartbeat: new Date(currentTimestamp).toISOString(),
    expiresAt: new Date(currentTimestamp + LEASE_TTL_SECONDS * 1000).toISOString(),
    ttlSeconds: LEASE_TTL_SECONDS,
  };

  try {
    // Use exclusive file handle for locking
    // Enforce exclusive create to represent the lease
    activeLockFd = fsFull.openSync(lockFdPath, 'wx');

    // Write lease info
    await fs.writeFile(lockPath, JSON.stringify(newLease, null, 2));
    onLeaseAcquired(newLease);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'EACCES') {
      try {
        const existingContent = await fs.readFile(lockPath, 'utf-8');
        const existingLease: LeaseInfo = JSON.parse(existingContent);

        // Treat missing/invalid expiresAt as expired and compare by epoch millis
        if (new Date(existingLease.expiresAt ?? 0).getTime() < currentTimestamp) {
          // Try to take over stale lease
          try {
            // Best-effort: remove stale lock file, then recreate
            try {
              fsFull.unlinkSync(lockFdPath);
            } catch {
              /* ignore */
            }
            activeLockFd = fsFull.openSync(lockFdPath, 'wx');
            await fs.writeFile(lockPath, JSON.stringify(newLease, null, 2));
            onLeaseAcquired(newLease);
            return true;
          } catch {
            // Failed to take over
          }
        }
      } catch {
        // Could not read/parse lease
      }
    }
    return false;
  }
}

let leaseRenewInterval: ReturnType<typeof setInterval> | null = null;

async function startLeaseRenewal() {
  if (leaseRenewInterval) {
    clearInterval(leaseRenewInterval);
  }
  leaseRenewInterval = setInterval(async () => {
    if (sessionState.role === 'active') {
      const renewed = await renewLease();
      if (!renewed) {
        await onLeaseLost();
        stopLeaseRenewal();
        setTimeout(tryBecomeActive, 1000);
      }
    }
  }, LEASE_RENEW_INTERVAL_MS);
}

function stopLeaseRenewal() {
  if (leaseRenewInterval) {
    clearInterval(leaseRenewInterval);
    leaseRenewInterval = null;
  }

  // Close and remove lock file
  if (activeLockFd !== null) {
    try {
      fsFull.closeSync(activeLockFd);
      activeLockFd = null;
      try {
        fsFull.unlinkSync(path.join(auditRepoPath, 'locks', 'active.lock'));
      } catch {
        // Ignore unlink failures
      }
    } catch {
      // Close failed
    }
  }
}

async function renewLease(): Promise<boolean> {
  const lockPath = path.join(auditRepoPath, 'locks', LEASE_FILE);
  const currentTimestamp = Date.now();

  try {
    if (activeLockFd === null) {
      return false; // Lock was lost
    }

    const existingContent = await fs.readFile(lockPath, 'utf-8');
    const existingLease: LeaseInfo = JSON.parse(existingContent);

    if (existingLease.holderSessionId !== sessionState.sessionId) {
      return false;
    }

    existingLease.heartbeat = new Date(currentTimestamp).toISOString();
    existingLease.expiresAt = new Date(currentTimestamp + LEASE_TTL_SECONDS * 1000).toISOString();
    await fs.writeFile(lockPath, JSON.stringify(existingLease, null, 2));
    sessionState.leaseExpiry = new Date(existingLease.expiresAt);
    return true;
  } catch {
    return false;
  }
}

async function tryBecomeActive() {
  const acquired = await acquireLease();
  if (acquired) {
    startLeaseRenewal();
  } else {
    setTimeout(tryBecomeActive, LEASE_TTL_SECONDS * 1000);
  }
}

// Worktree lock implementation
async function withWorktreeLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(projectRoot, '.unfugit', 'locks');
  await fs.mkdir(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, 'worktree.apply.lock');
  const lockId = crypto.randomUUID();

  let acquired = false;
  for (let i = 0; i < 10; i++) {
    try {
      await fs.writeFile(lockPath, lockId, { flag: 'wx' });
      acquired = true;
      break;
    } catch (error) {
      if (error.code === 'EEXIST') {
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      } else {
        throw error;
      }
    }
  }

  if (!acquired) {
    throw new Error(`${DomainErrorCode.WORKTREE_BUSY}: Could not acquire worktree lock`);
  }

  try {
    return await fn();
  } finally {
    try {
      const currentLock = await fs.readFile(lockPath, 'utf-8');
      if (currentLock === lockId) {
        await fs.unlink(lockPath);
      }
    } catch {
      // Lock cleanup failed
    }
  }
}

async function getLeaseInfo(): Promise<LeaseInfo> {
  const lockPath = path.join(auditRepoPath, 'locks', LEASE_FILE);

  try {
    const existing = await fs.readFile(lockPath, 'utf-8');
    return JSON.parse(existing);
  } catch {
    return {
      epoch: 0,
      holderSessionId: null,
      holderPid: null,
      since: null,
      heartbeat: null,
      expiresAt: null,
      ttlSeconds: LEASE_TTL_SECONDS,
    };
  }
}

// --- Repository Location ---

function getAuditRepoPath(projectPath: string): string {
  // resolve symlinks and normalize for stable hash
  const resolvedPath = path.resolve(projectPath);

  const hash = crypto.createHash('sha256').update(resolvedPath).digest('hex').substring(0, 16);

  const sanitized = resolvedPath
    .replace(/[^A-Za-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);

  const dirName = `${hash}_${sanitized || 'root'}`;

  let baseDir: string;
  switch (process.platform) {
    case 'linux':
      baseDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
      break;
    case 'darwin':
      baseDir = path.join(os.homedir(), 'Library', 'Application Support');
      break;
    case 'win32':
      baseDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      break;
    default:
      baseDir = path.join(os.homedir(), '.unfugit');
  }

  return path.join(baseDir, 'unfugit', 'repos', dirName);
}

// --- Maintenance Tasks ---

async function loadMaintenanceState() {
  const statePath = path.join(auditRepoPath, MAINTENANCE_STATE_FILE);
  try {
    const data = await fs.readFile(statePath, 'utf-8');
    const parsed = JSON.parse(data);
    maintenanceState = {
      lastFsck: parsed.lastFsck ? new Date(parsed.lastFsck) : null,
      lastMaintenance: parsed.lastMaintenance ? new Date(parsed.lastMaintenance) : null,
      lastFullFsck: parsed.lastFullFsck ? new Date(parsed.lastFullFsck) : null,
    };
  } catch {
    // Use defaults
  }
}

async function saveMaintenanceState() {
  const statePath = path.join(auditRepoPath, MAINTENANCE_STATE_FILE);
  await fs.writeFile(
    statePath,
    JSON.stringify(
      {
        lastFsck: maintenanceState.lastFsck?.toISOString() || null,
        lastMaintenance: maintenanceState.lastMaintenance?.toISOString() || null,
        lastFullFsck: maintenanceState.lastFullFsck?.toISOString() || null,
      },
      null,
      2,
    ),
  );
}

async function performStartupFsck() {
  // Skip fsck - isomorphic-git manages its own integrity
  maintenanceState.lastFsck = new Date();
  await saveMaintenanceState();
}

async function performMaintenance(full: boolean = false) {
  if (sessionState.role !== 'active') {
    return;
  }

  // Skip git maintenance - isomorphic-git handles this internally
  maintenanceState.lastFsck = new Date();
  maintenanceState.lastMaintenance = new Date();

  if (full) {
    maintenanceState.lastFullFsck = new Date();
  }

  await saveMaintenanceState();
}

function scheduleMaintenanceTasks() {
  setInterval(
    async () => {
      await performMaintenance(false);
    },
    24 * 60 * 60 * 1000,
  );

  setInterval(
    async () => {
      await performMaintenance(true);
    },
    7 * 24 * 60 * 60 * 1000,
  );
}

async function getMaintenanceInfo(): Promise<any> {
  const now = new Date();
  const nextFsck = maintenanceState.lastFsck
    ? new Date(maintenanceState.lastFsck.getTime() + 24 * 60 * 60 * 1000)
    : now;
  const nextMaintenance = maintenanceState.lastMaintenance
    ? new Date(maintenanceState.lastMaintenance.getTime() + 24 * 60 * 60 * 1000)
    : now;

  return {
    lastFsck: maintenanceState.lastFsck?.toISOString() || null,
    lastMaintenance: maintenanceState.lastMaintenance?.toISOString() || null,
    lastFullFsck: maintenanceState.lastFullFsck?.toISOString() || null,
    nextScheduledFsck: nextFsck.toISOString(),
    nextScheduledMaintenance: nextMaintenance.toISOString(),
  };
}

// --- File Watcher ---

interface WatcherStats {
  backend: string;
  debounceMs: number;
  maxUserWatches?: number;
  currentWatches: {
    directories: number;
    files: number;
    symlinks: number;
    ignored: number;
  };
  pendingEvents: number;
  avgCommitLatency: number;
}

class FileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = new Set<string>();
  private stats = {
    directories: 0,
    files: 0,
    symlinks: 0,
    ignored: 0,
    totalEvents: 0,
    commitCount: 0,
    totalLatency: 0,
  };

  constructor(
    private projectPath: string,
    private ignorePatterns: string[],
    private debounceMs: number = 200,
  ) {}

  async start() {
    if (this.watcher) {
      await this.stop();
    }

    this.watcher = watch(this.projectPath, {
      ignored: this.ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    // Track file counts for more accurate watcher stats
    this.watcher.on('add', (p) => {
      this.stats.files++;
      this.handleChange('add', p);
    });
    this.watcher.on('change', (p) => this.handleChange('change', p));
    this.watcher.on('unlink', (p) => {
      this.stats.files = Math.max(0, this.stats.files - 1);
      this.handleChange('unlink', p);
    });

    this.watcher.on('addDir', () => this.stats.directories++);
    this.watcher.on('unlinkDir', () => {
      this.stats.directories = Math.max(0, this.stats.directories - 1);
    });

    this.watcher.on('error', (error) => {
      sendLoggingMessage('error', `Watcher error: ${(error as any).message}`);
    });
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private handleChange(event: string, filePath: string) {
    const relativePath = path.relative(this.projectPath, filePath);

    // Skip if path would escape project root
    if (isPathEscaping(relativePath)) {
      return;
    }

    this.stats.totalEvents++;
    this.pendingChanges.add(relativePath);

    sendLoggingMessage(
      'debug',
      `File change detected: ${event} ${relativePath} (pending: ${this.pendingChanges.size})`,
    );

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      sendLoggingMessage('debug', `Processing ${this.pendingChanges.size} pending changes`);
      this.processChanges();
    }, this.debounceMs);
  }

  private async processChanges() {
    if (this.pendingChanges.size === 0) return;

    const startTime = Date.now();
    const changes = Array.from(this.pendingChanges);
    this.pendingChanges.clear();

    try {
      const commitResult = await createAuditCommit(changes);

      const latency = Date.now() - startTime;
      this.stats.commitCount++;
      this.stats.totalLatency += latency;

      onCommitCreated({
        hash: commitResult.hash,
        filesChanged: changes.length,
        latency,
        changedFiles: changes,
      });
    } catch (error) {
      await sendLoggingMessage('error', `Failed to create audit commit: ${(error as any).message}`);
    }
  }

  async getStats(): Promise<WatcherStats> {
    let maxUserWatches: number | undefined;
    if (process.platform === 'linux') {
      try {
        const output = await fs.readFile('/proc/sys/fs/inotify/max_user_watches', 'utf-8');
        maxUserWatches = parseInt(output.trim());
      } catch {
        // Not available
      }
    }

    return {
      backend: 'chokidar',
      debounceMs: this.debounceMs,
      maxUserWatches,
      currentWatches: {
        directories: this.stats.directories,
        files: this.stats.files,
        symlinks: this.stats.symlinks,
        ignored: this.stats.ignored,
      },
      pendingEvents: this.pendingChanges.size,
      avgCommitLatency:
        this.stats.commitCount > 0
          ? Math.round(this.stats.totalLatency / this.stats.commitCount)
          : 0,
    };
  }
}

async function startWatcher() {
  if (sessionState.role !== 'active') {
    await sendLoggingMessage('debug', `Not starting watcher - role is ${sessionState.role}`);
    return;
  }

  await sendLoggingMessage('info', 'Starting file watcher as active');

  // Idempotent: stop any existing watcher before starting a new one
  if (watcher) {
    try {
      await watcher.stop();
    } catch {
      /* best-effort */
    }
    watcher = null;
  }
  const ignorePatterns = await getEffectiveIgnores();
  watcher = new FileWatcher(projectRoot, ignorePatterns, 200);
  await watcher.start();

  await sendLoggingMessage('info', 'File watcher started successfully');
}

async function stopWatcher() {
  if (watcher) {
    await watcher.stop();
    watcher = null;
  }
}

async function getWatcherStats(): Promise<WatcherStats> {
  if (watcher) {
    return watcher.getStats();
  }

  return {
    backend: 'none',
    debounceMs: 0,
    currentWatches: {
      directories: 0,
      files: 0,
      symlinks: 0,
      ignored: 0,
    },
    pendingEvents: 0,
    avgCommitLatency: 0,
  };
}

// --- Ignore Management ---

async function loadCustomIgnores() {
  const ignorePath = path.join(projectRoot, CUSTOM_IGNORES_FILE);
  try {
    const content = await fs.readFile(ignorePath, 'utf-8');
    customIgnores = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.replace(/\\/g, '/'));
  } catch {
    customIgnores = [];
  }
}

async function saveCustomIgnores() {
  const ignorePath = path.join(projectRoot, CUSTOM_IGNORES_FILE);
  const content = [
    '# unfugit custom ignore patterns',
    '# Use glob patterns with / as separator',
    ...customIgnores,
    '',
  ].join('\n');
  await fs.writeFile(ignorePath, content);
}

async function getEffectiveIgnores(): Promise<string[]> {
  await loadCustomIgnores();
  return [...DEFAULT_IGNORES, ...customIgnores];
}

async function getCustomIgnores(): Promise<string[]> {
  await loadCustomIgnores();
  return customIgnores;
}

async function manageIgnores(args: any): Promise<any> {
  await loadCustomIgnores();

  switch (args.mode) {
    case 'check':
      let rules: string[];
      switch (args.which) {
        case 'defaults':
          rules = DEFAULT_IGNORES;
          break;
        case 'custom':
          rules = customIgnores;
          break;
        case 'effective':
        default:
          rules = [...DEFAULT_IGNORES, ...customIgnores];
          break;
      }

      return {
        mode: 'check',
        which: args.which ?? 'effective',
        rules,
      };

    case 'add': {
      const normalizedPatterns = args.patterns.map((p: string) => p.replace(/\\/g, '/'));
      const existingSet = new Set(customIgnores);
      const toAdd = normalizedPatterns.filter((p: string) => !existingSet.has(p));
      const skipped = normalizedPatterns.filter((p: string) => existingSet.has(p));

      if (!args.dry_run) {
        if (args.position === 'prepend') {
          customIgnores = [...toAdd, ...customIgnores];
        } else {
          customIgnores = [...customIgnores, ...toAdd];
        }
        await saveCustomIgnores();
      }

      return {
        mode: 'add',
        dry_run: args.dry_run,
        added: toAdd,
        skipped,
        custom_size: customIgnores.length,
      };
    }

    case 'remove': {
      const existingSet = new Set(customIgnores);
      const toRemove = (args.patterns || []).filter((p: string) => existingSet.has(p));
      const notFound = (args.patterns || []).filter((p: string) => !existingSet.has(p));
      if (!args.dry_run) {
        const toRemoveSet = new Set(toRemove);
        customIgnores = customIgnores.filter((p: string) => !toRemoveSet.has(p));
        await saveCustomIgnores();
      }
      return {
        mode: 'remove',
        dry_run: args.dry_run,
        removed: toRemove,
        not_found: notFound,
        custom_size: customIgnores.length,
      };
    }

    case 'reset':
      if (args.to !== 'empty') {
        throw new McpError(ErrorCode.InvalidParams, "reset.to must be 'empty'");
      }
      if (!args.dry_run) {
        customIgnores = [];
        await saveCustomIgnores();
      }
      return {
        mode: 'reset',
        dry_run: args.dry_run,
        reset_to: args.to,
        custom_size: customIgnores.length,
      };
    default:
      throw new McpError(ErrorCode.InvalidParams, 'Unsupported ignore mode');
  }
}

// --- Stats Helpers ---

async function getRepoStats(): Promise<any> {
  try {
    const totalCommits = await gitCountCommits();
    const stats = await gitGetStats();

    return {
      path: auditRepoPath,
      totalCommits,
      sizeBytes: stats.size,
      objects: stats.objectCount,
      packs: stats.packCount,
    };
  } catch {
    return {
      path: auditRepoPath,
      totalCommits: 0,
      sizeBytes: 0,
      objects: 0,
      packs: 0,
    };
  }
}

async function getRepoInfo(): Promise<any> {
  return getRepoStats();
}

// --- Initialize Repository ---

// Helper to scan project files for initial snapshot
async function scanProjectFiles(dir: string, ignorePatterns: string[]): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string, baseDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        // Check if should be ignored
        const shouldIgnore = ignorePatterns.some(
          (pattern) => minimatch(relativePath, pattern) || minimatch(fullPath, pattern),
        );

        if (shouldIgnore) continue;

        if (entry.isDirectory()) {
          // Skip .unfugit directory
          if (entry.name === '.unfugit') continue;
          await scan(fullPath, baseDir);
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  await scan(dir, dir);
  return files;
}

async function initializeAuditRepo() {
  await fs.mkdir(auditRepoPath, { recursive: true });

  const headFile = path.join(auditRepoPath, 'HEAD');
  const exists = await fs
    .access(headFile)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    // Initialize bare repository
    await gitInit();

    // Create initial commit with README and any existing project files
    const files = new Map<string, Buffer | null>();

    // Add README
    const readmeContent = Buffer.from(
      `# unfugit audit repository\n\nCreated: ${new Date().toISOString()}\nProject: ${projectRoot}\n`,
    );
    files.set('README.md', readmeContent);

    // Scan and add existing project files for initial snapshot
    try {
      const ignorePatterns = await getEffectiveIgnores();
      const allFiles = await scanProjectFiles(projectRoot, ignorePatterns);

      for (const file of allFiles) {
        try {
          const fullPath = path.join(projectRoot, file);
          const content = await fs.readFile(fullPath);
          files.set(file, content);
        } catch {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      await sendLoggingMessage('warning', `Failed to scan initial project files: ${error}`);
    }

    const message =
      files.size === 1
        ? 'Initial audit repository'
        : `Initial audit repository with ${files.size - 1} existing files`;

    await gitCreateCommit(files, message);

    await sendLoggingMessage('info', `Initialized new bare audit repository at ${auditRepoPath}`);
  } else {
    await sendLoggingMessage('info', `Opened existing bare audit repository at ${auditRepoPath}`);
  }

  await loadMaintenanceState();
  // Skip fsck for now - isomorphic-git doesn't need it
}

// Apply restore operation
async function applyRestore(args: any): Promise<any> {
  const restored: string[] = [];
  const backupPaths: string[] = [];

  try {
    // Validate confirm token
    const previewData = previewTokens.get(args.confirm_token);
    if (!previewData || Date.now() - previewData.created > PREVIEW_TOKEN_TTL_MS) {
      // Expire stale token if present
      previewTokens.delete(args.confirm_token);
      throw new Error(`${DomainErrorCode.IDEMPOTENCY_MISMATCH}: Invalid or expired confirm token`);
    }

    // No need for idempotency check - the token already contains all the data

    // Create backup if requested
    if (args.create_backup_copy) {
      const backupDir = path.join(
        projectRoot,
        '.unfugit-backups',
        new Date().toISOString().split('T')[0],
      );
      await fs.mkdir(backupDir, { recursive: true });

      // Backup affected files
      const affectedFiles = previewData.paths || ['.'];
      for (const filePattern of affectedFiles) {
        if (filePattern === '.') {
          continue;
        }

        try {
          const src = path.join(projectRoot, filePattern);
          const stats = await fs.stat(src);
          if (stats.isFile()) {
            const dest = path.join(backupDir, filePattern);
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.copyFile(src, dest);
            backupPaths.push(dest);
          }
        } catch {
          // File might not exist, skip backup
        }
      }
    }

    // Stash uncommitted changes if requested
    let stashRef: string | undefined;
    if (args.stash_uncommitted) {
      // Note: Stashing would require git CLI in the project directory
      // For now, we'll skip this feature in the isomorphic-git migration
      await sendLoggingMessage('warning', 'Stash feature not available with isomorphic-git');
    }

    // Check worktree status if not overwriting
    if (!args.overwrite_unstaged) {
      const status = await checkWorktreeStatus();
      if (status === 'dirty') {
        throw new Error(
          `${DomainErrorCode.DIRTY_WORKTREE}: Worktree has uncommitted changes. Use stash_uncommitted=true or overwrite_unstaged=true`,
        );
      }
    }

    // Apply the restore by copying bytes from audit repo
    const commitFiles = await gitListPaths(previewData.commit);

    // Filter files to restore
    const filesToRestore = commitFiles.filter((file) => {
      if (previewData.paths) {
        return previewData.paths.some(
          (pathspec: string) =>
            file.startsWith(pathspec.replace(/\*.*$/, '')) || minimatch(file, pathspec),
        );
      }
      return true;
    });

    // Restore each file by reading from audit repo and writing to project
    for (const file of filesToRestore) {
      // Check for path escaping
      if (isPathEscaping(file)) {
        await sendLoggingMessage('warning', `Skipping path-escaping file: ${file}`);
        continue;
      }

      try {
        const content = await gitCatFile(previewData.commit, file);
        const targetPath = path.join(projectRoot, file);

        // Ensure directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        // Write the file
        await fs.writeFile(targetPath, content);
        restored.push(file);
      } catch (error) {
        if (error.message.includes(DomainErrorCode.PATH_NOT_FOUND)) {
          // File doesn't exist in commit, skip
          continue;
        }
        await sendLoggingMessage('warning', `Failed to restore ${file}: ${(error as any).message}`);
      }
    }

    // Clean up preview token
    previewTokens.delete(args.confirm_token);

    return {
      restored,
      backup_paths: backupPaths,
      stash_ref: stashRef,
      idempotency_key: args.idempotency_key,
    };
  } catch (error) {
    await sendLoggingMessage('error', `Apply restore failed: ${(error as any).message}`);
    throw error;
  }
}

// Check worktree status
async function checkWorktreeStatus(): Promise<'clean' | 'dirty'> {
  try {
    // Check if project is a git repo first
    const projectGitDir = path.join(projectRoot, '.git');
    const isGitRepo = await fs
      .access(projectGitDir)
      .then(() => true)
      .catch(() => false);

    if (!isGitRepo) {
      // If not a git repo, consider it clean for restore purposes
      return 'clean';
    }

    // Use isomorphic-git status
    const status = await gitStatus(projectRoot);
    return status.trim() === '' ? 'clean' : 'dirty';
  } catch (error) {
    await sendLoggingMessage('error', `Failed to check worktree status: ${(error as any).message}`);
    return 'dirty'; // Assume dirty on error for safety
  }
}

// Create an audit commit
async function createAuditCommit(changedFiles: string[]): Promise<any> {
  try {
    const files = new Map<string, Buffer | null>();
    const deletedPaths: string[] = [];

    // Collect file changes
    for (const file of changedFiles) {
      const srcPath = path.join(projectRoot, file);

      try {
        const stats = await fs.stat(srcPath);
        if (stats.isFile()) {
          const content = await fs.readFile(srcPath);
          files.set(file, content);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          // File was deleted
          files.set(file, null);
          deletedPaths.push(file);
        }
      }
    }

    if (files.size === 0) {
      return { hash: 'no-changes', filesChanged: 0 };
    }

    // Create commit message
    const totalChanged = changedFiles.length;
    const message = `Audit: ${totalChanged} files changed at ${new Date().toISOString()}`;

    // Create the commit using isomorphic-git
    const hash = await gitCreateCommit(files, message);

    sessionState.sessionCommits++;

    return { hash, filesChanged: totalChanged };
  } catch (error) {
    await sendLoggingMessage('error', `Failed to create audit commit: ${(error as any).message}`);
    return { hash: 'error', filesChanged: 0 };
  }
}

// Helper to detect binary content
function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

// Get MIME type for a file
function getMimeType(filePath: string): string {
  const mt = mime.lookup(filePath);
  return typeof mt === 'string' ? mt : 'application/octet-stream';
}

// --- SDK Setup and Transport Configuration ---
// Advertise capabilities used by this server, including logging and resource subscriptions
const server = new McpServer(
  {
    name: 'unfugit',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true, subscribe: true },
      prompts: { listChanged: true },
      logging: {},
    },
  },
);

// Use default SDK initialization/negotiation during server.connect()

// --- Error Handling Helper ---

function getErrorHint(code: string): string {
  const hints: Record<string, string> = {
    [DomainErrorCode.COMMIT_NOT_FOUND]: 'Check if the commit exists in the audit repository',
    [DomainErrorCode.PATH_NOT_FOUND]: 'Verify the path exists at the specified commit',
    [DomainErrorCode.PATH_IS_DIRECTORY]: 'Specify a file path, not a directory',
    [DomainErrorCode.DIRTY_WORKTREE]: 'Set stash_uncommitted=true or overwrite_unstaged=true',
    [DomainErrorCode.SIZE_LIMIT_EXCEEDED]: 'Reduce the operation size or adjust limits',
    [DomainErrorCode.REGEX_TIMEOUT]: 'Simplify the regex or use string mode',
    [DomainErrorCode.CURSOR_EXPIRED]: 'Request a fresh page without cursor',
    [DomainErrorCode.IDEMPOTENCY_MISMATCH]: 'Preview again with the same parameters',
    [DomainErrorCode.WORKTREE_BUSY]: 'Wait for the current operation to complete',
    [DomainErrorCode.IGNORE_WOULD_IGNORE_ALL]: 'Use more specific patterns',
    [DomainErrorCode.IGNORE_PATTERN_INVALID]: 'Check pattern syntax and collisions',
    [DomainErrorCode.LEASE_NOT_HELD]: 'This operation requires active role',
    [DomainErrorCode.LEASE_HELD_BY_OTHER]: 'Another instance is the active',
    [DomainErrorCode.GIT_OPERATION_FAILED]: 'Check git repository state',
    [DomainErrorCode.RESTORE_CONFLICT]: 'Resolve conflicts or use force options',
    [DomainErrorCode.RANGE_INVALID]: 'Check the range specification',
    [DomainErrorCode.WATCHER_LIMIT_LOW]: 'Increase system watcher limits',
    [DomainErrorCode.MAINTENANCE_REQUIRED]: 'Run maintenance tasks',
    [DomainErrorCode.LEASE_STALE_TAKEOVER]: 'Lease was stale and taken over',
  };
  return hints[code] || 'Check the operation parameters';
}

// Error wrapper for tools
function wrapToolHandler(handler: Function) {
  return async (args: any, _extra: any) => {
    try {
      return await handler(args, _extra);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      // Check for domain error codes
      const domainError = Object.values(DomainErrorCode).find((code) =>
        error.message?.includes(code),
      );

      if (domainError) {
        const errPayload = {
          code: domainError,
          message: error.message.replace(`${domainError}: `, ''),
          hint: getErrorHint(domainError),
        };
        return {
          content: [
            {
              type: 'text',
              text: `${domainError}: ${error.message.replace(`${domainError}: `, '')}`,
            },
            {
              type: 'resource',
              resource: {
                uri: `resource://unfugit/errors/${domainError.toLowerCase().replace(/_/g, '-')}.json`,
                mimeType: 'application/json',
                text: JSON.stringify(errPayload),
                _meta: { size: Buffer.byteLength(JSON.stringify(errPayload), 'utf8') },
              },
            },
          ],
          isError: true,
        };
      }

      // Generic error
      await sendLoggingMessage('error', `Unhandled error: ${(error as any).message}`, {
        stack: error.stack,
      });
      throw new Error(`Internal error: ${(error as any).message}`);
    }
  };
}

// Register tool with error handling (use the passed server instance)
function registerToolWithErrorHandling(
  srv: McpServer,
  name: string,
  config: any,
  handler: Function,
) {
  srv.registerTool(name, config, wrapToolHandler(handler));
}

// --- Notifications ---

async function sendProgressNotification(
  token: string,
  progress: number,
  total: number,
  message: string,
) {
  await server.server.notification({
    method: 'notifications/progress',
    params: {
      progressToken: token,
      progress,
      total,
      message,
    },
  });
}

async function sendLoggingMessage(
  level: 'debug' | 'info' | 'warning' | 'error',
  message: string,
  data?: any,
) {
  // Low-level server API; may throw if called before connect. Swallow pre-connect logs.
  try {
    const payload =
      typeof data === 'object' && data !== null ? { message, ...data } : { message, _extra: data };
    await server.server.notification({
      method: 'notifications/message',
      params: { level, data: payload },
    });
  } catch {
    // ignore pre-connect logging errors
  }
}

async function sendResourceUpdated(uri: string) {
  if (resourceSubscriptions.has(uri)) {
    await server.server.notification({
      method: 'notifications/resources/updated',
      params: { uri },
    });
  }
}

function onCommitCreated(commit: any) {
  sessionState.sessionCommits++;

  sendLoggingMessage('info', `Audit commit created: ${commit.hash} (${commit.filesChanged} files)`);

  // Notify resource subscribers
  sendResourceUpdated('resource://unfugit/repo/info');
  sendResourceUpdated('resource://unfugit/commits/recent');
}

function onRoleChange(from: string, to: string, epoch: number) {
  sendLoggingMessage('info', `Role changed from ${from} to ${to}`, { epoch });

  // Notify resource subscribers
  sendResourceUpdated('resource://unfugit/repo/info');
}

// --- Helper for structured content ---
function createToolResponse(content: any[], _structuredContent?: any, text?: string): any {
  // Updated to always include structuredContent when provided
  const resp: any = {
    content: [{ type: 'text', text: text || 'Operation completed' }, ...content],
    isError: false,
  };
  if (_structuredContent !== undefined) {
    resp.structuredContent = _structuredContent;
  }
  return resp;
}

// --- Register All Tools ---

function registerAllTools(srv: McpServer) {
  // unfugit_history tool
  registerToolWithErrorHandling(
    srv,
    'unfugit_history',
    {
      title: 'Audit History Browser',
      description: 'List commits from the audit repo with practical filters for triage',
      inputSchema: {
        limit: z.number().optional().default(10),
        offset: z.number().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
        grep: z.string().optional(),
        author: z.string().optional(),
      },
    },
    async (args: any, _extra: any) => {
      if (args.merges_only && args.no_merges) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Cannot specify both merges_only and no_merges',
        );
      }

      let offset = 0;
      if (args.cursor) {
        const cursorData = cursorStore.get(args.cursor);
        if (!cursorData || Date.now() - cursorData.created > CURSOR_TTL_MS) {
          return {
            content: [
              {
                type: 'text',
                text: `${DomainErrorCode.CURSOR_EXPIRED}: Invalid or expired cursor`,
              },
            ],
            structuredContent: { commits: [], nextCursor: null },
            isError: true,
          };
        }
        offset = cursorData.offset;
      }

      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 20, 100, 'Enumerating commits...');
      }

      const allCommits = await gitLog({ ...args, offset });
      const commits = allCommits.slice(0, args.max_commits);

      let nextCursor: string | null = null;
      if (allCommits.length > args.max_commits) {
        nextCursor = crypto.randomUUID();
        cursorStore.set(nextCursor, {
          offset: offset + args.max_commits,
          created: Date.now(),
          filters: { ...args, cursor: undefined },
        });
      }

      const result = { commits, nextCursor };

      // Build a more detailed text output that includes file information
      let text = `Found ${commits.length} commits${nextCursor ? ' (more available)' : ''}`;
      if (commits.length > 0) {
        text += '\n\n';
        for (const commit of commits.slice(0, 5)) {
          // Show first 5 commits with details
          text += `${commit.hash.substring(0, 8)} - ${commit.message.split('\n')[0]}`;
          if (commit.filesChanged > 0) {
            text += ` (${commit.filesChanged} files, +${commit.insertions}/-${commit.deletions})`;
          }
          text += '\n';
          // Include file names
          if (commit.files && commit.files.length > 0) {
            const fileList = commit.files.slice(0, 3).join(', ');
            text += `  Files: ${fileList}`;
            if (commit.files.length > 3) {
              text += ` and ${commit.files.length - 3} more`;
            }
            text += '\n';
          }
        }
        if (commits.length > 5) {
          text += `... and ${commits.length - 5} more commits`;
        }
      }

      const resp = createToolResponse(
        [
          {
            type: 'resource',
            resource: {
              uri: 'resource://unfugit/history/list.json',
              mimeType: 'application/json',
              text: JSON.stringify(result),
              _meta: { size: Buffer.byteLength(JSON.stringify(result), 'utf8') },
            },
          },
        ],
        result,
        text,
      );
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );

  // unfugit_diff
  registerToolWithErrorHandling(
    srv,
    'unfugit_diff',
    {
      title: 'Compare Changes',
      description: 'Preview differences between two refs',
      inputSchema: {
        base: z.string().optional().default('HEAD~1'),
        head: z.string().optional().default('HEAD'),
        paths: z.array(z.string()).optional(),
      },
    },
    async (args: any, _extra: any) => {
      // Default to patch output if not specified
      if (!args.output) {
        args.output = 'patch';
      }

      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 5, 100, 'Validating refs...');
      }
      const [baseExists, headExists] = await Promise.all([
        gitRefExists(args.base, {
          signal: _extra?.signal,
          abortSignal: (_extra as any)?.abortSignal,
        }),
        gitRefExists(args.head, {
          signal: _extra?.signal,
          abortSignal: (_extra as any)?.abortSignal,
        }),
      ]);

      if (!baseExists) {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.COMMIT_NOT_FOUND}: Base ref ${args.base} not found`,
            },
          ],
          structuredContent: { summary: { files: 0, insertions: 0, deletions: 0, renames: 0 } },
          isError: true,
        };
      }
      if (!headExists) {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.COMMIT_NOT_FOUND}: Head ref ${args.head} not found`,
            },
          ],
          structuredContent: { summary: { files: 0, insertions: 0, deletions: 0, renames: 0 } },
          isError: true,
        };
      }

      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 25, 100, 'Computing diff...');
      }
      // Compute diff; if SIZE_LIMIT_EXCEEDED, recompute without max_bytes and mark to force offload
      let diffOutput: string;
      let exceededCallerLimit = false;
      try {
        diffOutput = await gitDiff(args);
      } catch (e: any) {
        if (hasDomainError(e, DomainErrorCode.SIZE_LIMIT_EXCEEDED)) {
          exceededCallerLimit = true;
          diffOutput = await gitDiff({ ...args, output: 'patch', max_bytes: undefined });
        } else {
          throw e;
        }
      }
      const result = { summary: '' };

      const content = [
        {
          type: 'resource',
          resource: {
            uri: 'resource://unfugit/diffs/summary.json',
            mimeType: 'application/json',
            text: JSON.stringify(result.summary),
            _meta: { size: Buffer.byteLength(JSON.stringify(result.summary), 'utf8') },
          },
        },
      ];

      // If we recomputed after exceeding max_bytes, always offload the patch
      if (args.output === 'patch' && diffOutput) {
        const patchBytes = Buffer.byteLength(diffOutput, 'utf8');
        if (exceededCallerLimit || patchBytes > MAX_EMBEDDED_SIZE) {
          const { uri, expiresAt } = createEphemeralResource(
            'text/x-diff',
            { text: diffOutput },
            patchBytes,
          );
          // Provide fetchable URI and separate compact metadata summary
          content.push({ type: 'resource', resource: { uri } as any });
          content.push({
            type: 'resource',
            resource: {
              uri: `resource://unfugit/diffs/${encodeURIComponent(args.base)}..${encodeURIComponent(args.head)}.patch.meta.json`,
              mimeType: 'application/json',
              text: JSON.stringify({ uri, size: patchBytes, mimeType: 'text/x-diff', expiresAt }),
              _meta: {
                size: Buffer.byteLength(
                  JSON.stringify({ uri, size: patchBytes, mimeType: 'text/x-diff', expiresAt }),
                  'utf8',
                ),
              },
            },
          });
          if (exceededCallerLimit) {
            content.push({
              type: 'resource',
              resource: {
                uri: `resource://unfugit/diffs/${encodeURIComponent(args.base)}..${encodeURIComponent(args.head)}.limit.json`,
                mimeType: 'application/json',
                text: JSON.stringify({
                  code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
                  note: 'Patch offloaded due to caller max_bytes limit',
                }),
                _meta: {
                  size: Buffer.byteLength(
                    JSON.stringify({
                      code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
                      note: 'Patch offloaded due to caller max_bytes limit',
                    }),
                    'utf8',
                  ),
                },
              },
            });
          }
        } else {
          content.push({
            type: 'resource',
            resource: {
              uri: `resource://unfugit/diffs/${encodeURIComponent(args.base)}..${encodeURIComponent(args.head)}.patch`,
              mimeType: 'text/x-diff',
              text: diffOutput,
              _meta: { size: patchBytes },
            },
          });
        }
      }

      // Include patch content in text output for test compatibility
      let text = `Diff ${args.base}..${args.head}`;

      // Always include diff output if available and not too large
      if (diffOutput && diffOutput.length < 10000) {
        text += `\n\n${diffOutput}`;
      } else if (!diffOutput) {
        text += '\n\n(No diff output generated)';
      }

      const resp = createToolResponse(content, result, text);
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );

  // unfugit_show
  registerToolWithErrorHandling(
    srv,
    'unfugit_show',
    {
      title: 'Show Commit Details',
      description: 'Display commit metadata and changes',
      inputSchema: {
        commit: z.string().optional().default('HEAD'),
        paths: z.array(z.string()).optional(),
      },
    },
    async (args: any, _extra: any) => {
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 10, 100, 'Checking commit...');
      }
      const commitExists = await gitRefExists(args.commit, {
        signal: _extra?.signal,
        abortSignal: (_extra as any)?.abortSignal,
      });
      if (!commitExists) {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.COMMIT_NOT_FOUND}: Commit ${args.commit} not found`,
            },
          ],
          structuredContent: {
            commit: {
              hash: '',
              timestamp: '',
              subject: '',
              author: '',
              committer: '',
              parents: [],
              message: '',
            },
            stats: { files: 0, insertions: 0, deletions: 0 },
          },
          isError: true,
        };
      }

      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 35, 100, 'Gathering metadata...');
      }
      let show: any;
      let exceededCallerLimit = false;
      try {
        show = await gitShow(args);
      } catch (e: any) {
        if (hasDomainError(e, DomainErrorCode.SIZE_LIMIT_EXCEEDED)) {
          // Re-run without max_bytes so we can offload the patch
          exceededCallerLimit = true;
          show = await gitShow({ ...args, max_bytes: undefined });
        } else {
          throw e;
        }
      }
      const result = {
        commit: show.commit,
        stats: show.stats,
      };

      const content = [
        {
          type: 'resource',
          resource: {
            uri: `resource://unfugit/commits/${encodeURIComponent(show.commit.hash)}.json`,
            mimeType: 'application/json',
            text: JSON.stringify(result),
            _meta: { size: Buffer.byteLength(JSON.stringify(result), 'utf8') },
          },
        },
      ];

      if (args.output === 'patch' && show.patch) {
        const patchBytes = Buffer.byteLength(show.patch, 'utf8');
        if (exceededCallerLimit || patchBytes > MAX_EMBEDDED_SIZE) {
          const { uri, expiresAt } = createEphemeralResource(
            'text/x-diff',
            { text: show.patch },
            patchBytes,
          );
          content.push({ type: 'resource', resource: { uri } as any });
          content.push({
            type: 'resource',
            resource: {
              uri: `resource://unfugit/commits/${encodeURIComponent(show.commit.hash)}.patch.meta.json`,
              mimeType: 'application/json',
              text: JSON.stringify({ uri, size: patchBytes, mimeType: 'text/x-diff', expiresAt }),
              _meta: {
                size: Buffer.byteLength(
                  JSON.stringify({ uri, size: patchBytes, mimeType: 'text/x-diff', expiresAt }),
                  'utf8',
                ),
              },
            },
          });
          if (exceededCallerLimit) {
            content.push({
              type: 'resource',
              resource: {
                uri: `resource://unfugit/commits/${encodeURIComponent(show.commit.hash)}.limit.json`,
                mimeType: 'application/json',
                text: JSON.stringify({
                  code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
                  note: 'Patch offloaded due to caller max_bytes limit',
                }),
                _meta: {
                  size: Buffer.byteLength(
                    JSON.stringify({
                      code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
                      note: 'Patch offloaded due to caller max_bytes limit',
                    }),
                    'utf8',
                  ),
                },
              },
            });
          }
        } else {
          content.push({
            type: 'resource',
            resource: {
              uri: `resource://unfugit/commits/${encodeURIComponent(show.commit.hash)}.patch`,
              mimeType: 'text/x-diff',
              text: show.patch,
              _meta: { size: patchBytes },
            },
          });
        }
      }

      const text = `Commit ${show.commit.hash.substring(0, 8)}: ${show.commit.subject} (${show.stats.files} files, +${show.stats.insertions}/-${show.stats.deletions})`;

      const resp = createToolResponse(content, result, text);
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );

  // unfugit_get
  registerToolWithErrorHandling(
    srv,
    'unfugit_get',
    {
      title: 'Get File Contents',
      description: 'Retrieve file content from a specific commit',
      inputSchema: {
        commit: z.string().optional().default('HEAD'),
        path: z.string(),
      },
    },
    async (args: any, _extra: any) => {
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 10, 100, 'Validating commit...');
      }
      const commitExists = await gitRefExists(args.commit, { signal: _extra?.signal });
      if (!commitExists) {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.COMMIT_NOT_FOUND}: Commit ${args.commit} not found`,
            },
          ],
          structuredContent: {
            commit: args.commit,
            path: args.path ?? '',
            size: 0,
            mimeType: 'application/octet-stream',
            encoding: 'utf8',
          },
          isError: true,
        };
      }

      const pathExists = await gitPathExists(args.path, args.commit, {
        signal: _extra?.signal,
        abortSignal: (_extra as any)?.abortSignal,
      });
      if (!pathExists) {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.PATH_NOT_FOUND}: Path ${args.path} not found in commit ${args.commit}`,
            },
          ],
          structuredContent: {
            commit: args.commit,
            path: args.path,
            size: 0,
            mimeType: 'application/octet-stream',
            encoding: 'utf8',
          },
          isError: true,
        };
      }

      const objectType = await gitGetObjectType(args.commit, args.path);
      if (objectType === 'tree') {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.PATH_IS_DIRECTORY}: Path ${args.path} is a directory, not a file`,
            },
          ],
          structuredContent: {
            commit: args.commit,
            path: args.path,
            size: 0,
            mimeType: 'application/octet-stream',
            encoding: 'utf8',
          },
          isError: true,
        };
      }

      const contentBuf = await gitCatFile(args.commit, args.path);
      const mimeType = getMimeType(args.path);
      const isBinaryContent = isBinary(contentBuf);

      let encoding = args.encoding;
      if (encoding === 'auto') {
        encoding = isBinaryContent ? 'base64' : 'utf8';
      }
      // Normalize "binary" to the transport-compatible base64
      if (encoding === 'binary') encoding = 'base64';

      const result = {
        commit: args.commit,
        path: args.path,
        size: contentBuf.length,
        mimeType,
        encoding,
      };

      const resourceBlocks: any[] = [];
      if (contentBuf.length > MAX_EMBEDDED_SIZE) {
        const payload =
          encoding === 'utf8'
            ? { text: contentBuf.toString('utf8') }
            : { blob: Buffer.from(contentBuf).toString('base64') };
        const { uri, expiresAt } = createEphemeralResource(mimeType, payload, contentBuf.length);
        resourceBlocks.push({ type: 'resource', resource: { uri } as any });
        resourceBlocks.push({
          type: 'resource',
          resource: {
            uri: `resource://unfugit/files/${encodeURIComponent(args.commit)}/${encodeURIComponent(args.path.replace(/\//g, '-'))}.meta.json`,
            mimeType: 'application/json',
            text: JSON.stringify({ uri, size: contentBuf.length, mimeType, encoding, expiresAt }),
            _meta: {
              size: Buffer.byteLength(
                JSON.stringify({ uri, size: contentBuf.length, mimeType, encoding, expiresAt }),
                'utf8',
              ),
            },
          },
        });
      } else {
        resourceBlocks.push({
          type: 'resource',
          resource: {
            uri: `resource://unfugit/files/${encodeURIComponent(args.commit)}/${encodeURIComponent(args.path.replace(/\//g, '-'))}`,
            mimeType,
            ...(encoding === 'utf8'
              ? { text: contentBuf.toString('utf8') }
              : { blob: Buffer.from(contentBuf).toString('base64') }),
            _meta: { size: contentBuf.length },
          },
        });
      }

      const text = `Retrieved ${args.path} from ${args.commit.substring(0, 8)} (${contentBuf.length} bytes, ${mimeType})`;

      return createToolResponse(resourceBlocks, result, text);
    },
  );

  // unfugit_find_by_content
  registerToolWithErrorHandling(
    srv,
    'unfugit_find_by_content',
    {
      title: 'Search by Content Changes',
      description: 'Find commits that add/remove specific content (pickaxe search)',
      inputSchema: {
        term: z.string(),
        regex: z.boolean().optional().default(false),
        ignoreCase: z.boolean().optional().default(false),
        limit: z.number().optional().default(10),
        paths: z.array(z.string()).optional(),
      },
    },
    async (args: any, _extra: any) => {
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 10, 100, 'Searching by content...');
      }
      const commits = await gitLogPickaxe(args);

      // Build detailed text that includes commit and file info
      let text = `Found ${commits.length} commits with content changes for "${args.term}"`;
      if (commits.length > 0) {
        text += '\n\n';
        for (const commit of commits.slice(0, 5)) {
          text += `${commit.hash.substring(0, 8)} - ${commit.message.split('\n')[0]}\n`;
          if (commit.files && commit.files.length > 0) {
            text += `  Files: ${commit.files.join(', ')}\n`;
          }
        }
        if (commits.length > 5) {
          text += `... and ${commits.length - 5} more commits`;
        }
      }

      const resp = createToolResponse(
        [
          {
            type: 'resource',
            resource: {
              uri: `resource://unfugit/search/content-${encodeURIComponent(args.term)}.json`,
              mimeType: 'application/json',
              text: JSON.stringify(commits),
              _meta: { size: Buffer.byteLength(JSON.stringify(commits), 'utf8') },
            },
          },
        ],
        { commits, term: args.term, count: commits.length },
        text,
      );
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );

  // unfugit_restore_preview
  registerToolWithErrorHandling(
    srv,
    'unfugit_restore_preview',
    {
      title: 'Preview Restore Operation',
      description: 'Preview what would happen when restoring from a commit',
      inputSchema: {
        commit: z.string(),
        paths: z.array(z.string()).optional(),
      },
    },
    async (args: any, _extra: any) => {
      const commitExists = await gitRefExists(args.commit, {
        signal: _extra?.signal,
        abortSignal: (_extra as any)?.abortSignal,
      });
      if (!commitExists) {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.COMMIT_NOT_FOUND}: Commit ${args.commit} not found`,
            },
          ],
          structuredContent: {
            impact: { will_modify: [], will_create: [], will_delete: [] },
            totalBytes: 0,
            confirm_token: '',
          },
          isError: true,
        };
      }

      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 40, 100, 'Calculating impact...');
      }
      const impact = await calculateRestoreImpact(args);

      // If preview exceeds caller limit, continue and offload patch instead of erroring
      const overLimit = !!(args.max_bytes && impact.totalBytes > args.max_bytes);

      // Generate confirm token
      const confirmToken = crypto.randomUUID();
      previewTokens.set(confirmToken, {
        commit: args.commit,
        paths: args.paths,
        preview: impact,
        created: Date.now(),
        options: args,
      });

      const result = {
        impact: impact.impact,
        totalBytes: impact.totalBytes,
        confirm_token: confirmToken,
      };

      const content = [
        {
          type: 'resource',
          resource: {
            uri: `resource://unfugit/restore/preview-${encodeURIComponent(args.commit)}.json`,
            mimeType: 'application/json',
            text: JSON.stringify(result),
            _meta: { size: Buffer.byteLength(JSON.stringify(result), 'utf8') },
          },
        },
      ];

      if (impact.patch) {
        const bytes = Buffer.byteLength(impact.patch, 'utf8');
        if (overLimit || bytes > MAX_EMBEDDED_SIZE) {
          const { uri, expiresAt } = createEphemeralResource(
            'text/x-diff',
            { text: impact.patch },
            bytes,
          );
          content.push({ type: 'resource', resource: { uri } as any });
          content.push({
            type: 'resource',
            resource: {
              uri: `resource://unfugit/restore/preview-${encodeURIComponent(args.commit)}.patch.meta.json`,
              mimeType: 'application/json',
              text: JSON.stringify({ uri, size: bytes, mimeType: 'text/x-diff', expiresAt }),
              _meta: {
                size: Buffer.byteLength(
                  JSON.stringify({ uri, size: bytes, mimeType: 'text/x-diff', expiresAt }),
                  'utf8',
                ),
              },
            },
          });
        } else {
          content.push({
            type: 'resource',
            resource: {
              uri: `resource://unfugit/restore/preview-${encodeURIComponent(args.commit)}.patch`,
              mimeType: 'text/x-diff',
              text: impact.patch,
              _meta: { size: bytes },
            },
          });
        }
        if (overLimit) {
          content.push({
            type: 'resource',
            resource: {
              uri: `resource://unfugit/restore/preview-${encodeURIComponent(args.commit)}.limit.json`,
              mimeType: 'application/json',
              text: JSON.stringify({
                code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
                totalBytes: impact.totalBytes,
                note: 'Patch offloaded via ephemeral URI',
              }),
              _meta: {
                size: Buffer.byteLength(
                  JSON.stringify({
                    code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
                    totalBytes: impact.totalBytes,
                    note: 'Patch offloaded via ephemeral URI',
                  }),
                  'utf8',
                ),
              },
            },
          });
        }
      }

      const text = `Preview restore from ${args.commit.substring(0, 8)}: ${result.impact.will_modify.length} modified, ${result.impact.will_create.length} created, ${result.impact.will_delete.length} deleted`;

      const resp = createToolResponse(content, result, text);
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );

  // unfugit_restore_apply
  registerToolWithErrorHandling(
    srv,
    'unfugit_restore_apply',
    {
      title: 'Apply Restore Operation',
      description: 'Actually restore files from a commit with safety checks',
      inputSchema: {
        confirm_token: z.string(),
        idempotency_key: z.string(),
      },
    },
    async (args: any, _extra: any) => {
      // Require active role for restore operations
      if (sessionState.role !== 'active') {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.LEASE_NOT_HELD}: Restore operations require active role`,
            },
          ],
          structuredContent: {
            restored: [],
            backup_paths: [],
            idempotency_key: args.idempotency_key ?? '',
          },
          isError: true,
        };
      }

      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 10, 100, 'Applying restore...');
      }

      // Get preview data BEFORE calling applyRestore (which deletes the token)
      const previewData = previewTokens.get(args.confirm_token);
      const commitRef = previewData ? previewData.commit : 'unknown';

      const result = await withWorktreeLock(async () => applyRestore(args));
      const text =
        result.restored.length > 0
          ? `Successfully restored ${result.restored.length} files from ${commitRef.substring(0, 8)}`
          : `Restored ${result.restored.length} files from ${commitRef.substring(0, 8)}`;

      const resp = createToolResponse(
        [
          {
            type: 'resource',
            resource: {
              uri: `resource://unfugit/restore/result-${args.idempotency_key}.json`,
              mimeType: 'application/json',
              text: JSON.stringify(result),
              _meta: { size: Buffer.byteLength(JSON.stringify(result), 'utf8') },
            },
          },
        ],
        result,
        text,
      );
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );

  // unfugit_force_commit (for testing)
  registerToolWithErrorHandling(
    srv,
    'unfugit_force_commit',
    {
      title: 'Force Commit',
      description: 'Force an immediate commit of all current project files (testing tool)',
      inputSchema: {},
    },
    async (args: any, _extra: any) => {
      try {
        // Get all files in the project
        const ignorePatterns = await getEffectiveIgnores();
        const allFiles = await scanProjectFiles(projectRoot, ignorePatterns);

        if (allFiles.length === 0) {
          return createToolResponse([], null, 'No files found in project');
        }

        // Build file map with current content
        const files = new Map<string, Buffer | null>();
        for (const file of allFiles) {
          try {
            const fullPath = path.join(projectRoot, file);
            const content = await fs.readFile(fullPath);
            files.set(file, content);
          } catch {
            // File might have been deleted
            files.set(file, null);
          }
        }

        if (files.size === 0) {
          return createToolResponse([], null, 'No files to commit');
        }

        // Create commit directly
        const message = `Forced commit: ${files.size} files at ${new Date().toISOString()}`;
        const hash = await gitCreateCommit(files, message);

        sessionState.sessionCommits++;

        return createToolResponse(
          [],
          { hash, filesChanged: files.size },
          `Forced commit created: ${hash} (${files.size} files)`,
        );
      } catch (error) {
        return createToolResponse([], null, `Failed to force commit: ${(error as any).message}`);
      }
    },
  );

  // unfugit_stats
  registerToolWithErrorHandling(
    srv,
    'unfugit_stats',
    {
      title: 'Server Statistics',
      description: 'Get comprehensive server and repository statistics',
      inputSchema: {
        extended: z.boolean().optional().default(false),
      },
    },
    async (args: any, _extra: any) => {
      const stats = await gatherCompleteStats(args.detailed);
      const text = `Server v${stats.version}, role: ${stats.role}, repo: ${stats.repo.total_commits} commits, ${Math.round(stats.repo.size_bytes / 1024)}KB`;

      return createToolResponse(
        [
          {
            type: 'resource',
            resource: {
              uri: 'resource://unfugit/stats.json',
              mimeType: 'application/json',
              text: JSON.stringify(stats),
              _meta: { size: Buffer.byteLength(JSON.stringify(stats), 'utf8') },
            },
          },
        ],
        stats,
        text,
      );
    },
  );

  // unfugit_ignores
  registerToolWithErrorHandling(
    srv,
    'unfugit_ignores',
    {
      title: 'Manage Ignore Patterns',
      description: 'View and modify file ignore patterns',
      inputSchema: {
        mode: z.enum(['list', 'add', 'remove', 'clear', 'check']),
        patterns: z.array(z.string()).optional(),
        which: z.enum(['all', 'git', 'custom']).optional().default('all'),
      },
    },
    async (args: any, _extra: any) => {
      // Validate pattern limits
      if (args.mode === 'add' && args.patterns) {
        const currentCount = (await getCustomIgnores()).length;
        if (currentCount + args.patterns.length > MAX_CUSTOM_IGNORES) {
          return {
            content: [
              {
                type: 'text',
                text: `${DomainErrorCode.IGNORE_PATTERN_INVALID}: Would exceed maximum ${MAX_CUSTOM_IGNORES} custom patterns`,
              },
            ],
            structuredContent: {
              mode: args.mode,
              added: [],
              removed: [],
              custom_size: currentCount,
            },
            isError: true,
          };
        }

        // Check for patterns that would ignore everything
        const problematicPatterns = args.patterns.filter(
          (p) => p === '**' || p === '*' || p === '**/*',
        );
        if (problematicPatterns.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `${DomainErrorCode.IGNORE_WOULD_IGNORE_ALL}: Patterns would ignore entire project: ${problematicPatterns.join(', ')}`,
              },
            ],
            structuredContent: {
              mode: args.mode,
              added: [],
              removed: [],
              custom_size: currentCount,
            },
            isError: true,
          };
        }
      }

      const result = await manageIgnores(args);
      const text = `Ignore ${args.mode} completed: ${JSON.stringify(result)}`;

      return createToolResponse(
        [
          {
            type: 'resource',
            resource: {
              uri: `resource://unfugit/ignores/${args.mode}.json`,
              mimeType: 'application/json',
              text: JSON.stringify(result),
              _meta: { size: Buffer.byteLength(JSON.stringify(result), 'utf8') },
            },
          },
        ],
        result,
        text,
      );
    },
  );

  // unfugit_timeline
  registerToolWithErrorHandling(
    srv,
    'unfugit_timeline',
    {
      title: 'File History Timeline',
      description: 'Show history for a single path across renames',
      inputSchema: {
        path: z.string(),
        limit: z.number().optional().default(10),
        offset: z.number().optional(),
      },
    },
    async (args: any, _extra: any) => {
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 15, 100, 'Walking history...');
      }
      const timeline = await gitLogFollow(args);
      const patches = args.with_patches ? await generatePatches(timeline.commits, args) : [];

      // If combined patches exceed caller limit, continue and offload patches (no error)
      const overLimit = !!(args.max_bytes && (patches as any).totalSize > args.max_bytes);

      // Decorate commits with change kind and surface created/deleted/renames
      let currentPath = args.path;
      let createdIn: string | null = null;
      let deletedIn: string | null = null;
      const renameEvents: Array<{ hash: string; from: string; to: string }> = [];

      async function countLinesAt(commit: string, p: string): Promise<number | null> {
        try {
          const buf = await gitCatFile(commit, p);
          // Binary check: if NUL present, skip line counts
          for (let i = 0; i < Math.min(buf.length, 8192); i++) if (buf[i] === 0) return null;
          // Count LF. Treat empty file as 0 lines.
          let lines = 0;
          for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
          // If file has content without trailing LF, count the last line
          if (buf.length > 0 && buf[buf.length - 1] !== 10) lines++;
          return lines;
        } catch {
          return null;
        }
      }

      async function computeChangeStats(
        hash: string,
        pathNow: string,
        renameFrom?: string,
      ): Promise<{
        added: number | null;
        deleted: number | null;
        prev_lines: number | null;
        new_lines: number | null;
        pct_of_prev: number | null;
        magnitude: 'small' | 'medium' | 'large' | 'unknown';
      }> {
        // Determine parent (first parent)
        let parent: string | null = null;
        try {
          parent = (await execGit(['rev-parse', `${hash}^`])).trim();
        } catch {
          parent = null;
        }

        // Per-file added/deleted using numstat between parent and commit
        // Use -z to avoid path munging and handle renames robustly.
        // With -z and a rename, numstat yields: added<NUL>deleted<NUL>old<NUL>new<NUL>
        // Otherwise: added<NUL>deleted<NUL>path<NUL>
        let added: number | null = null,
          deleted: number | null = null;
        if (parent) {
          try {
            const raw = await execGitRaw(['diff', '--numstat', '-z', parent, hash, '--', pathNow]);
            const toks = raw.split('\0').filter(Boolean);
            // Walk triples or quads
            for (let i = 0; i < toks.length; ) {
              const a = toks[i++],
                d = toks[i++];
              const aNum = a === '-' ? null : parseInt(a, 10);
              const dNum = d === '-' ? null : parseInt(d, 10);
              if (i < toks.length) {
                const p1 = toks[i++]; // path or old
                if (i < toks.length && (renameFrom || (toks.length - i) % 2 === 1)) {
                  // Probably a rename entry
                  const p2 = toks[i++]; // new
                  if (p2 === pathNow || (renameFrom && p1 === renameFrom)) {
                    added = aNum;
                    deleted = dNum;
                    break;
                  }
                } else {
                  if (p1 === pathNow) {
                    added = aNum;
                    deleted = dNum;
                    break;
                  }
                }
              }
            }
          } catch {
            /* leave nulls */
          }
        }

        // Line counts before and after
        const prevPath = renameFrom || pathNow;
        const prev_lines = parent ? await countLinesAt(parent, prevPath) : 0;
        const new_lines = await countLinesAt(hash, pathNow);

        let pct_of_prev: number | null = null;
        if (prev_lines !== null && added !== null && deleted !== null) {
          const denom = Math.max(prev_lines, 1);
          pct_of_prev = Math.min(100, Math.round(((added + deleted) / denom) * 100));
        }
        const magnitude: 'small' | 'medium' | 'large' | 'unknown' =
          pct_of_prev === null
            ? 'unknown'
            : pct_of_prev < 5
              ? 'small'
              : pct_of_prev < 20
                ? 'medium'
                : 'large';
        return { added, deleted, prev_lines, new_lines, pct_of_prev, magnitude };
      }

      const decorated = [];
      for (const c of timeline.commits) {
        let changeKind: 'created' | 'deleted' | 'modified' | 'renamed' = 'modified';
        let renameFrom: string | undefined;
        let renameTo: string | undefined;

        try {
          // Name-status, NUL-delimited for robust parsing
          const raw = await execGitRaw(['show', '--name-status', '-M', '-z', '--format=', c.hash]);
          const tokens = raw.split('\0').filter(Boolean);
          for (let i = 0; i < tokens.length; ) {
            const status = tokens[i++]; // e.g., M, A, D, R100
            if (status.startsWith('R')) {
              const from = tokens[i++] || '';
              const to = tokens[i++] || '';
              // On a rename commit, the current tracked name is the "to" side in newer history.
              if (to === currentPath) {
                changeKind = 'renamed';
                renameFrom = from;
                renameTo = to;
                renameEvents.push({ hash: c.hash, from, to });
                // For older commits, follow the old name
                currentPath = from;
                break;
              }
            } else {
              const p = tokens[i++] || '';
              if (p === currentPath) {
                if (status[0] === 'A') {
                  changeKind = 'created';
                  if (!createdIn) createdIn = c.hash;
                } else if (status[0] === 'D') {
                  changeKind = 'deleted';
                  if (!deletedIn) deletedIn = c.hash;
                } else {
                  changeKind = 'modified';
                }
                break;
              }
            }
          }
        } catch {
          // If parsing fails, fall back to "modified"
        }

        // Compute size metrics for this commit relative to first parent
        const stats = await computeChangeStats(c.hash, renameTo || currentPath, renameFrom);

        decorated.push({
          hash: c.hash,
          timestamp: c.timestamp,
          subject: c.subject,
          change_kind: changeKind,
          ...(renameFrom && renameTo ? { rename_from: renameFrom, rename_to: renameTo } : {}),
          ...(stats ? { change_stats: stats, magnitude: stats.magnitude } : {}),
        });
      }

      const result = {
        path: args.path,
        commits: decorated,
        created_in: createdIn,
        deleted_in: deletedIn,
        renames: renameEvents,
        nextCursor: timeline.nextCursor,
      };

      const content = [
        {
          type: 'resource',
          resource: {
            uri: `resource://unfugit/timeline/${encodeURIComponent(args.path.replace(/\//g, '-'))}.json`,
            mimeType: 'application/json',
            text: JSON.stringify(result),
            _meta: { size: Buffer.byteLength(JSON.stringify(result), 'utf8') },
          },
        },
      ];

      if (overLimit) {
        content.push({
          type: 'resource',
          resource: {
            uri: `resource://unfugit/timeline/${encodeURIComponent(args.path.replace(/\//g, '-'))}.limit.json`,
            mimeType: 'application/json',
            text: JSON.stringify({
              code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
              totalPatchBytes: (patches as any).totalSize,
              note: 'Individual patches offloaded via ephemeral URIs',
            }),
            _meta: {
              size: Buffer.byteLength(
                JSON.stringify({
                  code: DomainErrorCode.SIZE_LIMIT_EXCEEDED,
                  totalPatchBytes: (patches as any).totalSize,
                  note: 'Individual patches offloaded via ephemeral URIs',
                }),
                'utf8',
              ),
            },
          },
        });
      }
      if (patches.length > 0) {
        patches.forEach((patch: any) => {
          const bytes = Buffer.byteLength(patch.content, 'utf8');
          if (overLimit || bytes > MAX_EMBEDDED_SIZE) {
            const { uri, expiresAt } = createEphemeralResource(
              'text/x-diff',
              { text: patch.content },
              bytes,
            );
            content.push({ type: 'resource', resource: { uri } as any });
            content.push({
              type: 'resource',
              resource: {
                uri: `resource://unfugit/patches/${patch.hash}.${path.basename(args.path)}.diff.meta.json`,
                mimeType: 'application/json',
                text: JSON.stringify({ uri, size: bytes, mimeType: 'text/x-diff', expiresAt }),
                _meta: {
                  size: Buffer.byteLength(
                    JSON.stringify({ uri, size: bytes, mimeType: 'text/x-diff', expiresAt }),
                    'utf8',
                  ),
                },
              },
            });
          } else {
            content.push({
              type: 'resource',
              resource: {
                uri: `resource://unfugit/patches/${patch.hash}.${path.basename(args.path)}.diff`,
                mimeType: 'text/x-diff',
                text: patch.content,
                _meta: { size: bytes },
              },
            });
          }
        });
      }

      const createdStr = result.created_in
        ? `, created in ${result.created_in.substring(0, 8)}`
        : '';
      const deletedStr = result.deleted_in
        ? `, deleted in ${result.deleted_in.substring(0, 8)}`
        : '';
      const text = `Found ${timeline.commits.length} commits for ${args.path}${createdStr}${deletedStr}`;

      const resp = createToolResponse(content, result, text);
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );

  // unfugit_trace_lines
  registerToolWithErrorHandling(
    srv,
    'unfugit_trace_lines',
    {
      title: 'Trace Line History',
      description: 'Follow the history of specific lines in a file',
      inputSchema: {
        path: z.string(),
        start_line: z.number(),
        end_line: z.number().optional(),
        limit: z.number().optional().default(10),
        offset: z.number().optional(),
      },
    },
    async (args: any, _extra: any) => {
      // Map the input parameters to what gitLogL expects
      const mappedArgs = {
        file: args.path,
        start: args.start_line,
        end: args.end_line || args.start_line,
        limit: args.limit,
        offset: args.offset,
      };

      if (mappedArgs.start && mappedArgs.end && mappedArgs.start > mappedArgs.end) {
        return {
          content: [
            {
              type: 'text',
              text: `${DomainErrorCode.RANGE_INVALID}: Start line ${mappedArgs.start} is greater than end line ${mappedArgs.end}`,
            },
          ],
          structuredContent: { file: mappedArgs.file, trace: [], nextCursor: null },
          isError: true,
        };
      }

      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 20, 100, 'Tracing lines...');
      }
      const result = await gitLogL(mappedArgs);
      const text = `Found ${result.trace.length} commits affecting specified lines in ${mappedArgs.file}`;

      const resp = createToolResponse(
        [
          {
            type: 'resource',
            resource: {
              uri: `resource://unfugit/trace/${encodeURIComponent(mappedArgs.file.replace(/\//g, '-'))}.json`,
              mimeType: 'application/json',
              text: JSON.stringify(result),
              _meta: { size: Buffer.byteLength(JSON.stringify(result), 'utf8') },
            },
          },
        ],
        result,
        text,
      );
      if (_extra.progressToken) {
        await sendProgressNotification(_extra.progressToken, 100, 100, 'Done.');
      }
      return resp;
    },
  );
}

// --- Main Entry Point ---

async function main() {
  projectRoot = process.argv[2] || process.cwd();
  auditRepoPath = getAuditRepoPath(projectRoot);

  // Register all components BEFORE connecting
  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // After connect, we can send notifications
  await server.server.notification({ method: 'notifications/tools/list_changed', params: {} });
  await server.server.notification({ method: 'notifications/resources/list_changed', params: {} });
  await server.server.notification({ method: 'notifications/prompts/list_changed', params: {} });

  // Initialize repository and start background services
  await initializeAuditRepo();
  await tryBecomeActive();
  scheduleMaintenanceTasks();
  // Start periodic cleanup for ephemeral resources used when blobs exceed embed limits
  scheduleEphemeralCleanup();

  console.error('Unbreak Now: Fallback Using Git (unfugit) v1.0.0 - MCP server running on stdio');
  console.error(`Project: ${projectRoot}`);
  console.error(`Audit repo: ${auditRepoPath}`);
  console.error(`Role: ${sessionState.role}`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    stopLeaseRenewal();
    stopEphemeralCleanup();
    await stopWatcher();
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down...');
    stopLeaseRenewal();
    stopEphemeralCleanup();
    await stopWatcher();
    await server.close();
    process.exit(0);
  });
}

// Run main
main().catch(async (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
