#!/usr/bin/env bash
# validate-examples.sh - Compile all Compact and TypeScript examples
# Part of compact-core plugin validation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$PLUGIN_ROOT/skills"
TMP_DIR="${TMPDIR:-/tmp}/compact-validate-$$"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Counters
compact_pass=0
compact_fail=0
ts_pass=0
ts_fail=0

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR"

echo "============================================"
echo "compact-core Example Validation"
echo "============================================"
echo ""

# Check for compactc
if ! command -v compactc &> /dev/null; then
    echo -e "${YELLOW}Warning: compactc not found. Skipping Compact validation.${NC}"
    echo "Install from Midnight Developer Portal to enable Compact validation."
    skip_compact=true
else
    skip_compact=false
    compactc_version=$(compactc --version 2>/dev/null || echo "unknown")
    echo "Compact compiler: $compactc_version"
fi

# Check for tsc
if ! command -v tsc &> /dev/null; then
    echo -e "${YELLOW}Warning: tsc not found. Skipping TypeScript validation.${NC}"
    echo "Install with: npm install -g typescript"
    skip_ts=true
else
    skip_ts=false
    tsc_version=$(tsc --version 2>/dev/null || echo "unknown")
    echo "TypeScript compiler: $tsc_version"
fi

echo ""

# Validate Compact files
if [ "$skip_compact" = false ]; then
    echo "--- Validating Compact Examples ---"

    while IFS= read -r -d '' file; do
        rel_path="${file#$SKILLS_DIR/}"

        if compactc "$file" -o "$TMP_DIR/out" --skip-zk 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $rel_path"
            ((compact_pass++))
        else
            echo -e "${RED}✗${NC} $rel_path"
            ((compact_fail++))
        fi

        rm -rf "$TMP_DIR/out"
    done < <(find "$SKILLS_DIR" -name "*.compact" -type f -print0)

    echo ""
fi

# Validate TypeScript files
if [ "$skip_ts" = false ]; then
    echo "--- Validating TypeScript Examples ---"

    while IFS= read -r -d '' file; do
        rel_path="${file#$SKILLS_DIR/}"

        if tsc --noEmit "$file" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $rel_path"
            ((ts_pass++))
        else
            echo -e "${RED}✗${NC} $rel_path"
            ((ts_fail++))
        fi
    done < <(find "$SKILLS_DIR" -name "*.ts" -type f -print0)

    echo ""
fi

# Summary
echo "============================================"
echo "Summary"
echo "============================================"

total_pass=$((compact_pass + ts_pass))
total_fail=$((compact_fail + ts_fail))

if [ "$skip_compact" = false ]; then
    echo "Compact: $compact_pass passed, $compact_fail failed"
fi
if [ "$skip_ts" = false ]; then
    echo "TypeScript: $ts_pass passed, $ts_fail failed"
fi
echo "Total: $total_pass passed, $total_fail failed"
echo ""

if [ $total_fail -gt 0 ]; then
    echo -e "${RED}Validation FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}Validation PASSED${NC}"
    exit 0
fi
