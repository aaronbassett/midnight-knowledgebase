# Compact Language Reference

## Overview

Compact is Midnight's domain-specific language for privacy-preserving smart contracts. It compiles to ZK circuits.

## Basic Structure

```compact
// Imports
import { persistentHash } from "std/compact/hashes";

// Ledger state (on-chain)
ledger {
  field_name: Type;
}

// Entry points
export circuit publicEntry(...): ReturnType { }
export witness privateEntry(...): ReturnType { }
```

## Types

### Primitive Types

| Type | Description | Size |
|------|-------------|------|
| `Field` | Finite field element | ~254 bits |
| `Boolean` | True or false | 1 bit |
| `Bytes<N>` | Fixed-size byte array | N bytes |
| `Address` | Contract/user address | 32 bytes |
| `Void` | No return value | - |

### Composite Types

```compact
// Arrays
const arr: Field[5];

// Maps (in ledger only)
ledger {
  balances: Map<Address, Field>;
}

// Merkle Trees (in ledger only)
ledger {
  members: MerkleTree<32, Bytes<32>>;
  historic: HistoricMerkleTree<32, Bytes<32>>;
}

// Sets (in ledger only)
ledger {
  used: Set<Bytes<32>>;
}
```

## Entry Points

### circuit (Public Entry)

```compact
export circuit functionName(
  param1: Type1,
  param2: Type2
): ReturnType {
  // All inputs are public
  // Generates ZK proof of execution
}
```

### witness (Private Entry)

```compact
export witness functionName(
  private_param: Type  // Private, never revealed
): ReturnType {
  // Parameters are witness inputs
  // Proven via ZK, never published
}
```

## Ledger Operations

### Reading State

```compact
const value = ledger.field_name;
```

### Writing State

```compact
ledger.field_name = new_value;
```

### Map Operations

```compact
// Read
const balance = ledger.balances[address];

// Write
ledger.balances[address] = new_balance;
```

### MerkleTree Operations

```compact
// Insert leaf
ledger.tree.insert(leaf_value);

// Check membership
assert ledger.tree.member(value, merkle_path);

// Historic membership (HistoricMerkleTree only)
assert ledger.tree.historicMember(value, path, old_root);
```

### Set Operations

```compact
// Check membership
const exists = ledger.set.member(value);

// Insert
ledger.set.insert(value);
```

## Control Flow

### Conditionals

```compact
if condition {
  // true branch
} else {
  // false branch
}
```

### Assertions

```compact
assert condition;  // Fails proof if false
assert value == expected;
assert value != forbidden;
```

### Loops

```compact
// Bounded loops only (must know iteration count at compile time)
for i in 0..10 {
  // loop body
}
```

## Arithmetic

```compact
const sum = a + b;
const diff = a - b;
const product = a * b;
const quotient = a / b;  // Integer division

// Comparisons
assert a == b;
assert a != b;
assert a < b;
assert a <= b;
assert a > b;
assert a >= b;
```

## Cryptographic Primitives

### Hashing

```compact
import { persistentHash } from "std/compact/hashes";

const hash = persistentHash(data);
const hash2 = persistentHash(data1, data2);  // Multiple inputs
```

### Commitments

```compact
import { persistentCommit } from "std/compact/commitments";

const commitment = persistentCommit(value, randomness);
```

## Token Operations

### Receiving Tokens

```compact
receive coins: Coin[];
```

### Sending Tokens

```compact
send { value: amount, type: token_type }, to: recipient;
```

### Minting Tokens

```compact
mint { value: amount, domain: separator }, to: recipient;
```

## Variables

### Constants

```compact
const immutable_value = compute_something();
```

### Local Variables

```compact
let mutable_value = initial;
mutable_value = updated;
```

## Functions

### Internal Functions

```compact
function helper(x: Field): Field {
  return x * 2;
}

export circuit main(): Void {
  const result = helper(5);
}
```

## Comments

```compact
// Single line comment

/*
   Multi-line
   comment
*/
```

## Best Practices

### Minimize Comparisons

Comparisons are expensive (bit decomposition):

```compact
// Expensive
if amount > 100 { }

// Cheaper
if amount == 100 { }
```

### Use Assertions for Validation

```compact
// Validate inputs at start
assert amount > 0;
assert recipient != zero_address;
```

### Keep Circuits Small

Smaller circuits = faster proofs:
- Minimize hash operations
- Avoid deep loops
- Consider splitting logic across circuits
