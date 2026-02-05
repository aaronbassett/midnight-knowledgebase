---
name: private-key-check
description: Detects hardcoded private keys, seed phrases, and secrets before file writes
hooks:
  - event: PreToolUse
    matcher:
      tool: Write
    action: warn
---

# Private Key Detection Hook

Warns before writing files that contain potential security vulnerabilities like hardcoded private keys, seed phrases, or API secrets.

## Purpose

Prevent accidental exposure of sensitive cryptographic material in source code. This hook scans file content before writes and warns about potential security issues.

## Detection Patterns

### 1. Hexadecimal Private Keys

Pattern: `0x[a-fA-F0-9]{64}`

Matches 64-character hexadecimal strings prefixed with `0x`, commonly used for private keys.

**Examples detected:**
```typescript
// These will trigger warnings:
const privateKey = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const key = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
```

**False positive mitigation:**
- Transaction hashes (also 64 chars) may trigger - but warning is appropriate for review
- Contract addresses in Midnight use different formats

### 2. Seed Phrases (BIP-39)

Pattern: `["'][a-z]+(\s+[a-z]+){11,23}["']`

Matches quoted strings containing 12-24 lowercase words separated by spaces.

**Examples detected:**
```typescript
// These will trigger warnings:
const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const seedPhrase = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
```

### 3. Hardcoded Environment Variable Assignments

Pattern: `PRIVATE_KEY\s*=\s*["'][^"']+["']`

Matches direct assignment of values to PRIVATE_KEY variable.

**Examples detected:**
```typescript
// These will trigger warnings:
const PRIVATE_KEY = "some-secret-value";
process.env.PRIVATE_KEY = "hardcoded-value";
```

### 4. API Keys and Secrets

Pattern: `(API_KEY|SECRET|TOKEN)\s*[:=]\s*["'][a-zA-Z0-9_-]{20,}["']`

Matches common secret variable names with substantial values.

**Examples detected:**
```typescript
// These will trigger warnings:
const API_KEY = "sk_live_abc123def456ghi789jkl012mno345";
const AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

## Behavior

When a potential secret is detected:

1. **Warning message** is displayed (does not block the write)
2. User is informed of the line number and matched pattern
3. User can proceed if it's a false positive or test data

### Warning Format

```
⚠️ Security Warning: Potential secret detected

File: src/utils/config.ts
Line 42: Possible hardcoded private key (64-char hex string)

Pattern matched: 0x[a-fA-F0-9]{64}
Content: const key = "0x1234..."

This appears to be a private key. Consider:
1. Using environment variables instead
2. Loading from a secure secrets manager
3. Using .env files (not committed to git)

Proceed with write? [y/N]
```

## Safe Alternatives

### Use Environment Variables

```typescript
// Instead of:
const privateKey = "0x1234...";

// Use:
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY environment variable required");
}
```

### Use .env Files (gitignored)

```bash
# .env (never commit this file)
PRIVATE_KEY=0x1234567890abcdef...

# .env.example (commit this as template)
PRIVATE_KEY=
```

```typescript
// Load with dotenv
import 'dotenv/config';
const privateKey = process.env.PRIVATE_KEY!;
```

### Type-Safe Environment

```typescript
// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    PRIVATE_KEY: string;
    INDEXER_URI: string;
    PROVER_URI: string;
  }
}
```

## Files Excluded

The hook does not scan:
- `.env` files (expected to contain secrets)
- `.env.example` files (should contain empty templates)
- Test fixture files in `__fixtures__/` or `fixtures/`
- Files in `node_modules/`

## Configuration

The hook is enabled by default. To disable for specific files or patterns, add exclusions:

```yaml
# In .claude-plugin/hooks.yaml (if customizable)
private-key-check:
  exclude:
    - "**/__fixtures__/**"
    - "**/test-data/**"
    - "**/*.test.ts"
```

## Related

- `error-handling` skill - Proper secrets management patterns
- `/dapp-check` command - Scans existing codebase for secrets
- `.gitignore` - Ensure .env files are never committed
