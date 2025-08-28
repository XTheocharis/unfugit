#!/bin/bash

# Comprehensive integration test for unfugit with multiple repositories
# This script tests unfugit against various real git repositories

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_BASE="/tmp/unfugit-integration-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test repositories
TEST_REPOS=(
    "https://github.com/chalk/chalk.git|chalk|Small popular npm package"
    "https://github.com/expressjs/express.git|express|Popular web framework"
    "https://github.com/lodash/lodash.git|lodash|Utility library"
)

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Unfugit Integration Test Suite               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Cleanup function
cleanup() {
    if [ -d "$TEMP_BASE" ]; then
        echo -e "${YELLOW}Cleaning up temporary directories...${NC}"
        rm -rf "$TEMP_BASE"
    fi
}
trap cleanup EXIT

# Build unfugit
echo -e "${GREEN}► Building unfugit...${NC}"
cd "$SCRIPT_DIR"
npm run build > /dev/null 2>&1
echo -e "${GREEN}  ✓ Build complete${NC}"
echo ""

# Create temp directory
mkdir -p "$TEMP_BASE"

# Function to test a repository
test_repository() {
    local repo_url="$1"
    local repo_name="$2"
    local repo_desc="$3"
    local test_dir="$TEMP_BASE/$repo_name"
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Testing: $repo_name${NC}"
    echo -e "${CYAN}Description: $repo_desc${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Clone repository with shallow depth
    echo -e "${GREEN}  ► Cloning repository...${NC}"
    git clone --depth 5 --quiet "$repo_url" "$test_dir" 2>/dev/null || {
        echo -e "${RED}  ✗ Failed to clone repository${NC}"
        return 1
    }
    echo -e "${GREEN}    ✓ Repository cloned${NC}"
    
    # Get repo stats
    cd "$test_dir"
    local file_count=$(find . -type f -not -path '*/\.*' 2>/dev/null | wc -l)
    local commit_count=$(git rev-list --count HEAD 2>/dev/null || echo "unknown")
    cd - > /dev/null
    
    echo -e "${BLUE}  Repository Stats:${NC}"
    echo -e "    • Files: $file_count"
    echo -e "    • Commits: $commit_count"
    echo ""
    
    # Run the test
    echo -e "${GREEN}  ► Running unfugit tests...${NC}"
    
    # Create a test output file
    local output_file="$TEMP_BASE/${repo_name}_output.txt"
    
    # Run the test with timeout
    timeout 30 node "$SCRIPT_DIR/test-any-repo.js" "$test_dir" > "$output_file" 2>&1 || {
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            echo -e "${YELLOW}  ⚠ Test timed out after 30 seconds${NC}"
        else
            echo -e "${RED}  ✗ Test failed with exit code $exit_code${NC}"
        fi
        
        # Show last few lines of output for debugging
        echo -e "${YELLOW}  Last output lines:${NC}"
        tail -n 10 "$output_file" | sed 's/^/    /'
        return 1
    }
    
    # Check test results
    if grep -q "=== Tests Completed ===" "$output_file"; then
        echo -e "${GREEN}    ✓ All tests completed${NC}"
        
        # Extract some key metrics
        local ping_ok=$(grep -c "Server is responding normally" "$output_file" || echo 0)
        local commits_found=$(grep "Found [0-9]* commits" "$output_file" | head -1 || echo "No commits info")
        
        echo -e "${BLUE}  Test Results:${NC}"
        echo -e "    • Server responding: $([ $ping_ok -gt 0 ] && echo '✓' || echo '✗')"
        echo -e "    • $commits_found"
    else
        echo -e "${RED}  ✗ Tests did not complete${NC}"
        
        # Show last few lines for debugging
        echo -e "${YELLOW}  Last output lines:${NC}"
        tail -n 10 "$output_file" | sed 's/^/    /'
    fi
    
    echo ""
    return 0
}

# Test with local repository first
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Testing with local repository (unfugit itself)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"

test_repository "file://$SCRIPT_DIR" "unfugit-local" "Local unfugit repository"

# Test with external repositories
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Testing with external repositories${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

success_count=0
fail_count=0

for repo_info in "${TEST_REPOS[@]}"; do
    IFS='|' read -r repo_url repo_name repo_desc <<< "$repo_info"
    
    if test_repository "$repo_url" "$repo_name" "$repo_desc"; then
        ((success_count++))
    else
        ((fail_count++))
    fi
done

# Summary
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Test Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✓ Successful: $success_count${NC}"
echo -e "  ${RED}✗ Failed: $fail_count${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         All Integration Tests Passed! 🎉           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║      Some Tests Failed - Review Output Above       ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
    exit 1
fi