---
name: dapp-check
description: Validate DApp project structure and configuration for Midnight Network development
---

# /dapp-check

Validates your DApp project structure, dependencies, and configuration for Midnight Network development.

## When to Use

- After scaffolding a new project with `create-mn-app`
- Before deploying to testnet
- When troubleshooting configuration issues
- As part of CI/CD pipeline validation

## Checks Performed

### 1. Package Dependencies

Verify required @midnight-ntwrk packages are installed:

```bash
# Check package.json for required dependencies
grep -E "@midnight-ntwrk/(midnight-js-types|compact-runtime|midnight-js-contracts)" package.json
```

Required packages:
- `@midnight-ntwrk/midnight-js-types`
- `@midnight-ntwrk/compact-runtime`
- `@midnight-ntwrk/midnight-js-contracts`

### 2. TypeScript Configuration

Verify strict mode is enabled:

```bash
# Check tsconfig.json for strict mode
grep '"strict":\s*true' tsconfig.json
```

Required settings:
- `"strict": true`
- `"target": "ES2020"` or higher
- `"moduleResolution": "bundler"` or `"node16"`

### 3. Wallet Provider Configuration

Check for proper wallet provider setup:

```bash
# Look for wallet provider configuration
grep -rE "window\.midnight|mnLace|DAppConnector" src/
```

Verify:
- Wallet detection (`window.midnight?.mnLace`)
- Proper error handling for wallet not installed
- Network configuration via `serviceUriConfig()`

### 4. Security: No Hardcoded Secrets

Scan for potential security issues:

```bash
# Check for hardcoded private keys (64-char hex strings)
grep -rE "0x[a-fA-F0-9]{64}" src/ --include="*.ts" --include="*.tsx"

# Check for hardcoded seed phrases
grep -rE '["'"'"'][a-z]+(\s+[a-z]+){11,23}["'"'"']' src/ --include="*.ts" --include="*.tsx"

# Check for exposed environment variables
grep -rE 'PRIVATE_KEY\s*=' src/ --include="*.ts" --include="*.tsx"
```

### 5. Environment Variables

Verify environment variables are properly typed:

```bash
# Check for .env.example or env.d.ts
ls -la .env.example env.d.ts 2>/dev/null
```

Expected files:
- `.env.example` - Template for required variables
- `env.d.ts` or similar - Type declarations for environment

### 6. Contract Compilation

Verify contracts are compiled:

```bash
# Check for compiled contract output
ls -la contract/index.mjs contract/keys/ 2>/dev/null
```

Required outputs:
- `contract/index.mjs` - ES module
- `contract/index.d.ts` - Type declarations
- `contract/keys/` - Proving/verification keys

## Output Format

```
/dapp-check Results
====================

[PASS] Package dependencies: All required @midnight-ntwrk packages found
[PASS] TypeScript config: Strict mode enabled
[PASS] Wallet provider: Configuration detected in src/providers/
[FAIL] Security check: Potential hardcoded key in src/utils/test.ts:42
[WARN] Environment: Missing .env.example file
[PASS] Contract compilation: contract/index.mjs found

Summary: 4 passed, 1 failed, 1 warning
```

## Exit Codes

- `0` - All checks passed
- `1` - One or more checks failed
- `2` - Warnings present but no failures

## Related

- `/dapp-debug` - Interactive debugging for specific issues
- `wallet-integration` skill - Wallet connection patterns
- `error-handling` skill - Error categorization
