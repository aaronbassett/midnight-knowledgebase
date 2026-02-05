#!/usr/bin/env bash
#
# Quick check of Midnight development environment.
# Outputs JSON with status of each required tool.
#

set -euo pipefail

# Function to check if a command exists and get its version
check_tool() {
    local name="$1"
    local cmd="$2"
    local version_cmd="$3"
    local required="$4"

    local installed="false"
    local version=""

    if command -v "$cmd" &> /dev/null; then
        installed="true"
        # Get version, suppress errors
        version=$(eval "$version_cmd" 2>/dev/null | head -1 || echo "unknown")
    fi

    echo "{\"name\": \"$name\", \"command\": \"$cmd\", \"installed\": $installed, \"version\": \"$version\", \"required\": $required}"
}

# Function to check Docker container/image
check_docker_image() {
    local name="$1"
    local image="$2"

    local available="false"
    local version=""

    if command -v docker &> /dev/null; then
        # Check if image exists locally
        if docker images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -q "$image"; then
            available="true"
            version=$(docker images --format "{{.Tag}}" "$image" 2>/dev/null | head -1)
        fi
    fi

    echo "{\"name\": \"$name\", \"image\": \"$image\", \"available\": $available, \"version\": \"$version\"}"
}

# Collect all checks
echo "{"
echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
echo "  \"tools\": ["

# Core tools
echo "    $(check_tool "Node.js" "node" "node --version" true),"
echo "    $(check_tool "npm" "npm" "npm --version" true),"
echo "    $(check_tool "Yarn" "yarn" "yarn --version" false),"
echo "    $(check_tool "Bun" "bun" "bun --version" false),"
echo "    $(check_tool "Git" "git" "git --version | cut -d' ' -f3" true),"
echo "    $(check_tool "Docker" "docker" "docker --version | cut -d' ' -f3 | tr -d ','" true),"
echo "    $(check_tool "Compact CLI" "compact" "compact --version" true),"
echo "    $(check_tool "Compact Compiler" "compact" "compact compile --version 2>/dev/null || echo 'not installed'" true)"

echo "  ],"
echo "  \"docker_images\": ["
echo "    $(check_docker_image "Proof Server" "midnightnetwork/proof-server")"
echo "  ],"

# Check if proof server is running
PROOF_SERVER_RUNNING="false"
if command -v docker &> /dev/null; then
    if docker ps --format "{{.Image}}" 2>/dev/null | grep -q "proof-server"; then
        PROOF_SERVER_RUNNING="true"
    fi
fi

echo "  \"services\": {"
echo "    \"proof_server_running\": $PROOF_SERVER_RUNNING"
echo "  },"

# Node version check (should be 18+)
NODE_VERSION_OK="false"
if command -v node &> /dev/null; then
    NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//' | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
        NODE_VERSION_OK="true"
    fi
fi

echo "  \"validations\": {"
echo "    \"node_version_18_plus\": $NODE_VERSION_OK"
echo "  }"

echo "}"
