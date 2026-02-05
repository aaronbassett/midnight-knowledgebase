# Midnight Contract Project Template

A starter template for Midnight Compact smart contract development.

## Project Structure

```
.
├── contract.compact      # Main contract entry point
├── types.compact         # Shared type definitions
├── src/
│   ├── index.ts         # Application entry point
│   └── witnesses.ts     # Witness implementations
├── build/               # Compiled output (gitignored)
├── tests/
│   └── contract.test.ts # Contract tests
├── scripts/
│   ├── build.sh         # Build script
│   └── deploy.ts        # Deployment script
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 18+
- Midnight CLI tools (`compactc`)
- pnpm (recommended) or npm

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build the Contract

Development build (fast, no ZK proofs):

```bash
pnpm run build:dev
```

Production build (full ZK key generation):

```bash
pnpm run build
```

### 3. Run Tests

```bash
pnpm test
```

### 4. Deploy

Configure your `.env` file:

```bash
cp .env.example .env
# Edit .env with your credentials
```

Deploy to testnet:

```bash
pnpm run deploy:testnet
```

## Development Workflow

### Fast Iteration

Use development builds for quick iteration:

```bash
# Build without ZK (fast)
pnpm run build:dev

# Watch mode
pnpm run watch

# Run tests
pnpm test
```

### Production Build

When ready for deployment:

```bash
# Full build with ZK keys
pnpm run build

# Deploy
pnpm run deploy:testnet
```

## Contract Overview

### Main Contract (`contract.compact`)

A simple token contract demonstrating:

- Ledger state management
- Witness function usage
- Access control patterns
- Token transfer logic

### Shared Types (`types.compact`)

Common type definitions:

- `Address` - 32-byte address type
- `Amount` - 64-bit unsigned integer for quantities
- `Result<T>` - Result type for fallible operations
- `Option<T>` - Optional value type

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MIDNIGHT_NETWORK` | Target network (testnet/mainnet) |
| `MIDNIGHT_RPC_URL` | RPC endpoint URL |
| `WALLET_PRIVATE_KEY` | Deployment wallet key |

### COMPACT_PATH

Set include paths for compilation:

```bash
export COMPACT_PATH="./lib:./vendor"
```

## Build Output

After compilation, the `build/` directory contains:

```
build/
├── zkir/           # Zero-knowledge IR
├── keys/
│   ├── prover/     # Prover keys (client-side)
│   └── verifier/   # Verifier keys (on-chain)
├── contract.ts     # Generated TypeScript interface
├── witnesses.ts    # Generated witness types
└── index.ts        # Main exports
```

## Testing

### Unit Tests

```typescript
import { TestContext } from '@midnight-ntwrk/compact-testing';
import { mockWitnesses } from './fixtures';

describe('Token Contract', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await TestContext.create('contract.compact');
  });

  it('should transfer tokens', async () => {
    const result = await ctx.call('transfer', [from, to, 100n], mockWitnesses);
    expect(result.success).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('Integration', () => {
  it('should deploy and interact', async () => {
    const provider = await createLocalProvider();
    const deployment = await deployContract(provider, config);

    const result = await deployment.contract.callTx.transfer({
      from_addr: sender,
      to_addr: recipient,
      amount: 1000n
    }, witnesses);

    expect(result.success).toBe(true);
  });
});
```

## Customization

### Adding New Circuits

1. Add circuit to `contract.compact`:

```compact
export circuit my_circuit(arg: Field): Field {
    return arg * 2;
}
```

2. Rebuild:

```bash
pnpm run build:dev
```

3. Use in TypeScript:

```typescript
const result = await contract.callTx.my_circuit({ arg: 42n }, witnesses);
```

### Adding Witnesses

1. Declare in `contract.compact`:

```compact
witness get_secret(): Bytes<32>;
```

2. Implement in `src/witnesses.ts`:

```typescript
export const witnesses = {
  get_secret: ({ privateState }) => privateState.secret
};
```

## Troubleshooting

### Common Issues

**Build fails with "module not found":**
- Check `COMPACT_PATH` includes required directories
- Verify file paths in `include` statements

**Proof generation fails:**
- Run full build (not `--skip-zk`)
- Check witness implementations return correct types

**Type errors in generated TypeScript:**
- Rebuild contract
- Check type mappings in `types.compact`

## Resources

- [Compact Language Reference](https://docs.midnight.network/compact)
- [Midnight SDK Documentation](https://docs.midnight.network/sdk)
- [Example Contracts](https://github.com/midnight-ntwrk/examples)
