# Cryptographic Functions

Complete reference for cryptographic operations in `CompactStandardLibrary`.

## Overview

| Function | Safe? | Persistence | Output |
|----------|-------|-------------|--------|
| `persistentCommit(value)` | Yes | Cross-transaction | `Bytes<32>` |
| `transientCommit(value)` | Yes | Transaction-local | `Bytes<32>` |
| `persistentHash(domain, value)` | No | Cross-transaction | `Bytes<32>` |
| `transientHash(domain, value)` | No | Transaction-local | `Bytes<32>` |
| `ecAdd(p1, p2)` | - | - | Point |
| `ecMul(scalar, point)` | - | - | Point |

## Safe vs Unsafe Operations

### Safe: Commit Functions

Commit functions include a **random nonce** that hides the input value:

```compact
commitment = Hash(value || nonce)
```

Even if an attacker knows the commitment, they cannot determine the original value without the nonce.

### Unsafe: Hash Functions

Hash functions do **not** include a nonce:

```compact
hash = Hash(domain || value)
```

If the input has low entropy (e.g., a small number or a value from a limited set), an attacker can brute-force the hash by trying all possible inputs.

**When to use hashes**: Nullifiers, deterministic identifiers, domain separation where hiding is not required.

---

## Commit Functions

### persistentCommit

Creates a hiding commitment that remains stable across transactions.

```compact
import { persistentCommit } from "CompactStandardLibrary";

circuit create_commitment(value: Field): Bytes<32> {
    return persistentCommit(value);
}
```

**Signature**: `persistentCommit<T>(value: T): Bytes<32>`

**Use cases**:
- Commit-reveal schemes
- Hiding private data on-chain
- Cross-transaction commitments (e.g., store now, verify later)

**Example: Commit-Reveal**

```compact
import { persistentCommit, Maybe } from "CompactStandardLibrary";

ledger commitments: Map<Bytes<32>, Bytes<32>>;

witness get_user(): Bytes<32>;
witness get_secret(): Field;

// Phase 1: Commit
export circuit commit(): Bytes<32> {
    const user = disclose(get_user());
    const secret = get_secret();

    const commitment = persistentCommit(secret);
    commitments.insert(user, commitment);

    return commitment;
}

// Phase 2: Reveal
export circuit reveal(): Field {
    const user = disclose(get_user());
    const secret = get_secret();

    // Verify commitment matches
    const stored = commitments.lookup(user);
    assert stored is Maybe::Some(_), "No commitment";

    if stored is Maybe::Some(c) {
        assert c == persistentCommit(secret), "Mismatch";
    }

    return disclose(secret);
}
```

### transientCommit

Creates a hiding commitment that is only valid within the current transaction.

```compact
import { transientCommit } from "CompactStandardLibrary";

circuit local_commitment(value: Field): Bytes<32> {
    return transientCommit(value);
}
```

**Signature**: `transientCommit<T>(value: T): Bytes<32>`

**Use cases**:
- Intra-transaction verification
- Temporary commitments not stored on-chain
- Lower cost when cross-transaction stability is not needed

**Persistent vs Transient**:

| Aspect | persistentCommit | transientCommit |
|--------|-----------------|-----------------|
| Stability | Same input = same output (across transactions) | Same input = same output (within transaction only) |
| Cost | Higher | Lower |
| Use case | Store on ledger | Verify within transaction |

---

## Hash Functions

### persistentHash

Creates a deterministic, domain-separated hash stable across transactions.

```compact
import { persistentHash } from "CompactStandardLibrary";

circuit create_nullifier(secret: Field): Bytes<32> {
    return persistentHash("nullifier", secret);
}
```

**Signature**: `persistentHash(domain: String, value: T): Bytes<32>`

**Parameters**:
- `domain`: A string literal for domain separation (prevents cross-protocol attacks)
- `value`: The value to hash

**Use cases**:
- Nullifiers (deterministic, one-time-use identifiers)
- Deterministic IDs
- Domain-separated hashing

**Example: Nullifier Pattern**

```compact
import { persistentHash, persistentCommit } from "CompactStandardLibrary";

ledger commitments: Set<Bytes<32>>;
ledger nullifiers: Set<Bytes<32>>;

witness get_secret(): Field;

export circuit deposit(): Bytes<32> {
    const secret = get_secret();
    const commitment = persistentCommit(secret);

    commitments.insert(commitment);
    return commitment;
}

export circuit withdraw(): [] {
    const secret = get_secret();

    // Verify commitment exists
    const commitment = persistentCommit(secret);
    assert commitments.member(commitment), "Invalid commitment";

    // Generate and check nullifier
    const nullifier = persistentHash("withdraw-nullifier", secret);
    assert !nullifiers.member(nullifier), "Already withdrawn";

    nullifiers.insert(nullifier);

    // Perform withdrawal...
}
```

### transientHash

Creates a deterministic, domain-separated hash valid only within the current transaction.

```compact
import { transientHash } from "CompactStandardLibrary";

circuit temp_id(value: Field): Bytes<32> {
    return transientHash("temp-id", value);
}
```

**Signature**: `transientHash(domain: String, value: T): Bytes<32>`

**Use cases**:
- Temporary identifiers within a transaction
- Intra-transaction verification
- Lower cost when cross-transaction stability is not needed

---

## Elliptic Curve Operations

### ecAdd

Adds two elliptic curve points.

```compact
import { ecAdd } from "CompactStandardLibrary";

circuit add_points(p1: Point, p2: Point): Point {
    return ecAdd(p1, p2);
}
```

**Signature**: `ecAdd(p1: Point, p2: Point): Point`

**Use cases**:
- Public key derivation
- Signature verification
- Cryptographic protocols

### ecMul

Multiplies a point by a scalar (scalar multiplication).

```compact
import { ecMul } from "CompactStandardLibrary";

circuit derive_key(private_key: Field, generator: Point): Point {
    return ecMul(private_key, generator);
}
```

**Signature**: `ecMul(scalar: Field, point: Point): Point`

**Use cases**:
- Key derivation (public_key = private_key * G)
- Diffie-Hellman key exchange
- Pedersen commitments

**Example: Key Derivation**

```compact
import { ecMul } from "CompactStandardLibrary";

// Generator point (curve-specific constant)
const G: Point = ...;

witness get_private_key(): Field;

export circuit get_public_key(): Point {
    const sk = get_private_key();
    return ecMul(sk, G);
}
```

---

## Security Guidelines

### When to Use Commits vs Hashes

| Scenario | Use |
|----------|-----|
| Hide a value on-chain | `persistentCommit` |
| Reveal later (commit-reveal) | `persistentCommit` |
| Deterministic identifier | `persistentHash` |
| Nullifier | `persistentHash` |
| Temporary verification | `transientCommit` or `transientHash` |

### Domain Separation Best Practices

Always use descriptive, unique domain strings:

```compact
// Good: Specific domains
persistentHash("voting-nullifier", secret)
persistentHash("auction-bid-id", data)
persistentHash("membership-proof", member)

// Bad: Generic or missing domains
persistentHash("hash", data)
persistentHash("", value)
```

### Low-Entropy Inputs

Never hash low-entropy values without additional salt:

```compact
// DANGEROUS: Vote choice has only a few possible values
const hash = persistentHash("vote", vote_choice);  // Can be brute-forced!

// SAFE: Include user-specific secret
const hash = persistentHash("vote", (user_secret, vote_choice));
```
