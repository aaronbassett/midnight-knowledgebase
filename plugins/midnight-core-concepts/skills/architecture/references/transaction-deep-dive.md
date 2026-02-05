# Transaction Structure Deep Dive

## Complete Transaction Anatomy

```
Transaction {
  // Required: At least one Zswap offer
  guaranteed_zswap_offer: Offer,

  // Optional: May-fail Zswap offer
  fallible_zswap_offer: Option<Offer>,

  // Optional: Contract interactions
  contract_calls: Option<ContractCalls>,

  // Cryptographic binding
  binding_randomness: Bytes<32>
}
```

## Zswap Offer Details

### Offer Structure

```
Offer {
  inputs: Vec<Input>,
  outputs: Vec<Output>,
  transient: Vec<TransientCoin>,
  balance: Map<TokenType, SignedValue>
}
```

### Input Components

```
Input {
  // Public: Prevents double-spend
  nullifier: Bytes<32>,

  // Public: Type/value commitment for balance verification
  type_value_commit: Bytes<32>,

  // Optional: Contract that controls this coin
  contract_address: Option<Address>,

  // Merkle proof of coin existence
  merkle_root: Bytes<32>,
  merkle_path: Vec<Bytes<32>>,

  // ZK proof of valid spend
  zk_proof: Proof
}
```

### Output Components

```
Output {
  // Public: New coin identifier
  commitment: Bytes<32>,

  // Public: For balance verification
  type_value_commit: Bytes<32>,

  // Optional: Target contract
  contract_address: Option<Address>,

  // Optional: Encrypted note for recipient
  ciphertext: Option<Bytes>,

  // ZK proof of valid creation
  zk_proof: Proof
}
```

## Contract Call Section

### Structure

```
ContractCalls {
  // Must succeed for tx to be valid
  guaranteed: Vec<ContractCall>,

  // May fail without reverting guaranteed section
  fallible: Vec<ContractCall>,

  // Cross-contract communication (future)
  communication_commitment: Option<Bytes<32>>
}
```

### Individual Call

```
ContractCall {
  // Target contract
  contract_address: Address,

  // Entry point to invoke
  entry_point: String,

  // Public effects this call will produce
  transcript: Transcript,

  // ZK proof that execution produces transcript
  zk_proof: Proof
}
```

## Transcript Structure

```
Transcript {
  // State field changes
  state_updates: Vec<(FieldName, OldValue, NewValue)>,

  // Merkle tree insertions
  tree_insertions: Vec<(TreeName, Value)>,

  // Set insertions
  set_insertions: Vec<(SetName, Value)>,

  // Zswap operations
  coin_receives: Vec<CoinInfo>,
  coin_sends: Vec<(Value, TokenType, Address)>
}
```

## Binding Mechanism

### Purpose

Binding randomness cryptographically links all transaction components:
- Prevents mix-and-match attacks
- Ensures atomic execution
- Provides transaction uniqueness

### How It Works

```
TransactionHash = Hash(
  guaranteed_offer_hash,
  fallible_offer_hash,
  contract_calls_hash,
  binding_randomness
)
```

All proofs commit to this hash, preventing component substitution.

## Proof Relationships

```
┌─────────────────────────────────────────────────┐
│                 Transaction                      │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐             │
│  │ Zswap Proofs│    │Contract Proofs│           │
│  │ • Input proofs│  │ • Execution proof│        │
│  │ • Output proofs│ │ • Transcript proof│       │
│  │ • Balance proof│ │                   │       │
│  └──────┬──────┘    └────────┬──────────┘       │
│         │                    │                   │
│         └────────┬───────────┘                   │
│                  ↓                               │
│         Schnorr Binding Proof                    │
│         (No hidden value in contract section)    │
└─────────────────────────────────────────────────┘
```

## Validation Order

### 1. Structural Validation

- Canonical encoding
- Required fields present
- Size limits respected

### 2. Proof Validation

- All ZK proofs verify
- Schnorr proofs verify
- Proof-to-data binding correct

### 3. Balance Validation

- Input values = Output values + Fees
- Homomorphic commitment check
- Per-token-type balance

### 4. Merkle Validation

- Input Merkle proofs valid
- Roots in valid set

### 5. Nullifier Validation

- No nullifier in spent set
- No duplicate nullifiers in transaction

## Fee Handling

```
Fees paid via Zswap balance:

Offer balance must satisfy:
  sum(input_values) >= sum(output_values) + minimum_fee

Excess becomes fee payment to block producer.
```

## Transaction Lifecycle

```
1. Construction (User)
   └─ Build offers, calls, proofs

2. Submission
   └─ Broadcast to network

3. Mempool
   └─ Basic validation
   └─ Wait for block inclusion

4. Block Inclusion
   └─ Full validation
   └─ State application

5. Finalization
   └─ Confirmation depth reached
   └─ Effects permanent
```
