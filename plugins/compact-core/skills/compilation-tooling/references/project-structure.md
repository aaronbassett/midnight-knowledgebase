# Project Structure

Recommended project layouts for Midnight Compact development.

## Basic Project Structure

Minimal structure for a simple contract:

```
my-contract/
├── contract.compact           # Main contract file
├── build/                     # Compiled output (gitignored)
│   ├── zkir/
│   ├── keys/
│   └── *.ts
├── src/
│   ├── index.ts              # Application entry point
│   └── witnesses.ts          # Witness implementations
├── package.json
├── tsconfig.json
└── .gitignore
```

## Standard Project Structure

Recommended layout for production applications:

```
my-midnight-project/
├── contracts/                 # Compact source files
│   ├── main.compact          # Main contract entry point
│   ├── types.compact         # Shared type definitions
│   └── lib/                  # Helper modules
│       ├── auth.compact      # Authentication utilities
│       ├── crypto.compact    # Cryptographic helpers
│       └── utils.compact     # General utilities
│
├── src/                      # TypeScript application code
│   ├── index.ts              # Application entry point
│   ├── witnesses.ts          # Witness implementations
│   ├── deploy.ts             # Deployment scripts
│   └── client.ts             # Client interaction code
│
├── build/                    # Compiled output (gitignored)
│   ├── zkir/                 # ZK intermediate representation
│   ├── keys/                 # Prover and verifier keys
│   │   ├── prover/
│   │   └── verifier/
│   ├── contract.ts           # Generated contract types
│   ├── witnesses.ts          # Generated witness types
│   └── index.ts              # Generated exports
│
├── tests/                    # Test files
│   ├── unit/                 # Unit tests
│   │   └── contract.test.ts
│   ├── integration/          # Integration tests
│   │   └── deploy.test.ts
│   └── fixtures/             # Test data
│       └── test-data.json
│
├── scripts/                  # Build and utility scripts
│   ├── build.sh              # Build script
│   ├── watch.sh              # Development watcher
│   ├── deploy.ts             # Deployment script
│   └── validate.sh           # Validation script
│
├── config/                   # Configuration files
│   ├── testnet.json          # Testnet configuration
│   └── mainnet.json          # Mainnet configuration
│
├── deployments/              # Deployment records
│   ├── testnet.json          # Testnet deployment info
│   └── mainnet.json          # Mainnet deployment info
│
├── package.json              # Node.js configuration
├── tsconfig.json             # TypeScript configuration
├── .env.example              # Environment variable template
├── .env                      # Local environment (gitignored)
├── .gitignore
└── README.md
```

## Multi-Contract Project

For projects with multiple related contracts:

```
multi-contract-project/
├── contracts/
│   ├── shared/               # Shared across all contracts
│   │   ├── types.compact
│   │   └── utils.compact
│   │
│   ├── token/                # Token contract
│   │   ├── token.compact
│   │   └── lib/
│   │       └── erc20.compact
│   │
│   ├── governance/           # Governance contract
│   │   ├── governance.compact
│   │   └── lib/
│   │       └── voting.compact
│   │
│   └── registry/             # Registry contract
│       └── registry.compact
│
├── build/
│   ├── token/                # Token contract output
│   ├── governance/           # Governance contract output
│   └── registry/             # Registry contract output
│
├── src/
│   ├── contracts/            # Contract-specific TypeScript
│   │   ├── token.ts
│   │   ├── governance.ts
│   │   └── registry.ts
│   ├── witnesses/
│   │   ├── token.ts
│   │   ├── governance.ts
│   │   └── registry.ts
│   └── index.ts
│
├── scripts/
│   ├── build-all.sh          # Build all contracts
│   └── deploy-system.ts      # Deploy contract system
│
└── package.json
```

## Monorepo Structure

For large-scale projects using workspaces:

