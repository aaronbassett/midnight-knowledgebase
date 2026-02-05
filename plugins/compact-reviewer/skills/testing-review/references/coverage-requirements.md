# Test Coverage Requirements

Guidelines for comprehensive test coverage in Compact contracts.

## Coverage Levels

### Level 1: Minimum Viable (≥60%)

**For prototypes and exploratory code**:
- Happy path for each exported circuit
- Basic authorization checks
- Critical failure cases

### Level 2: Standard (≥80%)

**For production code**:
- All Level 1
- All input validation paths
- All authorization scenarios
- Key edge cases
- State transition coverage

### Level 3: Critical (≥90%)

**For security-critical code**:
- All Level 2
- All edge cases
- Negative testing (invalid inputs)
- Concurrency scenarios
- Integration tests

### Level 4: Audited (100%)

**For audited contracts**:
- All Level 3
- Every code path exercised
- Mutation testing passed
- Formal verification (if applicable)

---

## Coverage by Circuit Type

### Authorization Circuits

**Required tests**:
```
✓ Authorized caller succeeds
✓ Unauthorized caller fails
✓ Expired authorization fails
✓ Revoked authorization fails
✓ Edge: Zero/null authorization
```

### Transfer/Payment Circuits

**Required tests**:
```
✓ Normal transfer succeeds
✓ Insufficient balance fails
✓ Zero amount handling
✓ Maximum amount handling
✓ Self-transfer handling
✓ To zero address fails
✓ Edge: Exact balance transfer
```

### State Modification Circuits

**Required tests**:
```
✓ State changes correctly
✓ State preserved on failure
✓ State initialized correctly
✓ Repeated operations work
✓ Edge: Uninitialized state
```

### Query Circuits

**Required tests**:
```
✓ Returns correct value
✓ Handles missing data
✓ Handles empty collections
✓ Large data sets work
```

---

## Testing Patterns

### Happy Path Testing

```typescript
describe('transfer', () => {
  it('should transfer tokens successfully', async () => {
    // Setup
    const sender = await createUser(1000);
    const recipient = await createUser(0);

    // Act
    await contract.transfer(recipient.address, 100);

    // Assert
    expect(await contract.balanceOf(sender)).toBe(900);
    expect(await contract.balanceOf(recipient)).toBe(100);
  });
});
```

### Authorization Testing

```typescript
describe('admin functions', () => {
  it('should allow admin to pause', async () => {
    await contract.pause({ from: admin });
    expect(await contract.isPaused()).toBe(true);
  });

  it('should reject non-admin pause attempt', async () => {
    await expect(
      contract.pause({ from: regularUser })
    ).rejects.toThrow('Unauthorized');
  });
});
```

### Edge Case Testing

```typescript
describe('edge cases', () => {
  it('should handle zero transfer amount', async () => {
    await expect(
      contract.transfer(recipient, 0)
    ).rejects.toThrow('Amount must be positive');
  });

  it('should handle exact balance transfer', async () => {
    const balance = await contract.balanceOf(sender);
    await contract.transfer(recipient, balance);
    expect(await contract.balanceOf(sender)).toBe(0);
  });
});
```

---

## Coverage Metrics

### What to Measure

| Metric | Description | Target |
|--------|-------------|--------|
| Line coverage | % of lines executed | ≥80% |
| Branch coverage | % of branches taken | ≥80% |
| Circuit coverage | % of circuits tested | 100% |
| Path coverage | % of paths exercised | ≥70% |

### What NOT to Rely On

- High coverage ≠ good tests
- 100% coverage doesn't find all bugs
- Coverage without assertions is useless

---

## Test Categories

### Unit Tests

**Purpose**: Test individual circuits in isolation.

```typescript
// Test a single circuit
it('should compute fee correctly', () => {
  const result = computeFee(1000);
  expect(result).toBe(30);  // 3% fee
});
```

### Integration Tests

**Purpose**: Test circuit interactions.

```typescript
// Test workflow
it('should complete full transfer flow', async () => {
  await contract.deposit(1000);
  await contract.transfer(recipient, 500);
  await contract.withdraw(250);

  expect(await contract.balanceOf(sender)).toBe(250);
  expect(await contract.balanceOf(recipient)).toBe(500);
});
```

### End-to-End Tests

**Purpose**: Test with real proof generation.

```typescript
// Test with actual proofs
it('should generate valid proof for transfer', async () => {
  const proof = await generateProof(transfer, inputs);
  const valid = await verifyProof(proof);
  expect(valid).toBe(true);
});
```

---

## Coverage Gaps to Look For

### Missing Authorization Tests

```
⚠️ No test for unauthorized access
⚠️ No test for role-based access
⚠️ No test for expired sessions
```

### Missing Validation Tests

```
⚠️ No test for zero values
⚠️ No test for overflow
⚠️ No test for invalid enum values
```

### Missing State Tests

```
⚠️ No test for uninitialized state
⚠️ No test for state after failure
⚠️ No test for concurrent modifications
```

---

## Test Documentation

### Test Naming

```typescript
// ✅ Good names
it('should transfer tokens when balance is sufficient', ...);
it('should revert when caller is not owner', ...);
it('should emit Transfer event on success', ...);

// ❌ Poor names
it('test1', ...);
it('should work', ...);
it('transfer', ...);
```

### Test Organization

```typescript
describe('TokenContract', () => {
  describe('transfer', () => {
    describe('when balance is sufficient', () => {
      it('should update sender balance', ...);
      it('should update recipient balance', ...);
      it('should emit event', ...);
    });

    describe('when balance is insufficient', () => {
      it('should revert', ...);
      it('should not modify state', ...);
    });
  });
});
```

---

## Summary Checklist

| Category | Required Tests |
|----------|---------------|
| Happy path | Normal operation succeeds |
| Authorization | Auth checks enforced |
| Validation | Invalid inputs rejected |
| Boundaries | Edge values handled |
| State | Correct state changes |
| Failures | Proper error handling |
| Integration | Components work together |
