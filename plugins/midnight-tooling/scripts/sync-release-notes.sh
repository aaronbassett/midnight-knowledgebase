#!/usr/bin/env bash
#
# Sync Midnight release notes from GitHub to local cache.
# Uses sparse checkout to minimize download size.
#

set -euo pipefail

CACHE_DIR="${HOME}/.cache/midnight-tooling"
RELEASE_NOTES_DIR="${CACHE_DIR}/release-notes"
METADATA_FILE="${CACHE_DIR}/metadata.json"
REPO_URL="https://github.com/midnightntwrk/midnight-docs.git"
SPARSE_PATH="main_versioned_docs/version-0.0.0/relnotes"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check for git
if ! command -v git &> /dev/null; then
    log_error "git is not installed. Please install git first."
    exit 1
fi

# Create cache directory
mkdir -p "${CACHE_DIR}"

# Create a temporary directory for cloning
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

log_info "Fetching release notes from Midnight docs repository..."

# Sparse clone
cd "${TEMP_DIR}"
git clone --depth 1 --filter=blob:none --sparse "${REPO_URL}" midnight-docs 2>&1 | grep -v "^remote:" || true
cd midnight-docs
git sparse-checkout set "${SPARSE_PATH}" 2>&1

# Get the commit SHA
COMMIT_SHA=$(git rev-parse HEAD)

# Check if we got the files
if [ ! -d "${SPARSE_PATH}" ]; then
    log_error "Failed to fetch release notes. Directory not found."
    exit 1
fi

# Count files
FILE_COUNT=$(find "${SPARSE_PATH}" -type f -name "*.mdx" | wc -l | tr -d ' ')
log_info "Found ${FILE_COUNT} release note files"

# Remove old cache and copy new files
rm -rf "${RELEASE_NOTES_DIR}"
mkdir -p "${RELEASE_NOTES_DIR}"
cp -r "${SPARSE_PATH}/"* "${RELEASE_NOTES_DIR}/"

# Create metadata file
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > "${METADATA_FILE}" << EOF
{
  "lastUpdated": "${TIMESTAMP}",
  "gitCommit": "${COMMIT_SHA}",
  "source": "${REPO_URL}",
  "sparsePath": "${SPARSE_PATH}",
  "fileCount": ${FILE_COUNT}
}
EOF

log_info "Release notes cached to: ${RELEASE_NOTES_DIR}"
log_info "Metadata saved to: ${METADATA_FILE}"
log_info "Cache updated at: ${TIMESTAMP}"

# Output summary as JSON for easy parsing
echo ""
echo "=== SYNC COMPLETE ==="
cat "${METADATA_FILE}"
