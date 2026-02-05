# Edge Case Testing Checklist

Comprehensive list of edge cases to test in Compact smart contracts.

## Numeric Edge Cases

### Zero Values

```
□ Zero amount in transfer
□ Zero balance in account
□ Zero fee calculation
□ Zero as divisor (should fail)
□ Zero items in collection
□ Zero as index
```

### Maximum Values

```
□ Maximum Uint<64> (2^64 - 1)
□ Maximum array index
□ Maximum iteration count
□ Sum that would overflow
□ Product that would overflow
```

### Boundary Values

```
□ Exactly at limit (amount == max)
□ One below limit (amount == max - 1)
□ One above limit (should fail)
□ First valid value
□ Last valid value
```

### Overflow/Underflow

```
□ Addition overflow
□ Multiplication overflow
□ Subtraction underflow (negative result)
□ Division that loses precision
```

---

## Collection Edge Cases

### Empty Collections

```
□ Empty map lookup
□ Empty set membership check
□ Empty vector access
□ Remove from empty collection
□ Iterate over empty collection
```

### Single Element

```
□ Collection with one item
□ Remove only item
□ Access index 0
```

### Full Collections

```
□ Add to full vector
□ Collection at capacity
□ Maximum size reached
```

### Indices

```
□ Index 0
□ Last valid index
□ Out of bounds index
□ Negative index (if applicable)
```

---

## Authorization Edge Cases

### Timing

```
□ Action at exact deadline
□ Action one block before deadline
□ Action one block after deadline
□ Action with expired credentials
```

### Role Transitions

```
□ User becomes admin
□ Admin loses admin status
□ Multiple roles simultaneously
□ No roles assigned
```

### Ownership

```
□ Ownership transfer to self
□ Ownership transfer to zero address
□ Ownership renouncement
□ Action after ownership transfer
```

---

## State Edge Cases

### Initialization

```
□ Use before initialization
□ Double initialization (should fail)
□ Partial initialization
□ Read uninitialized value
```

### State Transitions

```
□ Valid state transition
□ Invalid state transition (should fail)
□ Self-transition (same state)
□ Skip intermediate state
```

### Concurrent Access

```
□ Same-block transactions
□ Conflicting modifications
□ Read after concurrent write
```

---

## Input Validation Edge Cases

### String/Bytes

```
□ Empty bytes
□ Maximum length bytes
□ Invalid UTF-8 (if applicable)
□ All zeros
□ All ones (0xFF...)
```

### Addresses

```
□ Zero address
□ Self-address
□ Same from and to
□ Non-existent address
```

### Signatures

```
□ Valid signature
□ Invalid signature
□ Malformed signature
□ Signature for wrong message
□ Expired signature
```

---

## ZK-Specific Edge Cases

### Witness Values

```
□ Minimum witness value
□ Maximum witness value
□ Witness at type boundary
□ Witness that causes assertion to fail
```

### Merkle Proofs

```
□ Valid proof for existing leaf
□ Proof for non-existent leaf
□ Proof for wrong root
□ Proof with wrong depth
□ Stale proof (old root)
```

### Commitments

```
□ Commitment with known value
□ Opening with wrong value
□ Opening with wrong nonce
□ Double spending (nullifier check)
```

### Disclosure

```
□ Disclose minimum value
□ Disclose maximum value
□ Disclose computed value
□ Disclose conditional value
```

---

## Business Logic Edge Cases

### Transfers

```
□ Transfer to self
□ Transfer exact balance
□ Transfer more than balance (should fail)
□ Transfer with fee that exceeds amount
□ Multi-hop transfer
```

### Voting

```
□ First vote
□ Last vote before deadline
□ Vote for non-existent option
□ Double vote (should fail)
□ Vote change (if allowed)
```

### Auctions

```
□ First bid
□ Bid exactly at reserve
□ Bid below reserve (should fail)
□ Bid at exact deadline
□ Winning bid claim
□ Losing bid refund
```

---

## Error Handling Edge Cases

### Expected Failures

```
□ Assertion failure produces correct error
□ State unchanged after failure
□ Proper error message
□ No side effects on failure
```

### Recovery

```
□ Retry after failure
□ State correct after failed attempt
□ No double-spend on retry
```

---

## Test Template

```typescript
describe('Circuit: transfer', () => {
  // Happy path
  describe('normal operation', () => {
    it('should transfer tokens successfully', ...);
  });

  // Authorization
  describe('authorization', () => {
    it('should reject unauthorized caller', ...);
  });

  // Zero values
  describe('zero value handling', () => {
    it('should reject zero amount', ...);
    it('should handle zero balance', ...);
  });

  // Boundary values
  describe('boundary conditions', () => {
    it('should handle exact balance transfer', ...);
    it('should reject amount exceeding balance', ...);
  });

  // Special cases
  describe('special cases', () => {
    it('should handle self-transfer', ...);
    it('should reject zero address', ...);
  });
});
```

---

## Checklist Summary

| Category | Edge Cases |
|----------|------------|
| Numeric | Zero, max, boundaries, overflow |
| Collections | Empty, single, full, indices |
| Authorization | Timing, roles, ownership |
| State | Init, transitions, concurrent |
| Input | Empty, max, invalid |
| ZK-Specific | Witness, proofs, disclosure |
| Business | Domain-specific scenarios |
| Errors | Failures, recovery |
