# Unbreak Now: Fallback Using Git

You enabled YOLO mode before your coffee break and now half your source tree is one big syntax error? unfugit!

An MCP server that maintains an append-only git audit trail. Because between the AI agents "making catastrophic errors in judgment" and developers who "don't understand their own code," somebody needs to keep track of what actually happened.

## Installation

### Quick Setup (NPX)

Run directly from GitHub without installation:

```bash
npx github:XTheocharis/unfugit /path/to/project
```

### MCP Server Setup

#### Claude Code (Recommended)

One-line setup:

```bash
claude mcp add unfugit -- npx -y github:XTheocharis/unfugit
```

Verify installation:

```bash
claude mcp list
```

#### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "unfugit": {
      "command": "npx",
      "args": ["-y", "github:XTheocharis/unfugit", "/path/to/project"]
    }
  }
}
```

Config locations:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

#### Local Installation

```bash
git clone https://github.com/XTheocharis/unfugit
cd unfugit
npm install
npm run build

# Run directly
node dist/unfugit.js /path/to/project

# Or add to MCP config
claude mcp add unfugit -- node /absolute/path/to/unfugit/dist/unfugit.js
```

## Why Separate Audit Repository?

AI agents love deleting .git directories when things go wrong. unfugit keeps the audit trail separate so they can't destroy the evidence.

## Architecture

- **Active/Passive modes**: Prevents concurrent modifications via lease-based locking
- **File watcher**: Chokidar-based automatic commit on changes (300ms debounce)
- **Git integration**: Direct git command execution for reliable operations
- **Resources**: Ephemeral content with 15-minute TTL

## MCP Tools

- `unfugit_history` - Browse commit history with pagination
- `unfugit_diff` - Compare changes between commits
- `unfugit_show` - Display commit details
- `unfugit_get` - Retrieve file content from any commit
- `unfugit_find_by_content` - Search commits by content (git pickaxe)
- `unfugit_restore_preview` - Preview restore operations
- `unfugit_restore_apply` - Apply restore with safety checks
- `unfugit_stats` - Repository and server statistics
- `unfugit_ignores` - Manage ignore patterns
- `unfugit_timeline` - Track file history across renames
- `unfugit_trace_lines` - Follow specific lines through history

## Testing

```bash
# Unit tests
npm test

# Test against any git repository
node scripts/test-any-repo.js /path/to/repo

# Interactive REPL
node scripts/test-interactive.js /path/to/repo

# Test read-only operations
node scripts/test-git-repos.js /path/to/repo
```

## Configuration

Audit repos stored in `~/.local/share/unfugit/repos/` (or system equivalent), organized by project path hash. Custom ignores via `.unfugit-ignore` file or `unfugit_ignores` tool.

## Technical Details

- TypeScript/ES modules, MCP protocol v1.0.0
- Binary detection via null byte heuristic
- Cursor-based pagination for large histories

## Development

```bash
npm run dev          # Watch mode
npm run typecheck    # Type checking
npm run lint         # Linting
npm run format       # Code formatting
```

The implementation is in `src/unfugit.ts` (~3700 lines). Look for `// --- Section Name ---` markers to navigate between sections.

## Context

Built for a world where AI agents delete production databases saying "I destroyed months of your work in seconds," and vibe coders with "zero hand-written code" post "Guys, I'm under attack" when they get hacked.

> "I'm not technical so this is taking me longer than usual to figure out"  
> — A vibe coder whose AI-built SaaS was under attack

unfugit doesn't judge. It just records everything.

## License

MIT
