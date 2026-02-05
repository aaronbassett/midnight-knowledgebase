# Token Operations

Reference for token-related functions in `CompactStandardLibrary`.

## Overview

| Function | Purpose |
|----------|---------|
| `mintToken(info)` | Create new tokens |
| `send(coin, recipient)` | Send tokens to an address |
| `receive()` | Receive tokens in a circuit |
| `mergeCoin(coins)` | Combine multiple coins into one |

## Key Concepts

### UTXO Model

Midnight uses a **UTXO (Unspent Transaction Output)** model for tokens:

- Tokens exist as discrete "coins" (UTXOs)
- Each coin has a value, type, and owner
- Spending a coin consumes it entirely
- Change is returned as a new coin

### Token Types

| Type | Description |
|------|-------------|
| Native token (NIGHT) | The platform's native currency |
| Custom tokens | Contract-issued tokens with unique type IDs |

Custom token type = `Hash(contract_address, domain_separator)`

### CoinInfo Structure

```compact
struct CoinInfo {
    value: Uint<64>,       // Amount
    token_type: Bytes<32>, // Token type identifier
    owner: Bytes<32>       // Owner's public key/address
}
```

---

## mintToken

Creates new tokens. Only the issuing contract can mint its token type.

### Signature

```compact
mintToken(info: CoinInfo): Coin
```

### Parameters

- `info`: A `CoinInfo` struct specifying value, type, and recipient

### Example: Basic Token Minting

```compact
import { mintToken, CoinInfo } from "CompactStandardLibrary";

ledger total_supply: Counter;

// Token type derived from this contract's address
const TOKEN_DOMAIN: Bytes<32> = 0x...;

export circuit mint(amount: Uint<64>, recipient: Bytes<32>): [] {
    const info = CoinInfo {
        value: amount,
        token_type: TOKEN_DOMAIN,
        owner: recipient
    };

    mintToken(info);
    total_supply.increment(amount);
}
```

### Example: Controlled Minting

```compact
import { mintToken, CoinInfo } from "CompactStandardLibrary";

ledger admin: Cell<Bytes<32>>;
ledger total_supply: Counter;
ledger max_supply: Cell<Uint<64>>;

const TOKEN_DOMAIN: Bytes<32> = 0x...;

witness get_caller(): Bytes<32>;

export circuit mint_controlled(amount: Uint<64>, recipient: Bytes<32>): [] {
    // Only admin can mint
    const caller = get_caller();
    assert disclose(caller) == admin.read(), "Only admin";

    // Check supply cap
    const new_total = total_supply.value() + amount;
    assert new_total <= max_supply.read(), "Exceeds max supply";

    const info = CoinInfo {
        value: amount,
        token_type: TOKEN_DOMAIN,
        owner: recipient
    };

    mintToken(info);
    total_supply.increment(amount);
}
```

---

## send

Sends tokens from the contract to a recipient address.

### Signature

```compact
send(coin: Coin, recipient: Bytes<32>): []
```

### Parameters

- `coin`: The coin to send
- `recipient`: The recipient's address/public key

### Example: Simple Send

```compact
import { send } from "CompactStandardLibrary";

export circuit transfer_from_treasury(
    coin: Coin,
    recipient: Bytes<32>
): [] {
    send(coin, recipient);
}
```

### Example: Reward Distribution

```compact
import { send, mintToken, CoinInfo } from "CompactStandardLibrary";

ledger rewards_pool: Counter;

const TOKEN_DOMAIN: Bytes<32> = 0x...;

export circuit claim_reward(recipient: Bytes<32>, amount: Uint<64>): [] {
    // Verify eligible (simplified)
    assert amount <= rewards_pool.value(), "Insufficient rewards";

    // Mint reward tokens
    const info = CoinInfo {
        value: amount,
        token_type: TOKEN_DOMAIN,
        owner: recipient
    };

    const reward_coin = mintToken(info);
    send(reward_coin, recipient);

    rewards_pool.increment(0 - amount);  // Decrease pool
}
```

---

## receive

Receives tokens sent to the contract in a transaction.

### Signature

```compact
receive(): Vector<Coin, N>
```

Returns a vector of coins sent to this circuit call.

### Example: Deposit

```compact
import { receive } from "CompactStandardLibrary";

ledger deposits: Map<Bytes<32>, Uint<64>>;

witness get_depositor(): Bytes<32>;

export circuit deposit(): Uint<64> {
    const depositor = disclose(get_depositor());
    const coins = receive();

    var total: Uint<64> = 0;

    // Sum all received coins
    for i in 0..coins.length() {
        total = total + coins[i].value;
    }

    // Record deposit
    const current = deposits.lookup(depositor);
    const new_balance = if current is Maybe::Some(b) { b + total } else { total };
    deposits.insert(depositor, new_balance);

    return total;
}
```

### Example: Token-Specific Deposit

