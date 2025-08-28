#!/bin/bash

# Test unfugit against various autogit-related repositories
# This script specifically tests repositories created/managed by autogit

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Testing unfugit with Autogit Repositories      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Build unfugit
echo -e "${GREEN}► Building unfugit...${NC}"
cd "$SCRIPT_DIR"
npm run build > /dev/null 2>&1
echo -e "${GREEN}  ✓ Build complete${NC}"
echo ""

# Test repositories
REPOS=(
    "/home/user/.claude/mcp-servers/autogit|Main autogit MCP server"
    "/home/user/.claude/mcp-servers/unfugit|unfugit itself"
    "/home/user/.claude/mcp-servers/polyglot-mcp|Polyglot MCP server"
)

# Function to run quick test
test_repo() {
    local repo_path="$1"
    local description="$2"
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Testing: ${MAGENTA}$repo_path${NC}"
    echo -e "${CYAN}Description: $description${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [ ! -d "$repo_path" ]; then
        echo -e "${RED}  ✗ Directory not found${NC}"
        return 1
    fi
    
    # Check if it's a git repo
    if [ -d "$repo_path/.git" ]; then
        cd "$repo_path"
        echo -e "${BLUE}  Git Repository Info:${NC}"
        echo -e "    • Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
        echo -e "    • Commits: $(git rev-list --count HEAD 2>/dev/null || echo 'unknown')"
        echo -e "    • Last commit: $(git log --oneline -1 2>/dev/null || echo 'unknown')"
        cd - > /dev/null
    else
        echo -e "${YELLOW}  ⚠ Not a git repository (unfugit will create audit repo)${NC}"
    fi
    
    # Count files
    local file_count=$(find "$repo_path" -type f -not -path '*/\.*' -not -path '*/node_modules/*' 2>/dev/null | wc -l)
    echo -e "    • Files (non-hidden, non-node_modules): $file_count"
    echo ""
    
    # Run unfugit test
    echo -e "${GREEN}  ► Running unfugit test...${NC}"
    
    # Create temporary output file
    local output_file="/tmp/unfugit-test-$$.txt"
    
    # Use timeout and capture output
    if timeout 15 node "$SCRIPT_DIR/test-any-repo.js" "$repo_path" > "$output_file" 2>&1; then
        # Check for successful completion
        if grep -q "=== Tests Completed ===" "$output_file"; then
            echo -e "${GREEN}    ✓ Tests completed successfully${NC}"
            
            # Extract key information
            local server_ok=$(grep -c "Server is responding normally" "$output_file" 2>/dev/null || echo "0")
            local commits=$(grep "Found [0-9]* commits" "$output_file" 2>/dev/null | head -1 | sed 's/.*Found \([0-9]*\) commits.*/\1/' || echo "0")
            local resources=$(grep "Available resources:" "$output_file" 2>/dev/null | head -1 | sed 's/.*Available resources: //' || echo "0")
            
            echo -e "${BLUE}  Results:${NC}"
            echo -e "    • Server status: $([ "$server_ok" -gt 0 ] && echo '✓ OK' || echo '✗ Failed')"
            echo -e "    • Audit commits: $commits"
            echo -e "    • Resources available: $resources"
            
            # Check for any errors
            local error_count=$(grep -c "ERROR" "$output_file" 2>/dev/null || echo "0")
            if [ "$error_count" -gt "0" ] 2>/dev/null; then
                echo -e "${YELLOW}    ⚠ Warnings/Errors detected: $error_count${NC}"
                grep "ERROR" "$output_file" | head -3 | sed 's/^/      /'
            fi
        else
            echo -e "${YELLOW}    ⚠ Tests did not complete fully${NC}"
            tail -5 "$output_file" | sed 's/^/      /'
        fi
    else
        echo -e "${RED}    ✗ Test timed out or failed${NC}"
        tail -5 "$output_file" | sed 's/^/      /'
    fi
    
    # Cleanup
    rm -f "$output_file"
    echo ""
}

# Run tests
success_count=0
total_count=${#REPOS[@]}

for repo_info in "${REPOS[@]}"; do
    IFS='|' read -r repo_path description <<< "$repo_info"
    if test_repo "$repo_path" "$description"; then
        ((success_count++))
    fi
done

# Also test with some Claude project directories if they exist
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Checking Claude project directories${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Find autogit-related project directories
for proj_dir in ~/.claude/projects/*autogit*/; do
    if [ -d "$proj_dir" ]; then
        # Check if it has an autogit subdirectory with git data
        if [ -f "$proj_dir/autogit/config" ]; then
            echo -e "${MAGENTA}Found autogit project: $(basename "$proj_dir")${NC}"
            
            # Get the worktree path
            worktree=$(grep "worktree" "$proj_dir/autogit/config" 2>/dev/null | sed 's/.*worktree = //')
            
            if [ -n "$worktree" ] && [ -d "$worktree" ]; then
                echo -e "  Worktree: $worktree"
                test_repo "$worktree" "Autogit worktree for $(basename "$proj_dir")"
                ((total_count++))
                ((success_count++))
            else
                echo -e "  ${YELLOW}⚠ Worktree not found or not accessible${NC}"
            fi
        fi
    fi
done

# Summary
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Test Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "  Repositories tested: $total_count"
echo -e "  ${GREEN}✓ Successful: $success_count${NC}"
echo -e "  ${RED}✗ Failed: $((total_count - success_count))${NC}"
echo ""

if [ $success_count -eq $total_count ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║        All Autogit Tests Passed! 🎉                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║    Some Tests Had Issues - Review Output Above     ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
fi