#!/bin/bash
# lint-compact.sh - Basic style checks for Compact smart contracts
# Usage: lint-compact.sh <file.compact>
#
# Exit codes:
#   0 - All checks passed
#   1 - Issues found
#   2 - File not found or invalid

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <file.compact>"
    exit 2
fi

FILE="$1"

if [[ ! -f "$FILE" ]]; then
    echo -e "${RED}[FAIL]${NC} Linting: $FILE"
    echo "Error: File not found"
    exit 2
fi

if [[ ! "$FILE" == *.compact ]]; then
    echo -e "${RED}[FAIL]${NC} Linting: $FILE"
    echo "Error: Not a .compact file"
    exit 2
fi

ISSUES=()
LINE_NUM=0

while IFS= read -r line || [[ -n "$line" ]]; do
    ((LINE_NUM++))

    # Check for trailing whitespace
    if [[ "$line" =~ [[:space:]]$ ]]; then
        ISSUES+=("Line $LINE_NUM: Trailing whitespace")
    fi

    # Check for tabs (prefer spaces)
    if [[ "$line" == *$'\t'* ]]; then
        ISSUES+=("Line $LINE_NUM: Tab character found (prefer spaces)")
    fi

    # Check for lines over 120 characters
    if [[ ${#line} -gt 120 ]]; then
        ISSUES+=("Line $LINE_NUM: Line exceeds 120 characters (${#line})")
    fi

    # Check for missing semicolon after pragma
    if [[ "$line" =~ ^pragma.*[^;]$ ]]; then
        ISSUES+=("Line $LINE_NUM: Pragma statement missing semicolon")
    fi

    # Check for multiple statements on same line (simple heuristic)
    # Note: Compact uses `for i in start..end`, not C-style for(;;)
    if [[ "$line" =~ \;.*\; ]]; then
        ISSUES+=("Line $LINE_NUM: Multiple statements on same line")
    fi

    # Check for TODO/FIXME comments
    if [[ "$line" =~ (TODO|FIXME|HACK|XXX) ]]; then
        ISSUES+=("Line $LINE_NUM: Contains TODO/FIXME marker")
    fi

    # Check for empty circuit bodies
    if [[ "$line" =~ circuit.*\{\}[[:space:]]*$ ]]; then
        ISSUES+=("Line $LINE_NUM: Empty circuit body")
    fi

    # Check for commented-out code (multiple consecutive comment lines with code-like content)
    if [[ "$line" =~ ^[[:space:]]*//.*\; ]]; then
        ISSUES+=("Line $LINE_NUM: Possible commented-out code")
    fi

done < "$FILE"

# Report results
if [[ ${#ISSUES[@]} -eq 0 ]]; then
    echo -e "${GREEN}[PASS]${NC} Linting: $FILE"
    echo ""
    echo "No style issues found."
    exit 0
else
    echo -e "${YELLOW}[FAIL]${NC} Linting: $FILE"
    echo ""
    echo "Issues found:"
    for issue in "${ISSUES[@]}"; do
        echo "  - $issue"
    done
    echo ""
    echo "Summary: ${#ISSUES[@]} issues found"
    exit 1
fi
