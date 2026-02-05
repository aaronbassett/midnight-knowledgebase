---
name: compact-lint
description: Validate Compact code patterns and suggest improvements
allowed-tools: Read, Glob, Grep
argument-hint: "[file_path]"
---

# /compact-lint

Analyze Compact smart contract code for common issues, anti-patterns, and potential improvements.

## Usage

```
/compact-lint [file_path]
/compact-lint              # Analyzes current file or selection
```

## Analysis Checks

### Privacy & Disclosure

- [ ] Witness values used without `disclose()` where required
- [ ] Missing `transientCommit`/`persistentCommit` for hidden values
- [ ] Unsafe hash functions used instead of commit functions
- [ ] Potential information leaks through comparisons

### Type Safety

- [ ] Uint bounds that exceed Field maximum
- [ ] Type parameter mismatches in generics
- [ ] Missing struct field initializers
- [ ] Incorrect Vector size parameters

### Control Flow

- [ ] For loops with non-constant bounds
- [ ] Missing assertion conditions
- [ ] Unreachable code after return

### Ledger State

- [ ] ADT operations without proper checks (isFull, isEmpty)
- [ ] Map/Set lookups without existence verification
- [ ] Counter overflow scenarios

### Circuit Design

- [ ] Overly complex circuits (consider splitting)
- [ ] Witness functions without TypeScript implementation note
- [ ] Missing export on public circuits

## Output Format

```
[SEVERITY] file:line - Description
  Suggestion: How to fix

SEVERITY levels:
  ERROR   - Will cause compilation or runtime failure
  WARNING - Potential bug or security issue
  INFO    - Style suggestion or best practice
```

## Examples

### Good Pattern
```compact
// Properly disclosed witness value
witness get_secret(): Field;

export circuit verify_secret(commitment: Field): Boolean {
    const secret = get_secret();
    const computed = persistentCommit(secret);
    return commitment == computed;
}
```

### Anti-Pattern Detected
```compact
// WARNING: Witness value used in comparison without disclosure
witness get_private_value(): Uint<64>;

export circuit check_threshold(threshold: Uint<64>): Boolean {
    const value = get_private_value();
    return value > threshold;  // ⚠️ Requires disclose(value)
}
```

## Limitations

- Static analysis only; does not execute code
- Cannot detect all security issues
- May produce false positives for advanced patterns
- Requires context to understand intent

For comprehensive validation, also run `compactc` with appropriate flags.
