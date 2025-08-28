#!/bin/bash

# Test unfugit with external repositories
# Usage: ./test-external-repo.sh [repo-url-or-path]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="/tmp/unfugit-test-$$"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Unfugit External Repository Test ===${NC}"

# Function to cleanup on exit
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        echo -e "${YELLOW}Cleaning up temporary directory...${NC}"
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# Check if repo argument provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <repo-url-or-path>"
    echo ""
    echo "Examples:"
    echo "  $0 https://github.com/nodejs/node.git"
    echo "  $0 /path/to/local/repo"
    echo "  $0 ."
    exit 1
fi

REPO_SOURCE="$1"

# Build unfugit first
echo -e "${GREEN}Building unfugit...${NC}"
cd "$SCRIPT_DIR"
npm run build

# Check if it's a URL or local path
if [[ "$REPO_SOURCE" =~ ^https?:// ]] || [[ "$REPO_SOURCE" =~ ^git@ ]]; then
    # It's a remote repository
    echo -e "${GREEN}Cloning repository: $REPO_SOURCE${NC}"
    mkdir -p "$TEMP_DIR"
    
    # Clone with limited depth for faster testing
    git clone --depth 10 "$REPO_SOURCE" "$TEMP_DIR/repo" 2>/dev/null || \
    git clone "$REPO_SOURCE" "$TEMP_DIR/repo"
    
    TEST_REPO="$TEMP_DIR/repo"
    echo -e "${GREEN}Repository cloned to: $TEST_REPO${NC}"
else
    # It's a local path
    TEST_REPO="$(realpath "$REPO_SOURCE")"
    if [ ! -d "$TEST_REPO" ]; then
        echo -e "${RED}Error: Directory not found: $TEST_REPO${NC}"
        exit 1
    fi
    echo -e "${GREEN}Using local repository: $TEST_REPO${NC}"
fi

# Show repo info
echo -e "${BLUE}Repository Information:${NC}"
if [ -d "$TEST_REPO/.git" ]; then
    cd "$TEST_REPO"
    echo "  Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo "  Commits: $(git rev-list --count HEAD 2>/dev/null || echo 'unknown')"
    echo "  Files: $(find . -type f -not -path '*/\.*' 2>/dev/null | wc -l)"
    echo "  Remote: $(git remote get-url origin 2>/dev/null || echo 'none')"
    cd - > /dev/null
else
    echo "  Not a git repository (unfugit will create audit repo)"
    echo "  Files: $(find "$TEST_REPO" -type f -not -path '*/\.*' 2>/dev/null | wc -l)"
fi

echo ""
echo -e "${BLUE}Starting unfugit tests...${NC}"

# Run the Node.js test script
node "$SCRIPT_DIR/test-any-repo.js" "$TEST_REPO" "$SCRIPT_DIR/dist/unfugit.js"

echo ""
echo -e "${GREEN}✓ Test completed successfully${NC}"