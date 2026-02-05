# Web3 Comparison: Hardhat/Foundry Testing vs Midnight

A guide for developers transitioning from Ethereum testing frameworks to Midnight DApp testing.

## Overview

Testing Midnight DApps differs significantly from Ethereum testing due to ZK proofs, privacy requirements, and the dual-state model. This guide maps familiar concepts to their Midnight equivalents.

## Testing Environments

| Aspect | Ethereum | Midnight |
|--------|----------|----------|
| Local node | Hardhat Network, Anvil | Mock providers |
| Testnet | Goerli, Sepolia | Midnight Testnet |
| Mainnet fork | `hardhat node --fork` | Not applicable (privacy) |
| In-memory test | Yes (instant) | Yes (with mocks) |
| Proof generation | N/A | Seconds per tx |

### Key Difference: No Local Node

Ethereum tools like Hardhat Network spin up a local blockchain. Midnight testing uses **mock providers** instead because:

1. **Proof generation requires proof server** - Can't run entirely in-memory
2. **Privacy model differs** - State isn't fully observable
3. **Architecture is different** - No EVM equivalent

## Test Setup Comparison

### Ethereum (Hardhat)

```typescript
// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: "0.8.19",
  networks: {
    hardhat: {
      // Local in-memory blockchain
    },
    goerli: {
      url: process.env.GOERLI_RPC,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
};

export default config;
```

### Midnight (Vitest + Mocks)

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});

// test/setup.ts
import { MockWallet } from "./mocks/MockWallet";
import { createMockProofProvider } from "./mocks/mockProofProvider";

beforeEach(() => {
  // Inject mock wallet (replaces Hardhat's auto-signers)
  globalThis.window = {
    midnight: {
      mnLace: new MockWallet().connector,
    },
  };
});
```

## Contract Deployment

### Ethereum (Hardhat)

```typescript
import { ethers } from "hardhat";

async function deployToken() {
  const Token = await ethers.getContractFactory("Token");
  const token = await Token.deploy("MyToken", "MTK");
  await token.waitForDeployment();

  return token;
}
```

### Midnight

```typescript
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";

async function deployToken(walletAPI, serviceURIs) {
  const { code, initialState } = await loadContract("Token");

  const contract = await deployContract({
    code,
    initialState,
    walletAPI,
    serviceURIs,
  });

  return contract;
}

// In tests with mocks
function createMockContract(initialState) {
  return {
    state: createMockState(initialState),
    callTx: createMockCallTx(),
  };
}
```

## Signers vs Wallet Providers

### Ethereum Signers

```typescript
import { ethers } from "hardhat";

const [owner, user1, user2] = await ethers.getSigners();

// Sign transaction
const tx = await token.connect(user1).transfer(user2.address, 100);
await tx.wait();
```

### Midnight Mock Wallet

```typescript
import { MockWallet } from "./MockWallet";

// Create mock wallets for different users
const ownerWallet = new MockWallet({ address: "addr_owner..." });
const user1Wallet = new MockWallet({ address: "addr_user1..." });

// "Connect" as different users
globalThis.window.midnight.mnLace = user1Wallet.connector;

// Transaction includes witnesses (private data)
const tx = await contract.callTx.transfer(
  "addr_user2...",
  100n,
  user1Witnesses
);
```

### Key Difference: Witnesses

Ethereum transactions only need a signature. Midnight transactions need **witnesses** that provide private data:

```typescript
// Ethereum - just sign
await token.connect(signer).transfer(to, amount);

// Midnight - provide witnesses for private data
const witnesses = {
  get_balance: ({ privateState }) => privateState.balance,
  get_nonce: ({ privateState }) => privateState.nonce,
};

await contract.callTx.transfer(to, amount, witnesses);
```

## State Reading

### Ethereum

```typescript
// All state is public and directly readable
const balance = await token.balanceOf(user.address);
const totalSupply = await token.totalSupply();
const owner = await token.owner();
```

### Midnight

```typescript
// Public state - similar to Ethereum
const totalSupply = await contract.state.total_supply();
const publicBalance = await contract.state.balances.get(address);

