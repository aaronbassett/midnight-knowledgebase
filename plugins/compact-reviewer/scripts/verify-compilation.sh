#!/bin/bash
# verify-compilation.sh - Verify Compact contract compilation
# Usage: verify-compilation.sh <file.compact> [--skip-zk]
#
# Exit codes:
#   0 - Compilation successful
#   1 - Compilation failed
#   2 - Compiler not found
#   3 - File not found

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

SKIP_ZK=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-zk)
            SKIP_ZK=true
            shift
            ;;
        -*)
            echo "Unknown option: $1"
            exit 3
            ;;
        *)
            FILE="$1"
            shift
            ;;
    esac
done

if [[ -z "${FILE:-}" ]]; then
    echo "Usage: $0 <file.compact> [--skip-zk]"
    exit 3
fi

if [[ ! -f "$FILE" ]]; then
    echo -e "${RED}[FAIL]${NC} Compilation: $FILE"
    echo "Error: File not found"
    exit 3
fi

if [[ ! "$FILE" == *.compact ]]; then
    echo -e "${RED}[FAIL]${NC} Compilation: $FILE"
    echo "Error: Not a .compact file"
    exit 3
fi

# Check for compactc compiler
if ! command -v compactc &> /dev/null; then
    echo -e "${YELLOW}[SKIP]${NC} Compilation: $FILE"
    echo ""
    echo "Compiler: compactc not found"
    echo ""
    echo "To install compactc, see: https://docs.midnight.network/"
    echo "Compilation check skipped."
    exit 2
fi

# Get compiler version
COMPILER_VERSION=$(compactc --version 2>/dev/null || echo "unknown")

echo "Compiler: compactc $COMPILER_VERSION"
echo ""

# Build compile command
COMPILE_CMD="compactc"
if [[ "$SKIP_ZK" == true ]]; then
    COMPILE_CMD="$COMPILE_CMD --skip-zk"
fi
COMPILE_CMD="$COMPILE_CMD $FILE"

# Create temp directory for output
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Run compilation
if OUTPUT=$($COMPILE_CMD -o "$TEMP_DIR" 2>&1); then
    echo -e "${GREEN}[PASS]${NC} Compilation: $FILE"
    echo ""
    echo "Compilation successful"

    # Show generated files
    if [[ -d "$TEMP_DIR" ]] && [[ "$(ls -A $TEMP_DIR)" ]]; then
        echo ""
        echo "Generated files:"
        ls -la "$TEMP_DIR" | tail -n +4 | while read -r line; do
            echo "  $line"
        done
    fi

    exit 0
else
    echo -e "${RED}[FAIL]${NC} Compilation: $FILE"
    echo ""

    # Parse and display error
    if [[ -n "$OUTPUT" ]]; then
        # Try to extract line number from error
        if [[ "$OUTPUT" =~ line[[:space:]]+([0-9]+) ]]; then
            ERROR_LINE="${BASH_REMATCH[1]}"
            echo "Error at line $ERROR_LINE:"
        else
            echo "Compiler error:"
        fi
        echo "$OUTPUT" | head -20
    fi

    exit 1
fi
