#!/usr/bin/env bash
# validation.sh - Validation wrappers for claude CLI

# Source dependencies
_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_LIB_DIR/colors.sh"
source "$_LIB_DIR/json.sh"

# Validate a plugin using claude CLI
# Usage: validate_plugin path [quiet]
# Returns: 0 if valid, 1 if invalid
validate_plugin() {
    local path="$1"
    local quiet="${2:-false}"

    if [[ ! -d "$path" ]]; then
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_error "Plugin path does not exist: $path"
        return 1
    fi

    # Run validation and capture output
    local output
    if output=$(claude plugin validate "$path" 2>&1); then
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_success "Plugin validated: $path"
        return 0
    else
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_error "Plugin validation failed: $path"
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && echo "$output" >&2
        return 1
    fi
}

# Validate a marketplace.json file using claude CLI
# Usage: validate_marketplace path [quiet]
# Returns: 0 if valid, 1 if invalid
validate_marketplace() {
    local path="$1"
    local quiet="${2:-false}"

    if [[ ! -f "$path" ]]; then
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_error "Marketplace file does not exist: $path"
        return 1
    fi

    # For marketplace validation, we need to validate the root directory
    # If the path contains .claude-plugin/marketplace.json, go up to the parent
    local marketplace_dir
    marketplace_dir=$(dirname "$path")
    if [[ "$(basename "$marketplace_dir")" == ".claude-plugin" ]]; then
        marketplace_dir=$(dirname "$marketplace_dir")
    fi

    # Run validation and capture output
    local output
    if output=$(claude plugin validate "$marketplace_dir" 2>&1); then
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_success "Marketplace validated: $path"
        return 0
    else
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_error "Marketplace validation failed: $path"
        [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && echo "$output" >&2
        return 1
    fi
}

# Check that all plugins in directory are listed in marketplace
# Usage: check_all_plugins_listed marketplace_json plugins_dir [quiet]
# Returns: 0 if all listed, 1 if discrepancies found
check_all_plugins_listed() {
    local marketplace_json="$1"
    local plugins_dir="$2"
    local quiet="${3:-false}"

    if [[ ! -f "$marketplace_json" ]]; then
        [[ "$quiet" != "true" ]] && print_error "Marketplace file not found: $marketplace_json"
        return 1
    fi

    if [[ ! -d "$plugins_dir" ]]; then
        [[ "$quiet" != "true" ]] && print_error "Plugins directory not found: $plugins_dir"
        return 1
    fi

    # Get list of plugin directories
    local fs_plugins=()
    while IFS= read -r -d '' dir; do
        local name
        name=$(basename "$dir")
        fs_plugins+=("$name")
    done < <(find "$plugins_dir" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)

    # Get list of plugins in marketplace.json
    local mp_plugins=()
    if command -v jq >/dev/null 2>&1; then
        while IFS= read -r name; do
            [[ -n "$name" ]] && mp_plugins+=("$name")
        done < <(jq -r '.plugins[]? | .name // empty' "$marketplace_json" 2>/dev/null | sort)
    else
        [[ "$quiet" != "true" ]] && print_error "jq is required but not installed"
        return 1
    fi

    # Check for discrepancies
    local has_issues=false

    # Check for plugins in filesystem but not in marketplace
    for fs_plugin in "${fs_plugins[@]}"; do
        local found=false
        for mp_plugin in "${mp_plugins[@]}"; do
            if [[ "$fs_plugin" == "$mp_plugin" ]]; then
                found=true
                break
            fi
        done

        if [[ "$found" == "false" ]]; then
            [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_warning "Plugin in filesystem but not in marketplace: $fs_plugin"
            has_issues=true
        fi
    done

    # Check for plugins in marketplace but not in filesystem
    for mp_plugin in "${mp_plugins[@]}"; do
        local found=false
        for fs_plugin in "${fs_plugins[@]}"; do
            if [[ "$mp_plugin" == "$fs_plugin" ]]; then
                found=true
                break
            fi
        done

        if [[ "$found" == "false" ]]; then
            [[ "$quiet" != "true" ]] && [[ "$JSON_MODE" != "true" ]] && print_error "Plugin in marketplace but not in filesystem: $mp_plugin"
            has_issues=true
        fi
    done

    if [[ "$has_issues" == "true" ]]; then
        return 1
    fi

    return 0
}