// Private state - only accessible locally through witnesses
// CANNOT read another user's private state
const witnesses = {
  get_my_balance: ({ privateState }) => privateState.balance,
};
```

### Testing State in Midnight

```typescript
// Test public state
expect(await contract.state.total_supply()).toBe(1_000_000n);

// Test private state through witness execution
const context = {
  privateState: testPrivateState,
  setPrivateState: () => {},
};

expect(witnesses.get_my_balance(context)).toBe(500n);
```

## Event Testing

### Ethereum

```typescript
// Listen for events
await expect(token.transfer(user.address, 100))
  .to.emit(token, "Transfer")
  .withArgs(owner.address, user.address, 100);

// Query past events
const filter = token.filters.Transfer(owner.address);
const events = await token.queryFilter(filter);
```

### Midnight

Midnight doesn't have Ethereum-style events. Instead:

```typescript
// Option 1: Monitor state changes
const balanceBefore = await contract.state.balances.get(address);
await submitTransfer(to, amount);
const balanceAfter = await contract.state.balances.get(address);

expect(balanceAfter).toBe(balanceBefore - amount);

// Option 2: Track transaction submissions in mock
const mockWallet = new MockWallet();
mockWallet.onTransaction((tx) => {
  console.log("Transaction submitted:", tx);
});

// After transaction
expect(mockWallet.getTransactions()).toHaveLength(1);
```

## Time Manipulation

### Ethereum (Hardhat)

```typescript
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Advance time
await time.increase(3600); // 1 hour

// Set specific timestamp
await time.setNextBlockTimestamp(futureTimestamp);

// Mine blocks
await mine(10);
```

### Midnight

Time manipulation isn't directly possible, but you can:

```typescript
// Option 1: Mock timestamp in witnesses
const witnesses = {
  get_current_time: () => {
    return testTimestamp; // Controlled in test
  },
};

// Option 2: Use dependency injection
function createWitnesses(getCurrentTime: () => bigint) {
  return {
    check_expiry: ({ privateState }) => {
      return privateState.expiry > getCurrentTime();
    },
  };
}

// In tests
const mockTime = vi.fn(() => 1700000000n);
const witnesses = createWitnesses(mockTime);

// Advance time
mockTime.mockReturnValue(1700003600n); // 1 hour later
```

## Error Testing

### Ethereum (Hardhat/Chai)

```typescript
import { expect } from "chai";

// Test revert
await expect(
  token.connect(user).transfer(other.address, 1000000)
).to.be.revertedWith("Insufficient balance");

// Test custom error
await expect(
  token.connect(user).approve(ethers.ZeroAddress, 100)
).to.be.revertedWithCustomError(token, "InvalidAddress");
```

### Midnight (Vitest)

```typescript
import { expect, it } from "vitest";
import { WitnessError } from "../witnesses";

// Test witness errors
it("should throw for insufficient balance", () => {
  const context = {
    privateState: { balance: 50n },
    setPrivateState: () => {},
  };

  expect(() =>
    witnesses.check_balance(context, 100n)
  ).toThrow("Insufficient balance");
});

// Test typed errors
it("should throw typed error for expired credential", () => {
  expect(() =>
    witnesses.get_credential(context, expiredCredentialId)
  ).toThrow(WitnessError);

  try {
    witnesses.get_credential(context, expiredCredentialId);
  } catch (error) {
    expect(error).toBeInstanceOf(WitnessError);
    expect((error as WitnessError).code).toBe("EXPIRED");
  }
});

