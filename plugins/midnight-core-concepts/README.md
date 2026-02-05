# midnight-core-concepts

Claude Code plugin providing comprehensive knowledge of Midnight Network core concepts for developers.

## Skills

| Skill | Domain | Use When |
|-------|--------|----------|
| `data-models` | UTXO, accounts, ledgers, tokens | Choosing token model, understanding state |
| `zero-knowledge` | ZK proofs, SNARKs, circuits | Understanding proof generation, circuits |
| `privacy-patterns` | Hashes, commits, Merkle trees | Implementing privacy in contracts |
| `smart-contracts` | Compact, Impact VM, state | Writing and deploying contracts |
| `protocols` | Kachina, Zswap | Token transfers, atomic swaps |
| `architecture` | Transactions, building blocks | Understanding system structure |

## Agents

| Agent | Purpose |
|-------|---------|
| `concept-explainer` | Complex questions spanning multiple concept domains |

## Structure

Each skill contains:
- `SKILL.md` - Quick reference with decision guidance
- `references/` - Detailed technical documentation
- `examples/` - Compact code examples

## Usage Examples

```
"Explain how Midnight's UTXO model differs from account-based blockchains"
"What are the roles of prover and verifier in Midnight's ZK system?"
"How does the Kachina protocol handle private contract state?"
```

## Installation

```bash
claude --plugin-dir /path/to/midnight-core-concepts
```
