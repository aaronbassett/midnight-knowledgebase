# midnight-dapp

Frontend DApp development for Midnight Network. This plugin provides skills, commands, and guidance for building privacy-preserving decentralized applications with the Lace wallet.

## Overview

The midnight-dapp plugin helps developers:

- **Connect wallets** - Integrate Lace wallet for user authentication and transaction signing
- **Handle ZK proofs** - Build witness data and manage client-side proof generation
- **Manage state** - Read contract state and implement privacy-aware caching
- **Submit transactions** - Complete transaction lifecycle from build to confirmation
- **Handle errors** - Categorize errors and display user-friendly messages
- **Write tests** - Mock proofs and wallets for fast, reliable testing

## Prerequisites

- Node.js 20+
- Docker (for local proof server)
- Chrome browser with Lace wallet extension
- Project scaffolded with `create-mn-app`

## Skills

| Skill | Purpose | Priority |
|-------|---------|----------|
| `wallet-integration` | Lace wallet connection, accounts, networks | P1 (MVP) |
| `proof-handling` | Witness construction, proof progress, disclosure UX | P1 (MVP) |
| `state-management` | Contract state reading, chain sync, caching | P1 (MVP) |
| `transaction-flows` | Transaction lifecycle, signing, confirmations | P2 |
| `error-handling` | Error taxonomy, user messaging, recovery | P2 |
| `testing-patterns` | Mock proofs/wallets, testnet workflows | P3 |

## Commands

| Command | Description |
|---------|-------------|
| `/dapp-check` | Validate DApp project structure and configuration |
| `/dapp-debug [category]` | Interactive debugging for wallet, transaction, or proof issues |

## Quick Start

1. **Validate your project**:
   ```
   /dapp-check
   ```

2. **Connect a wallet**:
   Ask: "How do I connect Lace wallet to my DApp?"

3. **Handle proofs**:
   Ask: "Show me how to build witness data for a transaction"

4. **Debug issues**:
   ```
   /dapp-debug wallet
   ```

## Dependencies

This plugin depends on:
- **compact-core** - For Compact language patterns and TypeScript integration

## For Web3 Developers

Each skill includes a `web3-comparison.md` reference explaining differences from Ethereum/Solana patterns:

- Wallet connection: `window.midnight.mnLace` vs `window.ethereum`
- Transactions: ZK proof generation vs instant signing
- State: Dual public/private model vs all-public state
- Addresses: Bech32m format vs hex (0x...)

## Technology Stack

- **TypeScript 5.3+** - All examples use strict TypeScript
- **React 18+** - Example components (core logic is framework-agnostic)
- **@midnight-ntwrk SDK** - Official Midnight JavaScript packages
- **Vitest** - Unit testing for examples

## Agent

The **dapp-architect** agent provides design guidance and routes architectural questions to the appropriate skill. Trigger it with questions like:

- "How should I structure my DApp's state management?"
- "What's the best pattern for handling proof generation?"
- "Recommend an approach for error handling"

## Hook

The **private-key-check** hook warns before writing files that contain potential security vulnerabilities:

- Hardcoded private keys (64-char hex strings)
- Seed phrases (12/24 word patterns)
- Exposed API keys and secrets

## Content Summary

| Component | Count |
|-----------|-------|
| Skills | 6 |
| Reference docs | 24 |
| Code examples | 18 |
| Commands | 2 |
| Agents | 1 |
| Hooks | 1 |

## Related Documentation

- [Midnight Network Docs](https://docs.midnight.network)
- [Lace Wallet](https://www.lace.io)
- [Create MN App](https://docs.midnight.network/getting-started/create-mn-app)
- [compact-core plugin](../compact-core/) - Compact language and TypeScript integration
