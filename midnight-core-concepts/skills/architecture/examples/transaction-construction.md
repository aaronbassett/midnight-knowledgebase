# Transaction Construction Guide

## Overview

Building a Midnight transaction involves assembling Zswap offers and optionally contract calls, then generating the required proofs.

## Simple Transfer Transaction

### Goal
Send 50 NIGHT from your wallet to a recipient.

### Step 1: Identify Spendable Coin

From your local wallet:
```
MyCoin {
  commitment: 0xabc123...,
  value: 100 NIGHT,
  type: NIGHT,
  secret: 0xdef456...,
  randomness: 0x789...
  merkle_index: 42
}
```

### Step 2: Generate Merkle Path

Query the current commitment tree:
```
merkle_path = getMerklePath(index: 42)
merkle_root = getCurrentRoot()
```

### Step 3: Compute Nullifier

```
nullifier = Hash(commitment, secret)
         = Hash(0xabc123..., 0xdef456...)
         = 0xnull...
```

### Step 4: Create Recipient Output

```
recipient_commitment = Pedersen(
  type: NIGHT,
  value: 50,
  owner: recipient_public_key,
  randomness: fresh_random()
)
```

### Step 5: Create Change Output

```
change_commitment = Pedersen(
  type: NIGHT,
  value: 50,  // 100 - 50 = 50 change
  owner: my_public_key,
  randomness: fresh_random()
)
```

### Step 6: Build Zswap Offer

```
Offer {
  inputs: [{
    nullifier: 0xnull...,
    type_value_commit: Pedersen(NIGHT, 100),
    merkle_root: merkle_root,
    merkle_path: merkle_path,
    zk_proof: generateInputProof(...)
  }],
  outputs: [
    {
      commitment: recipient_commitment,
      type_value_commit: Pedersen(NIGHT, 50),
      ciphertext: encryptForRecipient(50, randomness),
      zk_proof: generateOutputProof(...)
    },
    {
      commitment: change_commitment,
      type_value_commit: Pedersen(NIGHT, 50),
      ciphertext: encryptForSelf(50, randomness),
      zk_proof: generateOutputProof(...)
    }
  ],
  balance: { NIGHT: 0 }  // 100 in, 100 out
}
```

### Step 7: Assemble Transaction

```
Transaction {
  guaranteed_zswap_offer: Offer,
  fallible_zswap_offer: None,
  contract_calls: None,
  binding_randomness: fresh_random()
}
```

### Step 8: Submit

Broadcast transaction to network.

## Contract Interaction Transaction

### Goal
Call a contract function while also transferring tokens.

### Step 1: Prepare Contract Call

```
ContractCall {
  contract_address: 0xcontract...,
  entry_point: "deposit",
  transcript: {
    state_updates: [(counter, 5, 6)],
    coin_receives: [{ value: 10, type: NIGHT }]
  },
  zk_proof: generateContractProof(witness_data)
}
```

### Step 2: Prepare Zswap for Contract

Create output targeted to contract:
```
contract_coin = Output {
  commitment: Pedersen(NIGHT, 10, contract_address, r),
  type_value_commit: Pedersen(NIGHT, 10),
  contract_address: Some(0xcontract...),
  zk_proof: ...
}
```

### Step 3: Build Combined Transaction

```
Transaction {
  guaranteed_zswap_offer: {
    inputs: [my_input],
    outputs: [contract_coin, my_change],
    balance: { NIGHT: 0 }
  },
  contract_calls: {
    guaranteed: [ContractCall],
    fallible: []
  },
  binding_randomness: ...
}
```

### Step 4: Generate Schnorr Proof

Prove contract section doesn't inject value:
```
schnorr_proof = generateSchnorrProof(contract_calls, binding_randomness)
```

## Atomic Swap Transaction

### Goal
Exchange tokens atomically with another party.

### My Offer (Partial)

```
MyOffer {
  inputs: [my_token_a_input],  // Spending 100 TOKEN_A
  outputs: [],
  balance: {
    TOKEN_A: -100,  // Giving away
    TOKEN_B: +50    // Want to receive
  }
}
```

### Counterparty Offer (Partial)

```
TheirOffer {
  inputs: [their_token_b_input],  // Spending 50 TOKEN_B
  outputs: [
    my_token_b_output,   // 50 TOKEN_B to me
    their_token_a_output // 100 TOKEN_A to them
  ],
  balance: {
    TOKEN_A: +100,  // Receiving
    TOKEN_B: -50    // Giving away
  }
}
```

### Merged Transaction

```
MergedOffer {
  inputs: [my_token_a_input, their_token_b_input],
  outputs: [my_token_b_output, their_token_a_output],
  balance: {
    TOKEN_A: -100 + 100 = 0,
    TOKEN_B: +50 - 50 = 0
  }
}

Transaction {
  guaranteed_zswap_offer: MergedOffer,
  binding_randomness: ...
}
```

## Common Patterns

### Pattern: Fee Payment

Always include slightly more input than output:
```
Input: 100 NIGHT
Outputs: 50 (recipient) + 49.9 (change)
Fee: 0.1 NIGHT (implicit)
```

### Pattern: Multiple Inputs

Combine multiple small coins:
```
inputs: [coin1, coin2, coin3]  // Total 30 + 50 + 20 = 100
outputs: [recipient_90, change_10]
```

### Pattern: Multiple Recipients

Single transaction, multiple outputs:
```
outputs: [
  recipient1_output,
  recipient2_output,
  recipient3_output,
  change_output
]
```
