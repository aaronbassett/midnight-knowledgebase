# compact-core

Expert-level Compact smart contract development for the Midnight Network.

## Overview

This Claude Code plugin provides comprehensive guidance for writing privacy-preserving smart contracts in the Compact language. It covers the complete development lifecycle from language fundamentals to proven contract patterns.

**Target Audience**: Developers building on Midnight Network who need expert-level Compact guidance.

**Version Compatibility**:
- Compact Language: 0.18.0
- Compact Compiler (compactc): 0.26.0

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| `language-reference` | Type system, circuits, witnesses, modules | "Compact types", "circuit syntax", "witness" |
| `privacy-disclosure` | Disclosure rules, commitment patterns, nullifiers | "disclose", "commitment", "nullifier" |
| `ledger-adts` | Counter, Map, Set, MerkleTree operations | "Counter", "Map", "MerkleTree", "ADT" |
| `standard-library` | Crypto, tokens, time functions | "Maybe", "persistentHash", "mintToken" |
| `testing-debugging` | Error messages, testing strategies | "debug", "error", "assert failed" |
| `typescript-integration` | TypeScript bridge, witness implementation | "witness implementation", "type mapping" |
| `contract-patterns` | 10+ simple patterns, 3 deep-dives | "contract pattern", "voting", "escrow" |
| `compilation-tooling` | Compiler usage, project structure | "compactc", "COMPACT_PATH" |
| `clone-examples` | Example contracts, project scaffolding | "example", "starter", "scaffold" |

## Commands

| Command | Description |
|---------|-------------|
| `/compact-lint` | Validate Compact code patterns and suggest improvements |

## Agents

| Agent | Description |
|-------|-------------|
| `compact-expert` | Deep expertise for open-ended questions and edge cases |

## Related Plugins

- **@midnight-core-concepts**: Blockchain fundamentals, privacy model, ZK proofs
- **@midnight-tooling**: Development environment setup, debugging tools

## Content Inventory

- **Skills**: 9 specialized skill directories
- **Reference Documents**: 29 detailed guides
- **Compact Examples**: 30 working contract examples
- **Simple Patterns**: 10 focused contract patterns
- **Deep-Dive Patterns**: 3 comprehensive implementations (voting, escrow, registry)
- **TypeScript Examples**: 5 integration examples
- **Build Scripts**: 3 automation scripts

## Validation

All Compact examples compile with `compactc --skip-zk`.
All TypeScript examples type-check with `tsc --noEmit`.

Run validation:
```bash
./scripts/validate-examples.sh
```

## Resources

- [Midnight Documentation](https://docs.midnight.network)
- [Compact Language Reference](https://docs.midnight.network/develop/reference/compact/lang-ref)
- [Midnight Developer Portal](https://midnight.network/developers)
