# Midnight Compatibility Matrix

This document describes the compatibility requirements between Midnight components.

## How to Get Current Versions

The authoritative source for current compatible versions is the support matrix in the Midnight docs repository. Use the plugin commands to access cached version information:

```bash
# Show current vs installed versions
/midnight:versions

# Update cached release notes
/midnight:sync-releases

# Parse support matrix directly
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/parse-support-matrix.py
```

## Component Categories

### Core Development

| Component | Package/Tool | Description |
|-----------|--------------|-------------|
| Compact Compiler | `compactc` | Compiles Compact to ZK circuits |
| Compact Runtime | `@midnight-ntwrk/compact-runtime` | JavaScript runtime for contracts |
| Onchain Runtime | `@midnight-ntwrk/onchain-runtime` | On-chain runtime support |
| Ledger | `@midnight-ntwrk/ledger` | Core ledger types and logic |

### SDKs & APIs

| Component | Package/Tool | Description |
|-----------|--------------|-------------|
| Midnight.js | `@midnight-ntwrk/midnight.js` | JavaScript SDK bindings |
| Wallet SDK | `@midnight-ntwrk/wallet` | Wallet integration SDK |
| Wallet API | `@midnight-ntwrk/wallet-api` | Wallet operations API |
| DApp Connector API | `@midnight-ntwrk/dapp-connector-api` | dApp session management |

### Infrastructure

| Component | Package/Tool | Description |
|-----------|--------------|-------------|
| Proof Server | Docker: `midnightnetwork/proof-server` | ZK proof generation |
| Indexer | Service | Blockchain data indexing |
| Lace Wallet | Chrome extension | User wallet |

## Version Alignment Rules

### Rule 1: Compiler ↔ Runtime

The Compact compiler version determines the required runtime version:

```
Compiler 0.26.0 → Runtime 0.9.0
Compiler 0.25.0 → Runtime 0.8.0
```

These **must** match. Mixing versions causes runtime errors.

### Rule 2: Pragma ↔ Compiler

The pragma in your contract must be supported by your compiler:

```compact
pragma language_version 0.18;  // Requires compiler 0.26.0+
```

### Rule 3: SDK Packages

SDK packages (midnight.js, wallet-api, etc.) should all come from the same release:

```json
{
  "@midnight-ntwrk/midnight.js": "2.1.0",
  "@midnight-ntwrk/wallet-api": "5.0.0",
  "@midnight-ntwrk/dapp-connector-api": "3.0.0"
}
```

### Rule 4: Proof Server

The proof server must be compatible with:
- The network you're targeting (testnet/mainnet)
- The contract artifacts produced by your compiler

## Historical Version Mappings

**Note**: This is for reference. Always check current release notes for accurate mappings.

### Compiler to Language Version

| Compiler | Language | Runtime | Notes |
|----------|----------|---------|-------|
| 0.26.0 | 0.18.0 | 0.9.0 | Minokawa rename |
| 0.25.0 | 0.17.0 | 0.8.0 | |
| 0.24.0 | 0.16.0 | 0.7.0 | |

### Network Releases

| Release | Network | Key Versions |
|---------|---------|--------------|
| Testnet_02 | testnet | See current support matrix |

## Checking Compatibility

### Quick Check Script

```bash
#!/bin/bash
echo "=== Midnight Version Check ==="
echo "Compiler: $(compact compile --version 2>/dev/null || echo 'Not installed')"
echo ""
echo "npm packages:"
npm list 2>/dev/null | grep @midnight-ntwrk || echo "No Midnight packages found"
echo ""
echo "Proof Server:"
docker images midnightnetwork/proof-server --format "{{.Tag}}" 2>/dev/null || echo "Not pulled"
```

### Automated Check

```bash
/midnight:versions
```

## Resolving Incompatibilities

When versions don't align:

1. Identify the target version set from support matrix
2. Update all components to matching versions
3. Clean rebuild:
   ```bash
   rm -rf node_modules package-lock.json
   rm -rf contract/*.cjs contract/*.prover
   npm install
   compact compile src/*.compact contract/
   ```

## Resources

- [Midnight Support Matrix](https://docs.midnight.network/relnotes/support-matrix)
- [Release Notes](https://docs.midnight.network/relnotes/overview)
