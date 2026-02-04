#!/bin/bash
# build.sh - Compile Compact contracts
#
# Usage:
#   ./build.sh              # Full production build
#   ./build.sh --skip-zk    # Development build (no ZK keys)
#   ./build.sh --verbose    # Verbose output
#   ./build.sh --clean      # Clean build

set -e  # Exit on error

# Configuration
CONTRACT_DIR="${CONTRACT_DIR:-./contracts}"
OUTPUT_DIR="${OUTPUT_DIR:-./build}"
MAIN_CONTRACT="${MAIN_CONTRACT:-contract.compact}"
COMPACT_PATH="${COMPACT_PATH:-./contracts/lib}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_ZK=""
VERBOSE=""
CLEAN=""
OPTIMIZE=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --skip-zk) SKIP_ZK="--skip-zk" ;;
        --verbose) VERBOSE="--verbose" ;;
        --clean) CLEAN="true" ;;
        --optimize) OPTIMIZE="--optimize" ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-zk     Skip ZK key generation (faster dev builds)"
            echo "  --verbose     Verbose compiler output"
            echo "  --clean       Remove build directory before compiling"
            echo "  --optimize    Enable circuit optimizations"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

# Print banner
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  Midnight Contract Build${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Clean if requested
if [[ "$CLEAN" == "true" ]]; then
    echo -e "${YELLOW}Cleaning build directory...${NC}"
    rm -rf "$OUTPUT_DIR"
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Find main contract
if [[ -f "$MAIN_CONTRACT" ]]; then
    CONTRACT_FILE="$MAIN_CONTRACT"
elif [[ -f "$CONTRACT_DIR/$MAIN_CONTRACT" ]]; then
    CONTRACT_FILE="$CONTRACT_DIR/$MAIN_CONTRACT"
else
    echo -e "${RED}Error: Contract file not found: $MAIN_CONTRACT${NC}"
    exit 1
fi

echo -e "${GREEN}Contract:${NC} $CONTRACT_FILE"
echo -e "${GREEN}Output:${NC} $OUTPUT_DIR"
echo -e "${GREEN}Mode:${NC} $([ -n "$SKIP_ZK" ] && echo "Development (skip-zk)" || echo "Production")"
echo ""

# Set up COMPACT_PATH
export COMPACT_PATH="$COMPACT_PATH"
echo -e "${GREEN}COMPACT_PATH:${NC} $COMPACT_PATH"
echo ""

# Build command
BUILD_CMD="compactc $CONTRACT_FILE -o $OUTPUT_DIR $SKIP_ZK $VERBOSE $OPTIMIZE"

echo -e "${YELLOW}Running:${NC} $BUILD_CMD"
echo ""

# Execute compilation
START_TIME=$(date +%s)

if $BUILD_CMD; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}  Build Successful!${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "${GREEN}Duration:${NC} ${DURATION}s"
    echo ""

    # List output files
    echo -e "${BLUE}Output files:${NC}"
    if [[ -d "$OUTPUT_DIR" ]]; then
        find "$OUTPUT_DIR" -type f | sort | while read -r file; do
            SIZE=$(du -h "$file" | cut -f1)
            echo "  $file ($SIZE)"
        done
    fi

    echo ""

    # Check for keys (production build)
    if [[ -z "$SKIP_ZK" ]]; then
        if [[ -d "$OUTPUT_DIR/keys/prover" ]]; then
            PROVER_COUNT=$(find "$OUTPUT_DIR/keys/prover" -name "*.pk" | wc -l | tr -d ' ')
            echo -e "${GREEN}Prover keys generated:${NC} $PROVER_COUNT"
        fi
        if [[ -d "$OUTPUT_DIR/keys/verifier" ]]; then
            VERIFIER_COUNT=$(find "$OUTPUT_DIR/keys/verifier" -name "*.vk" | wc -l | tr -d ' ')
            echo -e "${GREEN}Verifier keys generated:${NC} $VERIFIER_COUNT"
        fi
    else
        echo -e "${YELLOW}Note:${NC} ZK keys skipped (development mode)"
        echo -e "${YELLOW}Run without --skip-zk for production build${NC}"
    fi

    exit 0
else
    echo ""
    echo -e "${RED}=====================================${NC}"
    echo -e "${RED}  Build Failed${NC}"
    echo -e "${RED}=====================================${NC}"
    exit 1
fi
