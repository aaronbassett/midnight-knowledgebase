#!/bin/bash
# watch.sh - Watch Compact files and rebuild on changes
#
# Usage:
#   ./watch.sh              # Watch and rebuild
#   ./watch.sh --verbose    # With verbose output
#
# Requires: fswatch (macOS) or inotifywait (Linux)

set -e

# Configuration
CONTRACT_DIR="${CONTRACT_DIR:-./contracts}"
OUTPUT_DIR="${OUTPUT_DIR:-./build}"
MAIN_CONTRACT="${MAIN_CONTRACT:-contract.compact}"
WATCH_EXTENSIONS="compact"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
VERBOSE=""
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --verbose) VERBOSE="--verbose" ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --verbose     Verbose compiler output"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
    esac
    shift
done

# Determine which watch tool to use
if command -v fswatch &> /dev/null; then
    WATCH_CMD="fswatch"
elif command -v inotifywait &> /dev/null; then
    WATCH_CMD="inotify"
else
    echo -e "${RED}Error: Neither fswatch nor inotifywait found${NC}"
    echo ""
    echo "Install one of:"
    echo "  macOS:  brew install fswatch"
    echo "  Linux:  apt-get install inotify-tools"
    exit 1
fi

# Build function
build() {
    echo ""
    echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} ${YELLOW}Building...${NC}"

    # Find contract file
    if [[ -f "$MAIN_CONTRACT" ]]; then
        CONTRACT_FILE="$MAIN_CONTRACT"
    elif [[ -f "$CONTRACT_DIR/$MAIN_CONTRACT" ]]; then
        CONTRACT_FILE="$CONTRACT_DIR/$MAIN_CONTRACT"
    else
        echo -e "${RED}Error: Contract not found${NC}"
        return 1
    fi

    # Run build with --skip-zk for speed
    if compactc "$CONTRACT_FILE" -o "$OUTPUT_DIR" --skip-zk $VERBOSE 2>&1; then
        echo -e "${GREEN}Build successful${NC}"
        echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} Watching for changes..."
    else
        echo -e "${RED}Build failed${NC}"
    fi
}

# Print banner
clear
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  Midnight Contract Watch Mode${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""
echo -e "${GREEN}Watching:${NC} $CONTRACT_DIR"
echo -e "${GREEN}Output:${NC} $OUTPUT_DIR"
echo -e "${GREEN}Extensions:${NC} *.$WATCH_EXTENSIONS"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Initial build
build

# Watch loop
if [[ "$WATCH_CMD" == "fswatch" ]]; then
    # macOS with fswatch
    fswatch -0 -e ".*" -i "\\.${WATCH_EXTENSIONS}$" "$CONTRACT_DIR" . 2>/dev/null | while read -d "" event; do
        # Debounce: wait for file writes to complete
        sleep 0.5
        build
    done
else
    # Linux with inotifywait
    while true; do
        inotifywait -q -r -e modify,create,delete \
            --include ".*\\.${WATCH_EXTENSIONS}$" \
            "$CONTRACT_DIR" . 2>/dev/null

        # Debounce
        sleep 0.5
        build
    done
fi
