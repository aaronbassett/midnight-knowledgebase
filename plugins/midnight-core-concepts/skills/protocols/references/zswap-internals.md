# Zswap Internals

## Foundation

Zswap extends Zerocash with:
- Multi-asset support
- Atomic swap capability
- Contract integration

Based on Zcash Sapling architecture with Midnight-specific extensions.

## Cryptographic Primitives

### Pedersen Commitments

Used for value hiding:

```
Commit(type, value, owner, randomness) =
  type·G_t + value·G_v + owner·G_o + randomness·G_r
```

**Properties**:
- Perfectly hiding: Cannot determine committed values
- Computationally binding: Cannot open to different values
- Homomorphic: Commit(a) + Commit(b) = Commit(a+b)

### Sparse Homomorphic Commitments

Zswap uses sparse multi-value Pedersen commitments:
- Support multiple token types in one commitment
- Efficient aggregation across offers
- Enable balance verification without revealing values

### Nullifiers

```
nullifier = PRF(owner_secret, commitment)
```

**Properties**:
- Deterministic: Same inputs → same nullifier
- Unlinkable: Cannot derive commitment from nullifier
- Collision-resistant: Different inputs → different nullifiers

## Offer Structure Details

### Complete Offer

```
Offer {
  inputs: [Input, ...],
  outputs: [Output, ...],
  transient: [TransientCoin, ...],
  balance: Map<TokenType, SignedValue>,
  proofs: [ZKProof, ...]
}
```

### Input Structure

```
Input {
  nullifier: Bytes<32>,
  type_value_commit: PedersenCommit,
  contract_address: Option<Address>,
  merkle_root: Bytes<32>,
  merkle_proof: MerklePath,
  zk_proof: Proof
}
```

**Proof demonstrates**:
- Knowledge of commitment preimage
- Commitment exists in Merkle tree
- Nullifier correctly computed
- Owner authorized the spend

### Output Structure

```
Output {
  commitment: Bytes<32>,
  type_value_commit: PedersenCommit,
  contract_address: Option<Address>,
  ciphertext: Option<EncryptedNote>,
  zk_proof: Proof
}
```

**Proof demonstrates**:
- Commitment correctly formed
- Type/value commitment matches
- Valid encryption (if present)

### Transient Coins

Coins created and spent in same transaction:
- Never actually exist on-chain
- Enable complex swap patterns
- Balance internally

## Balance Verification

### Per-Token Accounting

For each token type:
```
∑(input_values) = ∑(output_values) + fees
```

### Homomorphic Verification

Using commitment homomorphism:
```
∑(input_commits) - ∑(output_commits) = Commit(fees)
```

Verifiable without knowing actual values.

### Multi-Asset Balancing

Each offer specifies balance vector:
```
balance: {
  NIGHT: -100,    // Spending 100 NIGHT
  TOKEN_A: +50,   // Receiving 50 TOKEN_A
}
```

Merged offers must sum to zero (minus fees).

## Merging Protocol

### Merge Requirements

Two offers can merge if:
1. At least one has empty contract call section
2. Combined balances sum to zero (minus fees)
3. No nullifier conflicts

### Merge Process

```
Offer1 + Offer2 = MergedOffer {
  inputs: Offer1.inputs ∪ Offer2.inputs,
  outputs: Offer1.outputs ∪ Offer2.outputs,
  transient: Offer1.transient ∪ Offer2.transient,
  balance: Offer1.balance + Offer2.balance,
  proofs: Offer1.proofs ∪ Offer2.proofs
}
```

### Non-Interactive Merging

Key innovation: Offers merge without parties communicating:
- Party A publishes partial offer
- Party B publishes complementary offer
- Anyone can merge them
- Atomic execution guaranteed

## Contract Integration

### Targeted Coins

Coins can specify contract address:
- Only that contract can spend them
- Enables contract-controlled value

### Token Issuance

Contracts create tokens via:
```
TokenType = Hash(contract_address, domain_separator)
```

Tokens are issued through Zswap mint operations.

### Coin Operations in Contracts

```compact
// Contract receives targeted coins
receive coins: Coin[];

// Contract sends coins
send { value, type }, to: recipient;

// Contract mints new tokens
mint { value, domain }, to: recipient;
```

## Security Properties

### Unlinkability

- Inputs unlinkable to outputs
- Transaction graph hidden
- Only balancing verified

### Non-Malleability

- Offers bound by proofs
- Cannot modify without invalidating proofs
- Safe for multi-party composition

### Forward Security

- Compromised keys don't reveal past transactions
- Nullifiers protect historical privacy

## Performance

### Proof Sizes

| Component | Size |
|-----------|------|
| Input proof | ~200 bytes |
| Output proof | ~200 bytes |
| Total transaction | ~1-2 KB typical |

### Verification Time

- Per-proof: milliseconds
- Parallelizable across inputs/outputs
- Constant regardless of value/complexity

## Current Status

**Note**: Zswap implementation is still being refined:
- Performance optimizations ongoing
- Some details may change
- Native currency implementation evolving
