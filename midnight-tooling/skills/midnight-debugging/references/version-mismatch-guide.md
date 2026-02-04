# Version Mismatch Resolution Guide

Detailed guidance for resolving Midnight component version mismatches.

## Understanding Version Dependencies

Midnight consists of multiple components that must be version-compatible:

```
┌─────────────────────────────────────────────────────────┐
│                    Your dApp Code                        │
├─────────────────────────────────────────────────────────┤
│  @midnight-ntwrk/midnight.js                            │
│  @midnight-ntwrk/wallet-api                             │
├─────────────────────────────────────────────────────────┤
│  @midnight-ntwrk/compact-runtime  │  @midnight-ntwrk/ledger │
├───────────────────────────────────┼─────────────────────┤
│         Compiled Contract         │    Proof Server      │
│      (from Compact compiler)      │   (Docker image)     │
└───────────────────────────────────┴─────────────────────┘
```

All these layers must use compatible versions.

## Checking Current Versions

### Local Environment

```bash
# Developer tools version
compact --version

# Compiler version
compact compile --version

# Installed compiler versions
compact list --installed

# npm packages
npm list | grep @midnight-ntwrk

# Specific package
npm list @midnight-ntwrk/compact-runtime

# Proof server (if running)
docker ps --format "{{.Image}}" | grep proof-server
```

### Project Dependencies

Check `package.json`:
```json
{
  "dependencies": {
    "@midnight-ntwrk/compact-runtime": "0.9.0",
    "@midnight-ntwrk/ledger": "4.0.0",
    "@midnight-ntwrk/midnight.js": "2.1.0"
  }
}
```

**Critical**: Avoid version ranges (`^`, `~`). Use exact versions.

## Version Compatibility Matrix

Check the current compatibility matrix by running:
```bash
/midnight:versions
```

Or view the cached support matrix:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/parse-support-matrix.py
```

## Common Mismatch Scenarios

### Scenario 1: Updated Compiler, Old Runtime

**Symptoms**:
- Compilation succeeds
- Runtime errors when deploying/executing
- "Version mismatch" errors

**Diagnosis**:
```bash
compact compile --version  # e.g., 0.26.0
npm list @midnight-ntwrk/compact-runtime  # e.g., 0.8.0 (OLD!)
```

**Fix**:
```bash
# Update runtime to match
npm install @midnight-ntwrk/compact-runtime@0.9.0

# Recompile contracts
compact compile src/contract.compact contract/
```

### Scenario 2: Updated Runtime, Old Compiler

**Symptoms**:
- npm install succeeds
- Compilation fails or produces incompatible artifacts

**Diagnosis**:
```bash
npm list @midnight-ntwrk/compact-runtime  # e.g., 0.9.0
compact compile --version  # e.g., 0.24.0 (OLD!)
```

**Fix**:
```bash
# Update compiler
compact update  # or specific version: compact update 0.26.0

# Recompile contracts
compact compile src/contract.compact contract/
```

### Scenario 3: Mixed Versions in Monorepo

**Symptoms**:
- Different packages have different Midnight versions
- Inconsistent behavior across packages

**Diagnosis**:
```bash
# Check all packages
find . -name "package.json" -exec grep -l "@midnight-ntwrk" {} \; | \
  xargs -I {} sh -c 'echo "=== {} ===" && cat {} | grep -A1 "@midnight-ntwrk"'
```

**Fix**:
1. Standardize versions across all package.json files
2. Use workspace features (npm/yarn/pnpm workspaces) to enforce consistent versions
3. Consider a shared config or constraints file

### Scenario 4: Proof Server Version Mismatch

**Symptoms**:
- Proof generation fails
- "Invalid proof" errors
- Network rejection of transactions

**Diagnosis**:
```bash
# Check proof server version
docker images midnightnetwork/proof-server --format "{{.Tag}}"

# Check contract's expected version
# (in compiled output or error message)
```

**Fix**:
```bash
# Pull matching proof server version
docker pull midnightnetwork/proof-server:<version>

# Restart with correct image
docker run -p 6300:6300 midnightnetwork/proof-server:<version> -- midnight-proof-server --network testnet
```

## Version Update Checklist

When updating any Midnight component:

- [ ] Check compatibility matrix for required versions of all components
- [ ] Update `package.json` with exact versions (no `^` or `~`)
- [ ] Update Compact compiler if needed: `compact update <version>`
- [ ] Pull matching proof server image: `docker pull midnightnetwork/proof-server:<tag>`
- [ ] Delete compiled contract artifacts:
  ```bash
  rm -rf contract/*.cjs contract/*.prover contract/*.verifier contract/*.d.cts
  ```
- [ ] Clean install dependencies:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```
- [ ] Recompile all contracts:
  ```bash
  compact compile src/contract.compact contract/
  ```
- [ ] Run tests to verify compatibility
- [ ] Update pragma in contract files if language version changed

## Pragma Version Management

### Checking Pragma

In your `.compact` files:
```compact
pragma language_version 0.18;
```

This must match the compiler's language version.

### Finding Compiler's Language Version

```bash
# The compiler version (e.g., 0.26.0) maps to a language version (e.g., 0.18.0)
# Check release notes for mapping
/midnight:changelog compact 0.26
```

### Updating Pragma

When upgrading compiler:
1. Check release notes for new language version
2. Update all `.compact` files
3. Review breaking changes in release notes
4. Update code for any deprecated/changed features

## Lockfile Best Practices

### Why Use Lockfiles

Lockfiles ensure reproducible installs:
- `package-lock.json` (npm)
- `bun.lock` (Bun)
- `yarn.lock` (Yarn)

### Commands

```bash
# npm: Use ci for exact lockfile versions
npm ci  # NOT npm install

# Bun: Install from lockfile
bun install --frozen-lockfile

# Regenerate lockfile after version changes
rm package-lock.json && npm install
```

### Commit Lockfiles

Always commit lockfiles to version control to ensure team consistency.

## Debugging Version Issues

### Enable Verbose Logging

```bash
# npm
npm install --verbose

# Compact
compact compile --verbose src/contract.compact contract/
```

### Check Actual Loaded Versions

In your code, log the versions:
```typescript
import { version } from '@midnight-ntwrk/compact-runtime';
console.log('Runtime version:', version);
```

### Compare with Working Reference

If a colleague's setup works:
1. Compare `compact --version` and `compact compile --version`
2. Compare `npm list | grep @midnight-ntwrk`
3. Compare `docker images | grep midnight`
4. Diff the `package.json` and lockfiles
