#!/usr/bin/env bash
#
# Quick prerequisite check for Midnight development environment.
#

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
    local name="$1"
    local cmd="$2"
    local version_cmd="$3"
    local required="$4"

    if command -v "$cmd" &> /dev/null; then
        version=$(eval "$version_cmd" 2>/dev/null || echo "unknown")
        echo -e "${GREEN}✓${NC} $name: $version"
        return 0
    else
        if [ "$required" = "true" ]; then
            echo -e "${RED}✗${NC} $name: NOT INSTALLED (required)"
            return 1
        else
            echo -e "${YELLOW}○${NC} $name: not installed (optional)"
            return 0
        fi
    fi
}

echo "=== Midnight Development Prerequisites ==="
echo ""

errors=0

check "Node.js" "node" "node --version" "true" || ((errors++))
check "npm" "npm" "npm --version" "true" || ((errors++))
check "Git" "git" "git --version | cut -d' ' -f3" "true" || ((errors++))
check "Docker" "docker" "docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1" "true" || ((errors++))
check "Compact CLI" "compact" "compact --version" "true" || ((errors++))
check "Yarn" "yarn" "yarn --version" "false" || true
check "Bun" "bun" "bun --version" "false" || true

echo ""

# Check Node.js version specifically
if command -v node &> /dev/null; then
    NODE_MAJOR=$(node --version | sed 's/v//' | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        echo -e "${YELLOW}⚠${NC}  Node.js version should be 18 or higher (found v$NODE_MAJOR)"
        ((errors++))
    fi
fi

# Check if Docker daemon is running
if command -v docker &> /dev/null; then
    if ! docker info &> /dev/null; then
        echo -e "${YELLOW}⚠${NC}  Docker is installed but daemon is not running"
        ((errors++))
    fi
fi

echo ""
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}All prerequisites satisfied!${NC}"
    exit 0
else
    echo -e "${RED}$errors issue(s) found. Please address them before continuing.${NC}"
    exit 1
fi
