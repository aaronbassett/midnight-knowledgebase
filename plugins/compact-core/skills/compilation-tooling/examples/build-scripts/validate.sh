#!/bin/bash
# validate.sh - Validate Compact contracts without generating output
#
# Usage:
#   ./validate.sh                    # Validate all .compact files
#   ./validate.sh contract.compact   # Validate specific file
#   ./validate.sh --strict           # Strict mode (warnings as errors)
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation errors found
#   2 - Configuration error

set -e

# Configuration
CONTRACT_DIR="${CONTRACT_DIR:-./contracts}"
COMPACT_PATH="${COMPACT_PATH:-./contracts/lib}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
STRICT=""
FILES=()
JSON_OUTPUT=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --strict) STRICT="true" ;;
        --json) JSON_OUTPUT="true" ;;
        -h|--help)
            echo "Usage: $0 [options] [files...]"
            echo ""
            echo "Options:"
            echo "  --strict      Treat warnings as errors"
            echo "  --json        Output results as JSON"
            echo "  -h, --help    Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                           # Validate all contracts"
            echo "  $0 contract.compact          # Validate specific file"
            echo "  $0 --strict *.compact        # Strict validation"
            exit 0
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 2
            ;;
        *)
            FILES+=("$1")
            ;;
    esac
    shift
done

# Set up COMPACT_PATH
export COMPACT_PATH="$COMPACT_PATH"

# If no files specified, find all .compact files
if [[ ${#FILES[@]} -eq 0 ]]; then
    if [[ -d "$CONTRACT_DIR" ]]; then
        while IFS= read -r -d '' file; do
            FILES+=("$file")
        done < <(find "$CONTRACT_DIR" -name "*.compact" -type f -print0 2>/dev/null)
    fi

    # Also check current directory
    while IFS= read -r -d '' file; do
        FILES+=("$file")
    done < <(find . -maxdepth 1 -name "*.compact" -type f -print0 2>/dev/null)
fi

# Remove duplicates
FILES=($(printf "%s\n" "${FILES[@]}" | sort -u))

if [[ ${#FILES[@]} -eq 0 ]]; then
    echo -e "${YELLOW}No .compact files found to validate${NC}"
    exit 0
fi

# Print banner (unless JSON mode)
if [[ -z "$JSON_OUTPUT" ]]; then
    echo -e "${BLUE}=====================================${NC}"
    echo -e "${BLUE}  Compact Contract Validation${NC}"
    echo -e "${BLUE}=====================================${NC}"
    echo ""
    echo -e "${GREEN}Files to validate:${NC} ${#FILES[@]}"
    echo -e "${GREEN}COMPACT_PATH:${NC} $COMPACT_PATH"
    [[ -n "$STRICT" ]] && echo -e "${YELLOW}Mode:${NC} Strict (warnings as errors)"
    echo ""
fi

# Track results
PASSED=0
FAILED=0
WARNINGS=0
RESULTS=()

# Validate each file
for file in "${FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}File not found: $file${NC}"
        FAILED=$((FAILED + 1))
        continue
    fi

    if [[ -z "$JSON_OUTPUT" ]]; then
        echo -n "Validating $file... "
    fi

    # Run validation (dry-run mode)
    OUTPUT=$(compactc "$file" --dry-run --json 2>&1) || true

    # Parse JSON output
    SUCCESS=$(echo "$OUTPUT" | jq -r '.success // false' 2>/dev/null || echo "false")
    ERROR_COUNT=$(echo "$OUTPUT" | jq -r '.errors | length // 0' 2>/dev/null || echo "0")
    WARNING_COUNT=$(echo "$OUTPUT" | jq -r '.warnings | length // 0' 2>/dev/null || echo "0")

    # Determine result
    if [[ "$SUCCESS" == "true" && "$ERROR_COUNT" == "0" ]]; then
        if [[ "$WARNING_COUNT" != "0" && -n "$STRICT" ]]; then
            # Strict mode: warnings count as failures
            STATUS="warning"
            FAILED=$((FAILED + 1))
        elif [[ "$WARNING_COUNT" != "0" ]]; then
            STATUS="warning"
            PASSED=$((PASSED + 1))
            WARNINGS=$((WARNINGS + WARNING_COUNT))
        else
            STATUS="passed"
            PASSED=$((PASSED + 1))
        fi
    else
        STATUS="failed"
        FAILED=$((FAILED + 1))
    fi

    # Record result
    RESULTS+=("{\"file\":\"$file\",\"status\":\"$STATUS\",\"errors\":$ERROR_COUNT,\"warnings\":$WARNING_COUNT}")

    # Print result (unless JSON mode)
    if [[ -z "$JSON_OUTPUT" ]]; then
        case $STATUS in
            passed)
                echo -e "${GREEN}PASSED${NC}"
                ;;
            warning)
                echo -e "${YELLOW}WARNING${NC} ($WARNING_COUNT warnings)"
                # Show warnings
                echo "$OUTPUT" | jq -r '.warnings[]? | "  - \(.message)"' 2>/dev/null || true
                ;;
            failed)
                echo -e "${RED}FAILED${NC}"
                # Show errors
                echo "$OUTPUT" | jq -r '.errors[]? | "  - \(.location.file):\(.location.line): \(.message)"' 2>/dev/null || true
                ;;
        esac
    fi
done

# Output results
if [[ -n "$JSON_OUTPUT" ]]; then
    # JSON output
    echo "{"
    echo "  \"total\": ${#FILES[@]},"
    echo "  \"passed\": $PASSED,"
    echo "  \"failed\": $FAILED,"
    echo "  \"warnings\": $WARNINGS,"
    echo "  \"results\": ["
    printf "    %s\n" "$(IFS=,; echo "${RESULTS[*]}" | sed 's/},{/},\n    {/g')"
    echo "  ]"
    echo "}"
else
    # Human-readable summary
    echo ""
    echo -e "${BLUE}=====================================${NC}"
    echo -e "${BLUE}  Validation Summary${NC}"
    echo -e "${BLUE}=====================================${NC}"
    echo ""
    echo -e "Total:    ${#FILES[@]}"
    echo -e "Passed:   ${GREEN}$PASSED${NC}"
    echo -e "Failed:   ${RED}$FAILED${NC}"
    echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
    echo ""

    if [[ $FAILED -eq 0 ]]; then
        echo -e "${GREEN}All validations passed!${NC}"
        [[ $WARNINGS -gt 0 ]] && echo -e "${YELLOW}Consider addressing $WARNINGS warning(s)${NC}"
        exit 0
    else
        echo -e "${RED}Validation failed for $FAILED file(s)${NC}"
        exit 1
    fi
fi