```compact
import { receive, Maybe } from "CompactStandardLibrary";

ledger accepted_token: Cell<Bytes<32>>;
ledger balances: Map<Bytes<32>, Uint<64>>;

witness get_depositor(): Bytes<32>;

export circuit deposit_token(): Uint<64> {
    const depositor = disclose(get_depositor());
    const accepted = accepted_token.read();
    const coins = receive();

    var total: Uint<64> = 0;

    for i in 0..coins.length() {
        // Only accept specified token type
        if coins[i].token_type == accepted {
            total = total + coins[i].value;
        }
    }

    assert total > 0, "No valid tokens received";

    // Update balance
    const current = balances.lookup(depositor);
    const new_balance = if current is Maybe::Some(b) { b + total } else { total };
    balances.insert(depositor, new_balance);

    return total;
}
```

---

## mergeCoin

Combines multiple coins of the same type into a single coin.

### Signature

```compact
mergeCoin(coins: Vector<Coin, N>): Coin
```

### Parameters

- `coins`: Vector of coins to merge (must be same token type)

### Returns

A single coin with the combined value.

### Example: Consolidate Coins

```compact
import { mergeCoin, receive } from "CompactStandardLibrary";

export circuit consolidate(): Coin {
    const coins = receive();

    // All coins must be same type
    const merged = mergeCoin(coins);

    return merged;
}
```

### Example: Merge Before Transfer

```compact
import { mergeCoin, send, receive } from "CompactStandardLibrary";

export circuit batch_transfer(recipient: Bytes<32>): [] {
    const coins = receive();

    // Merge all coins into one
    const merged = mergeCoin(coins);

    // Send the merged coin
    send(merged, recipient);
}
```

---

## CoinInfo

Structure representing token information.

### Fields

```compact
struct CoinInfo {
    value: Uint<64>,       // Token amount
    token_type: Bytes<32>, // Token type identifier
    owner: Bytes<32>       // Owner address
}
```

### Example: Reading Coin Info

```compact
import { receive, CoinInfo } from "CompactStandardLibrary";

export circuit inspect_deposit(): (Uint<64>, Bytes<32>) {
    const coins = receive();

    assert coins.length() > 0, "No coins";

    const first = coins[0];
    return (first.value, first.token_type);
}
```

---

## Common Patterns

### Token Swap

```compact
import { receive, send, mintToken, CoinInfo } from "CompactStandardLibrary";

ledger exchange_rate: Cell<Uint<64>>;

const MY_TOKEN: Bytes<32> = 0x...;
const NATIVE_TOKEN: Bytes<32> = 0x...;

export circuit swap_for_tokens(recipient: Bytes<32>): [] {
    const coins = receive();
    const rate = exchange_rate.read();

    var native_amount: Uint<64> = 0;

    // Sum native tokens received
    for i in 0..coins.length() {
        if coins[i].token_type == NATIVE_TOKEN {
            native_amount = native_amount + coins[i].value;
        }
    }

    // Calculate tokens to mint
    const tokens_to_mint = native_amount * rate;

    // Mint and send tokens
    const info = CoinInfo {
        value: tokens_to_mint,
        token_type: MY_TOKEN,
        owner: recipient
    };

    mintToken(info);
}
```

### Escrow Pattern

```compact
import { receive, send, Maybe } from "CompactStandardLibrary";

struct Escrow {
    depositor: Bytes<32>,
    recipient: Bytes<32>,
    amount: Uint<64>,
    released: Boolean
}

ledger escrows: Map<Bytes<32>, Escrow>;
ledger held_coins: Map<Bytes<32>, Coin>;

witness get_escrow_id(): Bytes<32>;

export circuit create_escrow(recipient: Bytes<32>): [] {
    const coins = receive();
    const merged = mergeCoin(coins);
    const escrow_id = disclose(get_escrow_id());

    const escrow = Escrow {
        depositor: coins[0].owner,
        recipient: recipient,
        amount: merged.value,
        released: false
    };

    escrows.insert(escrow_id, escrow);
    held_coins.insert(escrow_id, merged);
}

export circuit release_escrow(): [] {
    const escrow_id = disclose(get_escrow_id());

    const escrow_opt = escrows.lookup(escrow_id);
    assert escrow_opt is Maybe::Some(_), "Escrow not found";

    if escrow_opt is Maybe::Some(escrow) {
        assert !escrow.released, "Already released";

        const coin_opt = held_coins.lookup(escrow_id);
        if coin_opt is Maybe::Some(coin) {
            send(coin, escrow.recipient);
        }

        // Mark as released
        const updated = Escrow {
            depositor: escrow.depositor,
            recipient: escrow.recipient,
            amount: escrow.amount,
            released: true
        };
        escrows.insert(escrow_id, updated);
    }
}
```

---

## Privacy Considerations

### Shielded Tokens

By default, tokens on Midnight are **shielded**:
- Value is hidden in commitments
- Token type can be hidden
- Owner is hidden

### Viewing Keys

For regulatory compliance, viewing keys can be shared to allow auditing without changing the contract code.

### Unshielded Transfers

Contracts can accept both shielded and unshielded inputs - they are handled identically in Compact code.