// Test transaction rejection (in mock)
it("should handle user rejection", async () => {
  mockWallet.rejectNextTransaction("User rejected");

  await expect(
    walletAPI.submitTransaction(tx)
  ).rejects.toThrow("User rejected");
});
```

## Test Speed Comparison

| Test Type | Ethereum (Hardhat) | Midnight (Mocked) | Midnight (Real) |
|-----------|-------------------|-------------------|-----------------|
| Unit test | ~5ms | ~5ms | N/A |
| Contract call | ~50ms | ~10ms | 2-30s |
| 100 tx test | ~5s | ~1s | 3-50 min |
| Full suite | ~30s | ~10s | Hours |

## Migration Checklist

### From Hardhat/Foundry to Midnight Testing

- [ ] Replace `hardhat.config.ts` with Vitest config
- [ ] Replace signers with `MockWallet` instances
- [ ] Add witness testing (no Ethereum equivalent)
- [ ] Replace contract factories with mock contracts or real deployment
- [ ] Update state reading for dual-state model
- [ ] Replace event testing with state/transaction monitoring
- [ ] Replace time helpers with controlled timestamps
- [ ] Update error matchers for witness errors

### Test Pattern Mapping

| Hardhat Pattern | Midnight Pattern |
|-----------------|------------------|
| `ethers.getSigners()` | `new MockWallet()` |
| `Contract.deploy()` | Mock contract or testnet deploy |
| `contract.read()` | `contract.state.*` |
| `contract.write()` | `contract.callTx.*` + witnesses |
| `expect().to.emit()` | Track state changes |
| `time.increase()` | Mock timestamp in witnesses |
| `loadFixture()` | Vitest `beforeEach` |

## Framework Feature Comparison

| Feature | Hardhat | Foundry | Midnight |
|---------|---------|---------|----------|
| Language | TS/JS | Solidity | TS/JS |
| Test runner | Mocha/Chai | Built-in | Vitest |
| Mocking | ethers mocks | Forge mocks | Custom mocks |
| Fuzzing | No | Yes | No (manual) |
| Gas reporting | Yes | Yes | N/A |
| Coverage | Yes | Yes | Vitest coverage |
| Forking | Yes | Yes | No |
| Snapshots | Yes | Yes | Vitest snapshots |
| Watch mode | Yes | Yes | Yes |

## Example: Full Test Comparison

### Ethereum (Hardhat)

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Token", () => {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy("Test", "TST");

    return { token, owner, user1, user2 };
  }

  it("should transfer tokens", async () => {
    const { token, owner, user1 } = await loadFixture(deployFixture);

    await token.transfer(user1.address, 100);

    expect(await token.balanceOf(user1.address)).to.equal(100);
    expect(await token.balanceOf(owner.address)).to.equal(999900);
  });
});
```

### Midnight (Vitest)

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MockWallet } from "./mocks/MockWallet";
import { createMockContract } from "./mocks/mockContract";
import { witnesses, createInitialPrivateState } from "../src/witnesses";

describe("Token", () => {
  let ownerWallet: MockWallet;
  let user1Wallet: MockWallet;
  let contract: MockContract;
  let ownerPrivateState: PrivateState;

  beforeEach(() => {
    ownerWallet = new MockWallet({ address: "addr_owner" });
    user1Wallet = new MockWallet({ address: "addr_user1" });

    contract = createMockContract({
      state: {
        balances: new Map([["addr_owner", 1_000_000n]]),
        totalSupply: 1_000_000n,
      },
    });

    ownerPrivateState = createInitialPrivateState(new Uint8Array(32));
    ownerPrivateState.balance = 1_000_000n;
  });

  it("should transfer tokens", async () => {
    // Verify witness returns correct balance
    const context = {
      privateState: ownerPrivateState,
      setPrivateState: (s: PrivateState) => { ownerPrivateState = s; },
    };

    expect(witnesses.get_balance(context)).toBe(1_000_000n);

    // Simulate transfer (with mock contract)
    await contract.callTx.transfer("addr_user1", 100n, witnesses);

    // Verify state changed
    expect(await contract.state.balances.get("addr_user1")).toBe(100n);
    expect(await contract.state.balances.get("addr_owner")).toBe(999_900n);
  });
});
```

## Summary

| Aspect | Ethereum Approach | Midnight Approach |
|--------|-------------------|-------------------|
| Test speed | Fast (local node) | Fast (mocks) or slow (real) |
| State visibility | All public | Public + private |
| Signing | Instant ECDSA | Seconds (ZK proofs) |
| Local testing | Hardhat Network | Mock providers |
| CI/CD | Standard | Mocks for speed, testnet for validation |
| Debugging | Console.log, traces | Same + witness logging |
