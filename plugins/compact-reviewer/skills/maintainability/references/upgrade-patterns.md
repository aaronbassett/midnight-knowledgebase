# Upgrade Patterns for Compact Contracts

Strategies for handling contract upgrades and migrations.

## Upgrade Considerations

### What Can Change

| Aspect | Upgradeable? | Notes |
|--------|--------------|-------|
| Circuit logic | Via proxy pattern | Complex |
| Ledger structure | Limited | Migration required |
| Adding ledgers | Yes | Backward compatible |
| Removing ledgers | No | Data lost |
| Type changes | No | Breaking change |

### What Cannot Change

- Deployed contract bytecode
- Existing ledger types
- Proof structure
- Committed values

---

## Pattern: Versioned State

Store version alongside data for future migrations.

```compact
const CONTRACT_VERSION: Uint<8> = 1;

struct VersionedData {
    version: Uint<8>,
    data: Bytes<128>
}

ledger user_data: Map<Bytes<32>, VersionedData>;

circuit get_user_data(user_id: Bytes<32>): UserData {
    const versioned = user_data.lookup(user_id);

    if versioned.version == 1 {
        return decode_v1(versioned.data);
    }
    if versioned.version == 2 {
        return decode_v2(versioned.data);
    }

    // Handle unknown version
    assert false;
}
```

---

## Pattern: Proxy Delegation

Separate logic from state for upgradeable contracts.

```compact
// Storage Contract (immutable, holds state)
ledger implementation: Cell<Bytes<32>>;  // Address of logic contract
ledger data: Map<Bytes<32>, Field>;

export circuit upgrade(new_implementation: Bytes<32>): [] {
    require_admin();
    implementation.write(new_implementation);
}

export circuit call(selector: Bytes<4>, args: Bytes<128>): Bytes<128> {
    const impl = implementation.read();
    return delegate_call(impl, selector, args);
}
```

**Note**: This is a conceptual pattern. Compact may not support delegate calls directly.

---

## Pattern: Feature Flags

Enable/disable features without redeployment.

```compact
struct Features {
    enable_transfers: Boolean,
    enable_staking: Boolean,
    enable_governance: Boolean,
    max_transfer_amount: Uint<64>
}

ledger features: Cell<Features>;

circuit require_feature(feature: Uint<8>): [] {
    const f = features.read();
    if feature == 0 { assert f.enable_transfers; }
    if feature == 1 { assert f.enable_staking; }
    if feature == 2 { assert f.enable_governance; }
}

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    require_feature(0);  // Check transfers enabled
    const f = features.read();
    assert amount <= f.max_transfer_amount;
    // ... transfer logic
}

export circuit update_features(new_features: Features): [] {
    require_admin();
    features.write(new_features);
}
```

---

## Pattern: Migration Support

Support gradual data migration.

```compact
ledger old_balances: Map<Bytes<32>, Uint<64>>;  // v1 format
ledger new_balances: Map<Bytes<32>, BalanceData>;  // v2 format
ledger migrated: Set<Bytes<32>>;  // Track migrated users

circuit ensure_migrated(user_id: Bytes<32>): [] {
    if !migrated.member(user_id) {
        // Migrate on first access
        const old_balance = old_balances.lookup(user_id);
        new_balances.write(user_id, BalanceData {
            balance: old_balance,
            last_updated: currentBlockHeight()
        });
        migrated.insert(user_id);
    }
}

export circuit get_balance(user_id: Bytes<32>): BalanceData {
    ensure_migrated(user_id);
    return disclose(new_balances.lookup(user_id));
}
```

---

## Pattern: Circuit Registry

Multiple implementation versions with selector.

```compact
enum CircuitVersion { V1, V2, V3 }

ledger active_version: Cell<CircuitVersion>;

export circuit transfer_v1(to: Bytes<32>, amount: Uint<64>): [] {
    assert active_version.read() == CircuitVersion.V1;
    // v1 implementation
}

export circuit transfer_v2(to: Bytes<32>, amount: Uint<64>): [] {
    assert active_version.read() == CircuitVersion.V2;
    // v2 implementation with new features
}

export circuit set_version(version: CircuitVersion): [] {
    require_admin();
    active_version.write(version);
}
```

---

## Pattern: Emergency Pause

Disable functionality during issues.

```compact
ledger paused: Cell<Boolean>;
ledger pause_reason: Cell<Bytes<64>>;

circuit require_not_paused(): [] {
    assert !paused.read();
}

export circuit pause(reason: Bytes<64>): [] {
    require_admin();
    paused.write(true);
    pause_reason.write(reason);
}

export circuit unpause(): [] {
    require_admin();
    paused.write(false);
}

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    require_not_paused();
    // ... transfer logic
}
```

---

## Pattern: Timelock Changes

Delay critical changes for safety.

```compact
struct PendingChange {
    new_value: Field,
    execute_after: Uint<64>,
    cancelled: Boolean
}

ledger pending_changes: Map<Bytes<32>, PendingChange>;
const TIMELOCK_DELAY: Uint<64> = 86400;  // 1 day in blocks

export circuit propose_change(change_id: Bytes<32>, new_value: Field): [] {
    require_admin();
    pending_changes.write(change_id, PendingChange {
        new_value: new_value,
        execute_after: currentBlockHeight() + TIMELOCK_DELAY,
        cancelled: false
    });
}

export circuit cancel_change(change_id: Bytes<32>): [] {
    require_admin();
    const change = pending_changes.lookup(change_id);
    pending_changes.write(change_id, PendingChange {
        new_value: change.new_value,
        execute_after: change.execute_after,
        cancelled: true
    });
}

export circuit execute_change(change_id: Bytes<32>): [] {
    require_admin();
    const change = pending_changes.lookup(change_id);
    assert !change.cancelled;
    assert currentBlockHeight() >= change.execute_after;

    // Apply the change
    apply_change(change_id, change.new_value);
}
```

---

## Backward Compatibility

### Adding New Features

```compact
// ✅ Safe: Adding new circuit
export circuit new_feature(): [] { }

// ✅ Safe: Adding new ledger
ledger new_data: Map<Bytes<32>, Field>;

// ✅ Safe: Adding optional field (with default)
struct UserData {
    name: Bytes<64>,
    balance: Uint<64>,
    // New field - existing data treated as 0
    rewards: Uint<64>
}
```

### Breaking Changes

```compact
// ❌ Breaking: Changing parameter type
// Before:
export circuit transfer(amount: Uint<64>): []
// After:
export circuit transfer(amount: Uint<128>): []

// ❌ Breaking: Removing circuit
// Clients depending on it will fail

// ❌ Breaking: Changing ledger type
// Existing data incompatible
```

---

## Migration Checklist

| Step | Action |
|------|--------|
| 1 | Design new version with backward compatibility |
| 2 | Add migration logic for data |
| 3 | Test migration with real data |
| 4 | Deploy new version |
| 5 | Migrate data gradually (if large) |
| 6 | Verify migration complete |
| 7 | Disable old version (if applicable) |

---

## Summary

| Pattern | Use Case |
|---------|----------|
| Versioned State | Future data format changes |
| Proxy Delegation | Upgradeable logic |
| Feature Flags | Toggle features |
| Migration Support | Gradual data migration |
| Circuit Registry | Multiple versions |
| Emergency Pause | Safety stop |
| Timelock | Safe critical changes |
