# Ledger Structure

## Overview

Midnight's ledger has two main components:
1. **Zswap State** - Token/coin management
2. **Contract Map** - Smart contract states

## Zswap State

```
ZswapState {
  coin_commitments: MerkleTree<Commitment>,
  free_slot_index: u64,
  nullifier_set: Set<Nullifier>,
  valid_roots: Set<MerkleRoot>
}
```

### Coin Commitments Tree

- Sparse Merkle tree of all coin commitments
- Depth determines maximum coins
- Leaves are Pedersen commitments

### Free Slot Index

- Points to next available tree position
- Increments with each new coin
- Never decreases (append-only)

### Nullifier Set

- Contains all spent coin nullifiers
- Checked before accepting new spends
- Prevents double-spending

### Valid Roots

- Set of accepted historic Merkle roots
- Allows proofs against recent tree states
- Window of validity (not infinite)

## Contract Map

```
ContractMap = Map<ContractAddress, ContractState>

ContractState {
  fields: Map<FieldName, Value>,
  merkle_trees: Map<TreeName, MerkleTree>,
  sets: Map<SetName, Set<Value>>
}
```

### Contract Address

Derived from deployment:
```
address = Hash(deployment_transaction_data)
```

### State Types

| Type | Storage | Visibility |
|------|---------|------------|
| Field | Direct value | Public |
| MerkleTree | Root only on-chain | Contents private |
| Set | Membership structure | Contents private |

## State Transitions

### Adding a Coin

```
1. Compute commitment = Pedersen(type, value, owner, r)
2. Insert commitment at free_slot_index
3. Increment free_slot_index
4. Update Merkle root
5. Add new root to valid_roots
```

### Spending a Coin

```
1. Verify nullifier not in nullifier_set
2. Verify Merkle proof against valid root
3. Verify ZK proof of ownership
4. Add nullifier to nullifier_set
```

### Updating Contract State

```
1. Lookup contract by address
2. Verify ZK proof matches circuit
3. Execute Impact program
4. Verify resulting effects match declared
5. Store new state
```

## Token Types

### Native Token

```
type = 0x0000...0000  (256-bit zero)
```

### Custom Tokens

```
type = Hash(contract_address, domain_separator)
```

The domain separator allows one contract to issue multiple token types.

## Value Accounting

### Zswap Balance Equation

```
sum(input_values) = sum(output_values) + fees
```

Enforced via:
- Pedersen commitment homomorphism
- Balance proofs
- Fee verification

### Multi-Asset Support

Each token type has independent accounting:

```
Balance = Map<TokenType, SignedValue>

For valid transaction:
∀ type: Balance[type] = 0 (except fees)
```
