# Compact to TypeScript Type Mapping

Complete reference for type correspondence between Compact contracts and TypeScript.

## Primitive Types

### Field → bigint

The ZK-native field element maps to JavaScript's arbitrary-precision integer.

```compact
// Compact
const value: Field = 42;
witness get_field(): Field;
```

```typescript
// TypeScript
const value: bigint = 42n;

const witnesses = {
  get_field: (): bigint => {
    return 42n;
  }
};
```

**Important**: Field values are approximately 254 bits. Always use `bigint` literals with the `n` suffix.

### Uint<N> → bigint

All unsigned integer widths map to `bigint`, regardless of bit width.

```compact
// Compact
const small: Uint<8> = 255;
const large: Uint<128> = 1000000;
witness get_amount(): Uint<64>;
```

```typescript
// TypeScript
const small: bigint = 255n;
const large: bigint = 1000000n;

const witnesses = {
  get_amount: (): bigint => {
    return 1000n;
  }
};
```

**Note**: TypeScript does not enforce bit width constraints. The Compact runtime validates values fit within the declared width.

### Boolean → boolean

Direct mapping between Compact and TypeScript booleans.

```compact
// Compact
const flag: Boolean = true;
witness is_authorized(): Boolean;
```

```typescript
// TypeScript
const flag: boolean = true;

const witnesses = {
  is_authorized: (): boolean => {
    return true;
  }
};
```

## Composite Types

### Bytes<N> → Uint8Array

Fixed-size byte arrays map to `Uint8Array`.

```compact
// Compact
const hash: Bytes<32> = ...;
witness get_signature(): Bytes<64>;
```

```typescript
// TypeScript
const hash: Uint8Array = new Uint8Array(32);

const witnesses = {
  get_signature: (): Uint8Array => {
    // Return exactly 64 bytes
    return new Uint8Array(64);
  }
};
```

**Common patterns**:

```typescript
// From hex string
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// From base64
const bytes = Uint8Array.from(atob(base64String), c => c.charCodeAt(0));
```

### struct → Object with Typed Fields

Compact structs become TypeScript objects with corresponding field types.

```compact
// Compact
struct Transfer {
  from: Bytes<32>,
  to: Bytes<32>,
  amount: Uint<64>
}

witness get_transfer(): Transfer;
```

```typescript
// TypeScript
interface Transfer {
  from: Uint8Array;  // Bytes<32>
  to: Uint8Array;    // Bytes<32>
  amount: bigint;    // Uint<64>
}

const witnesses = {
  get_transfer: (): Transfer => {
    return {
      from: new Uint8Array(32),
      to: new Uint8Array(32),
      amount: 1000n
    };
  }
};
```

### enum → Discriminated Union

Compact enums become TypeScript discriminated unions with a `tag` property.

```compact
// Compact
enum Option<T> {
  Some(T),
  None
}

enum PaymentMethod {
  Token(Bytes<32>),
  Native,
  Deferred(Uint<64>)
}
```

```typescript
// TypeScript
type Option<T> =
  | { tag: 'Some'; value: T }
  | { tag: 'None' };

type PaymentMethod =
  | { tag: 'Token'; value: Uint8Array }
  | { tag: 'Native' }
  | { tag: 'Deferred'; value: bigint };

// Construction
const some: Option<bigint> = { tag: 'Some', value: 42n };
const none: Option<bigint> = { tag: 'None' };

const payment: PaymentMethod = { tag: 'Token', value: tokenId };
```

### Vector<T, N> → T[]

Fixed-size vectors become arrays of the mapped element type.

```compact
// Compact
const values: Vector<Field, 3> = [1, 2, 3];
witness get_path(): Vector<Bytes<32>, 10>;
```

```typescript
// TypeScript
const values: bigint[] = [1n, 2n, 3n];

const witnesses = {
  get_path: (): Uint8Array[] => {
    // Return exactly 10 elements
    return Array(10).fill(null).map(() => new Uint8Array(32));
  }
};
```

## Special Types

### Opaque<'string'> → string

UTF-8 string data from TypeScript that cannot be inspected in Compact.

```compact
// Compact
witness get_username(): Opaque<'string'>;
witness get_metadata(): Opaque<'string'>;
```

```typescript
// TypeScript
const witnesses = {
  get_username: (): string => {
    return "alice";
  },
  get_metadata: (): string => {
    return JSON.stringify({ role: "admin", timestamp: Date.now() });
  }
};
```

**Use cases**:
- Usernames and display names
- Serialized JSON metadata
- URLs and identifiers
- Any text that doesn't need circuit processing

### Opaque<'Uint8Array'> → Uint8Array

Binary data from TypeScript that cannot be inspected in Compact.

```compact
// Compact
witness get_document(): Opaque<'Uint8Array'>;
witness get_image(): Opaque<'Uint8Array'>;
```

```typescript
// TypeScript
const witnesses = {
  get_document: (): Uint8Array => {
    // Could be PDF, encrypted data, etc.
    return new Uint8Array(documentBuffer);
  },
  get_image: async (): Promise<Uint8Array> => {
    const response = await fetch(imageUrl);
    return new Uint8Array(await response.arrayBuffer());
  }
};
```

**Use cases**:
- Binary documents (PDFs, images)
- Encrypted payloads
- Arbitrary binary protocols
- Large data blobs

## Circuit Return Types

Circuit return values map to the same TypeScript types.

```compact
// Compact
export circuit get_balance(addr: Bytes<32>): Uint<64> { ... }
export circuit get_info(): (Field, Boolean) { ... }
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] { ... }
```

```typescript
// TypeScript usage
const balance: bigint = await contract.callTx.get_balance(address, witnesses);

const [field, flag]: [bigint, boolean] = await contract.callTx.get_info(witnesses);

// Empty tuple [] means no return value
await contract.callTx.transfer(recipient, 100n, witnesses);
```

## Nested Type Examples

### Complex Nested Structure

```compact
// Compact
struct Account {
  owner: Bytes<32>,
  balances: Vector<Uint<64>, 5>,
  metadata: Opaque<'string'>
}

enum AccountStatus {
  Active(Account),
  Frozen(Bytes<32>),
  Closed
}
```

```typescript
// TypeScript
interface Account {
  owner: Uint8Array;
  balances: bigint[];
  metadata: string;
}

type AccountStatus =
  | { tag: 'Active'; value: Account }
  | { tag: 'Frozen'; value: Uint8Array }
  | { tag: 'Closed' };

// Construction
const account: Account = {
  owner: ownerPublicKey,
  balances: [100n, 200n, 0n, 0n, 0n],
  metadata: JSON.stringify({ name: "Main Account" })
};

const status: AccountStatus = {
  tag: 'Active',
  value: account
};
```

## Type Conversion Utilities

```typescript
// Convert bigint to Uint8Array (big-endian)
function bigintToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

// Convert Uint8Array to bigint (big-endian)
function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

// Validate bigint fits in Uint<N>
function validateUint(value: bigint, bits: number): boolean {
  const max = (1n << BigInt(bits)) - 1n;
  return value >= 0n && value <= max;
}
```