```
midnight-monorepo/
├── packages/
│   ├── contracts/            # Compact contracts package
│   │   ├── src/
│   │   │   ├── token.compact
│   │   │   └── governance.compact
│   │   ├── build/
│   │   └── package.json
│   │
│   ├── sdk/                  # SDK package
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── webapp/               # Web application
│   │   ├── src/
│   │   └── package.json
│   │
│   └── cli/                  # CLI tool
│       ├── src/
│       └── package.json
│
├── package.json              # Root package.json
├── pnpm-workspace.yaml       # Workspace configuration
└── turbo.json                # Build orchestration
```

## Configuration Files

### package.json

```json
{
  "name": "my-midnight-project",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "./scripts/build.sh",
    "build:dev": "./scripts/build.sh --skip-zk",
    "watch": "./scripts/watch.sh",
    "test": "vitest",
    "deploy:testnet": "ts-node scripts/deploy.ts --network testnet",
    "deploy:mainnet": "ts-node scripts/deploy.ts --network mainnet"
  },
  "dependencies": {
    "@midnight-ntwrk/midnight-js-contracts": "^1.0.0",
    "@midnight-ntwrk/midnight-js-provider": "^1.0.0",
    "@midnight-ntwrk/midnight-js-types": "^1.0.0"
  },
  "devDependencies": {
    "@midnight-ntwrk/compact-testing": "^1.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "paths": {
      "@contracts/*": ["./build/*"]
    }
  },
  "include": ["src/**/*", "build/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### .gitignore

```gitignore
# Build output
build/
dist/

# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# Deployment keys (NEVER commit)
*.pk
*.sk
keys/prover/
keys/verifier/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Test coverage
coverage/
```

### .env.example

```bash
# Network Configuration
MIDNIGHT_NETWORK=testnet
MIDNIGHT_RPC_URL=https://rpc.testnet.midnight.network
MIDNIGHT_INDEXER_URL=https://indexer.testnet.midnight.network

# Compilation
COMPACT_PATH=./contracts/shared

# Wallet (DO NOT COMMIT ACTUAL VALUES)
WALLET_PRIVATE_KEY=your_private_key_here
WALLET_ADDRESS=your_address_here

# Contract Addresses (after deployment)
TOKEN_CONTRACT_ADDRESS=
GOVERNANCE_CONTRACT_ADDRESS=
```

## Directory Purposes

| Directory | Purpose |
|-----------|---------|
| `contracts/` | Compact source files |
| `contracts/lib/` | Reusable Compact modules |
| `build/` | Compiled output (gitignored) |
| `build/zkir/` | Zero-knowledge intermediate representation |
| `build/keys/` | Prover and verifier keys |
| `src/` | TypeScript application code |
| `src/witnesses.ts` | Witness function implementations |
| `tests/` | Test files |
| `scripts/` | Build and deployment scripts |
| `config/` | Environment-specific configuration |
| `deployments/` | Deployment records and addresses |

## Best Practices

### Separation of Concerns

```
contracts/           # Only Compact code
src/                 # Only TypeScript code
build/               # Only generated files
```

### Shared Types Pattern

```compact
// contracts/types.compact
export struct User {
    id: Bytes<32>,
    balance: Uint<64>
}

// contracts/token.compact
include "types.compact";
// Use User struct...

// contracts/governance.compact
include "types.compact";
// Use User struct...
```

### Environment-Based Configuration

```typescript
// src/config.ts
import testnetConfig from '../config/testnet.json';
import mainnetConfig from '../config/mainnet.json';

export const config = process.env.MIDNIGHT_NETWORK === 'mainnet'
  ? mainnetConfig
  : testnetConfig;
```

### Witness Organization

```typescript
// src/witnesses/index.ts
export { tokenWitnesses } from './token';
export { governanceWitnesses } from './governance';

// src/witnesses/token.ts
export const tokenWitnesses = {
  get_balance: ({ privateState }) => privateState.balance,
  get_nonce: ({ privateState }) => privateState.nonce
};
```
