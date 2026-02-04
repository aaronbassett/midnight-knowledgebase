# Pragma Language Version Guide

Complete guide to using pragma declarations in Compact contracts.

## What is Pragma?

The pragma declaration specifies which version of the Compact/Minokawa language your contract is written for:

```compact
pragma language_version 0.18;
```

This must be the first non-comment line in every `.compact` file.

## Why Pragma Matters

### 1. Compiler Compatibility

The compiler checks if it supports the declared language version:
- **Supported**: Compilation proceeds
- **Unsupported**: Compilation fails with clear error

### 2. Language Features

Different language versions have different features:
- New keywords may be reserved
- New syntax may be available
- Some features may be deprecated

### 3. Reproducibility

Explicit pragma ensures contracts compile consistently across different environments.

## Syntax

```compact
pragma language_version MAJOR.MINOR;
```

Examples:
```compact
pragma language_version 0.18;
pragma language_version 0.17;
```

**Note**: No patch version (just MAJOR.MINOR).

## Finding Your Language Version

### From Compiler

The compiler version maps to a language version. Check release notes:

```bash
/midnight:changelog compact
```

Or check the compiler output:
```bash
compact compile --version
# Then look up in release notes which language version it uses
```

### Recent Mappings

| Compiler Version | Language Version | Codename |
|-----------------|------------------|----------|
| 0.26.0 | 0.18 | Minokawa |
| 0.25.0 | 0.17 | Compact |
| 0.24.0 | 0.16 | Compact |

## Upgrading Pragma

When upgrading your compiler, you may need to update pragma:

### Step 1: Check New Language Version

```bash
/midnight:changelog compact <new-version>
```

### Step 2: Review Breaking Changes

Look for:
- New reserved keywords
- Changed syntax
- Deprecated features
- New type rules

### Step 3: Update Contract Files

```compact
// Before
pragma language_version 0.17;

// After
pragma language_version 0.18;
```

### Step 4: Fix Breaking Changes

Common changes between versions:

**0.17 → 0.18 (Minokawa)**:
- `slice` is now a reserved keyword
- Runtime function renames: `convert_bigint_to_Uint8Array` → `convertFieldToBytes`
- New type casts available

## Multi-Contract Projects

### Consistency Rule

All `.compact` files in a project should use the same pragma:

```
contracts/
├── token.compact       // pragma language_version 0.18;
├── auction.compact     // pragma language_version 0.18;
└── governance.compact  // pragma language_version 0.18;
```

Mixing versions can cause:
- Import incompatibilities
- Type mismatches
- Unexpected behavior

### Checking Consistency

```bash
grep -r "pragma language_version" contracts/
```

## Using Multiple Compiler Versions

Sometimes you need to maintain contracts with different pragmas:

### Per-Compilation Override

```bash
# Compile old contract with old compiler
compact compile +0.25.0 contracts/legacy.compact build/legacy/

# Compile new contract with new compiler
compact compile contracts/new.compact build/new/
```

### Separate Output Directories

Keep artifacts separate:
```
build/
├── legacy/    # From 0.25.0 compiler
└── current/   # From 0.26.0 compiler
```

## Common Pragma Errors

### Error: Unsupported language version

```
Error: pragma language_version 0.18 is not supported by this compiler
```

**Fix**: Update compiler or change pragma:
```bash
compact update  # Get latest compiler
# Or
# Change pragma to match your compiler's supported version
```

### Error: Missing pragma

```
Error: No pragma language_version found
```

**Fix**: Add pragma as first line:
```compact
pragma language_version 0.18;

// rest of contract...
```

### Error: Invalid pragma syntax

```
Error: Invalid pragma syntax
```

**Fix**: Check format:
```compact
// Wrong
pragma language 0.18;
pragma language_version = 0.18;
pragma language_version "0.18";

// Correct
pragma language_version 0.18;
```

## Best Practices

1. **Always include pragma** - Even if optional in some versions
2. **Keep pragma current** - Update when upgrading compiler
3. **Document version requirements** - In README note required compiler version
4. **Test after pragma changes** - Breaking changes may be subtle
5. **Version lock in CI** - Ensure CI uses same compiler version

## Example Contract with Pragma

```compact
pragma language_version 0.18;

// Types
struct Token {
  owner: Bytes<32>,
  balance: Uint<64>
}

// Ledger state
ledger {
  tokens: Map<Bytes<32>, Token>
}

// Witness (private inputs)
witness {
  secret_key: Bytes<32>
}

// Circuit
export circuit transfer(
  to: Bytes<32>,
  amount: Uint<64>
): [] {
  // Implementation
}
```
