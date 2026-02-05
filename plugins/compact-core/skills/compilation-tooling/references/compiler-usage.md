# Compiler Usage

Complete reference for the Compact compiler (`compactc`) command-line interface.

## Basic Usage

```bash
compactc <input-file> [options]
```

### Simple Examples

```bash
# Compile a single contract
compactc contract.compact -o build/

# Compile with include path
compactc main.compact -o build/ -I ./lib

# Development build (fast, no ZK)
compactc contract.compact -o build/ --skip-zk
```

## Command-Line Options

### Output Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <dir>` | Output directory for compiled artifacts | `./output` |
| `--no-typescript` | Skip TypeScript type generation | Generate TS |
| `--json` | Output compiler messages as JSON | Human-readable |

```bash
# Specify output directory
compactc contract.compact -o ./build

# Skip TypeScript generation (ZK artifacts only)
compactc contract.compact -o ./build --no-typescript

# JSON output for CI/CD integration
compactc contract.compact -o ./build --json
```

### Development Options

| Option | Description | Use Case |
|--------|-------------|----------|
| `--skip-zk` | Skip ZK key generation | Fast iteration |
| `--vscode` | Generate VS Code configuration | IDE support |
| `--verbose` | Verbose compiler output | Debugging |
| `--dry-run` | Validate without generating output | CI checks |

```bash
# Fast development build
compactc contract.compact -o build/ --skip-zk

# Generate VS Code language server support
compactc contract.compact -o build/ --vscode

# Verbose output for debugging
compactc contract.compact -o build/ --verbose

# Validate contract syntax only
compactc contract.compact --dry-run
```

### Include Path Options

| Option | Description |
|--------|-------------|
| `-I, --include <path>` | Add directory to include search path |
| Multiple `-I` flags | Searched in order specified |

```bash
# Single include path
compactc main.compact -o build/ -I ./lib

# Multiple include paths
compactc main.compact -o build/ -I ./lib -I ./vendor -I ../shared

# Combined with COMPACT_PATH
COMPACT_PATH=/global/libs compactc main.compact -o build/ -I ./local
```

### Optimization Options

| Option | Description |
|--------|-------------|
| `--optimize` | Enable circuit optimizations |
| `--optimize-level <n>` | Optimization level (0-3) |

```bash
# Enable optimizations
compactc contract.compact -o build/ --optimize

# Maximum optimization (longer compile, smaller circuits)
compactc contract.compact -o build/ --optimize-level 3

# No optimization (faster compile, debugging)
compactc contract.compact -o build/ --optimize-level 0
```

### Network Options

| Option | Description |
|--------|-------------|
| `--network <name>` | Target network configuration |

```bash
# Target testnet
compactc contract.compact -o build/ --network testnet

# Target mainnet
compactc contract.compact -o build/ --network mainnet
```

## Environment Variables

### COMPACT_PATH

Search path for `include` and `import` statements.

```bash
# Unix/macOS (colon-separated)
export COMPACT_PATH="/home/user/libs:/home/user/project/src"

# Windows (semicolon-separated)
set COMPACT_PATH=C:\libs;C:\project\src
```

**Resolution Order:**
1. Current directory (for relative paths like `./file.compact`)
2. Directories specified with `-I` flag (in order)
3. Directories in `COMPACT_PATH` (in order)
4. Standard library location

```bash
# Example resolution
# File: include "utils.compact"
# COMPACT_PATH="/libs:/project"
# -I ./local

# Search order:
# 1. ./utils.compact
# 2. ./local/utils.compact
# 3. /libs/utils.compact
# 4. /project/utils.compact
```

### MIDNIGHT_NETWORK

Default target network when `--network` is not specified.

```bash
export MIDNIGHT_NETWORK="testnet"
compactc contract.compact -o build/  # Uses testnet
```

### COMPACT_CACHE_DIR

Directory for compiler cache files.

```bash
export COMPACT_CACHE_DIR="/tmp/compact-cache"
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Compilation error (syntax, type error) |
| 2 | I/O error (file not found, permission denied) |
| 3 | Configuration error (invalid options) |

```bash
# Check exit code in scripts
compactc contract.compact -o build/
if [ $? -eq 0 ]; then
    echo "Compilation successful"
else
    echo "Compilation failed"
fi
```

## JSON Output Format

With `--json`, compiler outputs structured messages:

```json
{
  "success": false,
  "errors": [
    {
      "type": "error",
      "code": "E0001",
      "message": "potential witness-value disclosure",
      "location": {
        "file": "contract.compact",
        "line": 42,
        "column": 12
      },
      "suggestion": "Add disclose() to explicitly reveal this value"
    }
  ],
  "warnings": [],
  "artifacts": []
}
```

Successful compilation:

```json
{
  "success": true,
  "errors": [],
  "warnings": [],
  "artifacts": [
    {
      "type": "zkir",
      "path": "build/zkir/transfer.zkir"
    },
    {
      "type": "prover_key",
      "path": "build/keys/prover/transfer.pk"
    },
    {
      "type": "verifier_key",
      "path": "build/keys/verifier/transfer.vk"
    },
    {
      "type": "typescript",
      "path": "build/contract.ts"
    }
  ]
}
```

## Common Workflows

### Development Workflow

```bash
#!/bin/bash
# Fast iteration during development

# Set up environment
export COMPACT_PATH="./lib:./vendor"

# Quick compile (no ZK, verbose)
compactc contracts/main.compact \
    -o build/ \
    --skip-zk \
    --verbose \
    --vscode

# Run TypeScript tests
npm test
```

### Production Build

```bash
#!/bin/bash
# Full production build

# Clean previous build
rm -rf build/

# Full compilation with optimizations
compactc contracts/main.compact \
    -o build/ \
    --optimize-level 2 \
    --network mainnet

# Verify build
ls -la build/zkir/
ls -la build/keys/
```

### CI/CD Integration

```bash
#!/bin/bash
# CI validation script

set -e  # Exit on error

# Validate syntax
compactc contracts/main.compact --dry-run --json > compile-result.json

# Check for errors
if jq -e '.success == false' compile-result.json > /dev/null; then
    echo "Compilation failed"
    jq '.errors' compile-result.json
    exit 1
fi

# Full build
compactc contracts/main.compact -o build/ --json

echo "Build successful"
```

## Troubleshooting

### Common Errors

**File not found:**
```
Error: Cannot find module 'utils.compact'
```
Solution: Check `COMPACT_PATH` and `-I` flags.

**Permission denied:**
```
Error: Cannot write to output directory 'build/'
```
Solution: Check directory permissions.

**Out of memory:**
```
Error: JavaScript heap out of memory
```
Solution: Increase Node.js memory limit:
```bash
NODE_OPTIONS="--max-old-space-size=8192" compactc contract.compact -o build/
```

### Verbose Debugging

```bash
# Maximum verbosity
compactc contract.compact -o build/ --verbose 2>&1 | tee compile.log

# Analyze compilation phases
grep "Phase:" compile.log
```

## Version Information

```bash
# Show compiler version
compactc --version

# Show help
compactc --help
```
