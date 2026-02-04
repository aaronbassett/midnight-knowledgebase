# Module System

Reference for organizing Compact code across files using import, include, and export.

## Export

Make circuits and types available to other files and TypeScript:

```compact
// Export a circuit for TypeScript access
export circuit public_function(): Field {
    return 42;
}

// Export a type
export struct PublicData {
    value: Field,
    timestamp: Uint<64>
}

// Private circuit (no export) - only accessible within this file
circuit helper(): Field {
    return 1;
}
```

## Import

Import specific items from another module:

```compact
// Import from standard library
import { persistentHash, transientCommit } from "CompactStandardLibrary";

// Import specific types and circuits
import { Counter, Map } from "CompactStandardLibrary";

// Import from local file
import { validate_signature } from "./crypto";
```

### Standard Library Imports

```compact
// Crypto functions
import {
    persistentHash,
    transientHash,
    persistentCommit,
    transientCommit,
    ecAdd,
    ecMul,
    hashToCurve
} from "CompactStandardLibrary";

// Utility types
import { Maybe, Either } from "CompactStandardLibrary";

// Token operations
import { mintToken, send, receive, mergeCoin } from "CompactStandardLibrary";

// Time functions
import { blockTime, blockTimeBefore, blockTimeAfter } from "CompactStandardLibrary";
```

## Include

Include an entire file's contents (like C's #include):

```compact
// Include local file
include "types.compact";
include "utils.compact";

// Include from path
include "lib/helpers.compact";
```

### Import vs Include

| Feature | `import` | `include` |
|---------|----------|-----------|
| Granularity | Specific items | Entire file |
| Namespace | Items renamed if needed | All names enter current scope |
| Use case | Standard library, selective imports | Local utilities, shared types |

```compact
// Import: selective, namespaced
import { persistentHash as hash } from "CompactStandardLibrary";

// Include: everything from file
include "common_types.compact";  // All types now in scope
```

## COMPACT_PATH

Environment variable for module resolution.

### Setting COMPACT_PATH

```bash
# Unix/macOS
export COMPACT_PATH="/path/to/libs:/path/to/project/src"

# Windows
set COMPACT_PATH=C:\libs;C:\project\src
```

### Resolution Order

1. Current directory (for relative paths)
2. Directories in COMPACT_PATH (in order)
3. Standard library location

```compact
// If COMPACT_PATH="/home/user/libs:/home/user/project"

include "utils.compact";
// Searches:
// 1. ./utils.compact (current dir)
// 2. /home/user/libs/utils.compact
// 3. /home/user/project/utils.compact

import { hash } from "CompactStandardLibrary";
// Always resolves to standard library
```

## Project Organization

### Recommended Structure

```
my-contract/
├── src/
│   ├── main.compact           # Entry point
│   ├── types.compact          # Shared type definitions
│   ├── lib/
│   │   ├── auth.compact       # Authentication helpers
│   │   └── crypto.compact     # Cryptographic utilities
│   └── contracts/
│       ├── token.compact      # Token contract
│       └── registry.compact   # Registry contract
├── tests/
│   └── main.test.ts           # TypeScript tests
└── compact.json               # Project configuration
```

### Example: Multi-File Contract

**types.compact**
```compact
export struct User {
    id: Bytes<32>,
    balance: Uint<64>
}

export enum Status {
    Active,
    Suspended,
    Closed
}
```

**lib/auth.compact**
```compact
include "../types.compact";

export circuit verify_user(user_id: Bytes<32>, signature: Bytes<64>): Boolean {
    // Verification logic
    return true;
}
```

**main.compact**
```compact
include "types.compact";
import { verify_user } from "./lib/auth";
import { persistentHash } from "CompactStandardLibrary";

ledger users: Map<Bytes<32>, User>;

export circuit register(id: Bytes<32>): [] {
    const user = User {
        id: id,
        balance: 0
    };
    users.insert(id, user);
}

export circuit transfer(
    from_id: Bytes<32>,
    to_id: Bytes<32>,
    amount: Uint<64>,
    signature: Bytes<64>
): [] {
    assert verify_user(from_id, signature), "Invalid signature";
    // Transfer logic
}
```

## Circular Dependencies

Compact does not allow circular imports/includes:

```compact
// a.compact
include "b.compact";  // If b.compact includes a.compact, this is an error

// Solution: Extract shared types to a third file
// shared.compact
export struct SharedType { ... }

// a.compact
include "shared.compact";

// b.compact
include "shared.compact";
```

## Best Practices

### Use Import for Standard Library

```compact
// Good: explicit imports
import { persistentHash, Maybe } from "CompactStandardLibrary";

// Avoid: including everything (clutters namespace)
include "CompactStandardLibrary";  // Don't do this
```

### Group Related Code

```compact
// types.compact - all type definitions
export struct A { ... }
export struct B { ... }
export enum C { ... }

// utils.compact - helper functions
export circuit helper1(): Field { ... }
export circuit helper2(): Field { ... }
```

### Keep Files Focused

```compact
// token.compact - only token-related code
export circuit mint(amount: Uint<64>): [] { ... }
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] { ... }
export circuit burn(amount: Uint<64>): [] { ... }

// Don't mix unrelated concerns in one file
```

### Document Public Interfaces

```compact
/// Authentication module
///
/// Provides user verification and session management.

/// Verify a user's signature against their public key.
export circuit verify(user: Bytes<32>, sig: Bytes<64>): Boolean {
    // ...
}
```
