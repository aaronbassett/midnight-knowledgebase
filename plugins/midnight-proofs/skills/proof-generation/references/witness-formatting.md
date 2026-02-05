# Witness Formatting

Witness data provides the inputs to a ZK circuit during proof generation. Correct formatting is essential for successful proofs.

## Understanding Witnesses

A witness contains all inputs needed to execute a Compact circuit:

- **Public inputs** - Values visible on-chain after transaction
- **Private inputs** - Secret values hidden by zero-knowledge proof

```typescript
interface WitnessData {
  publicInputs: Record<string, unknown>;
  privateInputs: Record<string, unknown>;
}
```

## Compact to TypeScript Type Mapping

When formatting witness data, match Compact types to their TypeScript equivalents exactly.

### Numeric Types

| Compact Type | TypeScript | Notes |
|--------------|------------|-------|
| `Uint<8>` | `bigint` | 0 to 255 |
| `Uint<32>` | `bigint` | 0 to 4,294,967,295 |
| `Uint<64>` | `bigint` | 0 to 18,446,744,073,709,551,615 |
| `Uint<256>` | `bigint` | Common for cryptographic values |
| `Int<N>` | `bigint` | Signed integers |

```typescript
// Compact: Uint<64>
const amount: bigint = 1000n;

// Compact: Int<32>
const delta: bigint = -50n;
```

### Boolean and Bytes

| Compact Type | TypeScript | Notes |
|--------------|------------|-------|
| `Boolean` | `boolean` | `true` or `false` |
| `Bytes<N>` | `Uint8Array` | Fixed-length byte array |
| `Bytes` | `Uint8Array` | Variable-length bytes |

```typescript
// Compact: Boolean
const isActive: boolean = true;

// Compact: Bytes<32>
const hash: Uint8Array = new Uint8Array(32);

// From hex string
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
```

### Collections

| Compact Type | TypeScript | Notes |
|--------------|------------|-------|
| `Vector<T>` | `T[]` | Ordered list |
| `Set<T>` | `Set<T>` | Unique values |
| `Map<K, V>` | `Map<K, V>` | Key-value pairs |

```typescript
// Compact: Vector<Uint<64>>
const amounts: bigint[] = [100n, 200n, 300n];

// Compact: Map<Bytes<32>, Uint<64>>
const balances: Map<Uint8Array, bigint> = new Map([
  [addressBytes, 1000n],
]);
```

### Struct Types

Compact structs map to TypeScript objects:

```compact
struct Transfer {
  sender: Bytes<32>,
  recipient: Bytes<32>,
  amount: Uint<64>,
}
```

```typescript
const transfer = {
  sender: senderAddress,
  recipient: recipientAddress,
  amount: 1000n,
};
```

## Building Witnesses from Contract Types

When working with compiled Compact contracts, use the generated types:

```typescript
import type { TransferWitness } from './contract.d.cts';

// Type-safe witness construction
const witness: TransferWitness = {
  publicInputs: {
    nullifier: computeNullifier(note),
    commitment: computeCommitment(recipient, amount),
  },
  privateInputs: {
    sender_sk: secretKey,
    note: existingNote,
    amount: transferAmount,
  },
};
```

## Validation Before Proving

Always validate witness data before submitting to the prover.

### Schema Validation

```typescript
import { z } from 'zod';

const TransferWitnessSchema = z.object({
  publicInputs: z.object({
    nullifier: z.instanceof(Uint8Array).refine(
      (arr) => arr.length === 32,
      'Nullifier must be 32 bytes'
    ),
    commitment: z.instanceof(Uint8Array).refine(
      (arr) => arr.length === 32,
      'Commitment must be 32 bytes'
    ),
  }),
  privateInputs: z.object({
    sender_sk: z.instanceof(Uint8Array).refine(
      (arr) => arr.length === 32,
      'Secret key must be 32 bytes'
    ),
    note: z.object({
      owner: z.instanceof(Uint8Array),
      amount: z.bigint().nonnegative(),
    }),
    amount: z.bigint().positive(),
  }),
});

function validateWitness(data: unknown): TransferWitness {
  return TransferWitnessSchema.parse(data);
}
```

### Numeric Range Validation

```typescript
function validateUint(value: bigint, bits: number): void {
  const max = (1n << BigInt(bits)) - 1n;
  if (value < 0n || value > max) {
    throw new Error(
      `Value ${value} out of range for Uint<${bits}> (0 to ${max})`
    );
  }
}

// Usage
validateUint(amount, 64);
```

### Bytes Length Validation

```typescript
function validateBytes(bytes: Uint8Array, expectedLength: number): void {
  if (bytes.length !== expectedLength) {
    throw new Error(
      `Expected ${expectedLength} bytes, got ${bytes.length}`
    );
  }
}

// Usage
validateBytes(address, 32);
```

## Common Formatting Errors

### Wrong Numeric Type

```typescript
// WRONG: Using number instead of bigint
const amount = 1000;  // number

// CORRECT: Use bigint
const amount = 1000n; // bigint
```

### Incorrect Byte Length

```typescript
// WRONG: Address truncated or padded incorrectly
const address = hexToBytes('0x1234');  // Only 2 bytes!

// CORRECT: Full 32-byte address
const address = hexToBytes(fullAddressHex); // 32 bytes
```

### Missing Fields

```typescript
// WRONG: Missing required private input
const witness = {
  publicInputs: { commitment },
  privateInputs: {
    // Missing sender_sk!
    amount,
  },
};

// CORRECT: All fields present
const witness = {
  publicInputs: { commitment },
  privateInputs: {
    sender_sk: secretKey,
    amount,
  },
};
```

## Serialization for API Transport

When sending witnesses over HTTP, serialize properly:

### JSON Serialization

```typescript
// Custom BigInt serializer
function serializeWitness(witness: WitnessData): string {
  return JSON.stringify(witness, (key, value) => {
    if (typeof value === 'bigint') {
      return { __type: 'bigint', value: value.toString() };
    }
    if (value instanceof Uint8Array) {
      return { __type: 'bytes', value: Buffer.from(value).toString('base64') };
    }
    return value;
  });
}

// Custom deserializer
function deserializeWitness(json: string): WitnessData {
  return JSON.parse(json, (key, value) => {
    if (value && typeof value === 'object') {
      if (value.__type === 'bigint') {
        return BigInt(value.value);
      }
      if (value.__type === 'bytes') {
        return new Uint8Array(Buffer.from(value.value, 'base64'));
      }
    }
    return value;
  });
}
```

### Binary Serialization (Efficient)

For high-performance scenarios, use binary encoding:

```typescript
import { encode, decode } from '@msgpack/msgpack';

// Serialize with MessagePack
const encoded = encode(witness);

// Deserialize
const decoded = decode(encoded) as WitnessData;
```

## Best Practices

1. **Use generated types** from compiled contracts for type safety
2. **Validate all inputs** before proof generation
3. **Use bigint for all numeric values** - never JavaScript `number`
4. **Check byte array lengths** match expected sizes
5. **Handle serialization carefully** when transporting over network
6. **Log witness structure (not values)** for debugging
7. **Clear sensitive data** from memory after proof generation
