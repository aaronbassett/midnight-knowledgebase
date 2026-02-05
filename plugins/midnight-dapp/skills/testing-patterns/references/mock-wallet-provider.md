# Mock Wallet Provider

Simulating the Lace wallet in tests allows automated testing without a browser extension or user interaction.

## Why Mock the Wallet?

### Browser Extension Limitations

The Lace wallet:
- Requires Chrome/browser extension installed
- Needs manual user approval for connections
- Cannot run in Node.js test environments
- Cannot run in CI/CD pipelines

### What a Mock Wallet Provides

| Capability | Real Lace | Mock Wallet |
|------------|-----------|-------------|
| Connection approval | User click required | Automatic/configurable |
| Transaction signing | User click required | Automatic/configurable |
| Balance tracking | Real chain state | Controlled test state |
| Network switching | UI required | Programmatic |
| CI/CD compatible | No | Yes |
| Test determinism | No | Yes |

## Mock Wallet Implementation

### Core Mock WalletAPI

```typescript
import type {
  DAppConnectorAPI,
  DAppConnectorWalletAPI,
  WalletState,
  ServiceURIs,
} from "./walletTypes";

interface MockWalletConfig {
  /** Initial wallet address */
  address: string;
  /** Initial coin public key */
  coinPublicKey: string;
  /** Initial encryption public key */
  encryptionPublicKey: string;
  /** Initial balance */
  balance: bigint;
  /** Service URIs to return */
  serviceURIs: ServiceURIs;
  /** Whether wallet is enabled initially */
  isEnabled: boolean;
  /** Simulated latency in ms */
  latencyMs: number;
}

const DEFAULT_CONFIG: MockWalletConfig = {
  address: "addr_test1qz_mock_wallet_address_for_testing_purposes_0123456789",
  coinPublicKey: "mock_coin_pub_key_32_bytes_00000000",
  encryptionPublicKey: "mock_enc_pub_key_32_bytes_000000000",
  balance: 1_000_000n, // 1M test tokens
  serviceURIs: {
    indexerUri: "http://localhost:8080",
    indexerWsUri: "ws://localhost:8080",
    proverServerUri: "http://localhost:6300",
  },
  isEnabled: false,
  latencyMs: 0,
};
```

### Full Mock Wallet Class

```typescript
export class MockWallet {
  private config: MockWalletConfig;
  private enabled: boolean;
  private transactions: MockTransaction[] = [];
  private nextTxShouldReject: string | null = null;
  private onTransactionSubmit?: (tx: MockTransaction) => void;

  constructor(config: Partial<MockWalletConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.isEnabled;
  }

  /**
   * The DAppConnectorAPI (injected into window.midnight.mnLace)
   */
  get connector(): DAppConnectorAPI {
    return {
      apiVersion: "1.0.0",
      name: "MockLace",

      enable: async (): Promise<DAppConnectorWalletAPI> => {
        await this.simulateLatency();
        this.enabled = true;
        return this.api;
      },

      isEnabled: async (): Promise<boolean> => {
        await this.simulateLatency();
        return this.enabled;
      },

      serviceUriConfig: async (): Promise<ServiceURIs> => {
        await this.simulateLatency();
        return this.config.serviceURIs;
      },
    };
  }

  /**
   * The WalletAPI (returned from enable())
   */
  get api(): DAppConnectorWalletAPI {
    return {
      state: async (): Promise<WalletState> => {
        await this.simulateLatency();
        this.ensureEnabled();

        return {
          address: this.config.address,
          coinPublicKey: this.config.coinPublicKey,
          encryptionPublicKey: this.config.encryptionPublicKey,
        };
      },

      balanceAndProveTransaction: async (
        tx: unknown,
        newCoins: unknown
      ): Promise<unknown> => {
        await this.simulateLatency();
        this.ensureEnabled();

        // Check for rejection
        if (this.nextTxShouldReject) {
          const message = this.nextTxShouldReject;
          this.nextTxShouldReject = null;
          throw new Error(message);
        }

        // Return the transaction as "proven"
        return { ...tx, proven: true, newCoins };
      },

      submitTransaction: async (provenTx: unknown): Promise<string> => {
        await this.simulateLatency();
        this.ensureEnabled();

        // Generate mock transaction hash
        const txHash = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        const transaction: MockTransaction = {
          hash: txHash,
          tx: provenTx,
          timestamp: Date.now(),
          status: "submitted",
        };

        this.transactions.push(transaction);
        this.onTransactionSubmit?.(transaction);

        return txHash;
      },
    };
  }

  // ===========================================================================
  // Test Control Methods
  // ===========================================================================

  /**
   * Configure the next transaction to be rejected
   */
  rejectNextTransaction(message: string = "User rejected"): void {
    this.nextTxShouldReject = message;
  }

  /**
   * Get current balance
   */
  getBalance(): bigint {
    return this.config.balance;
  }

  /**
   * Set balance for testing
   */
  setBalance(balance: bigint): void {
    this.config.balance = balance;
  }

  /**
   * Update balance (for simulating transfers)
   */
  adjustBalance(delta: bigint): void {
    this.config.balance += delta;
  }

  /**
   * Get submitted transactions
   */
  getTransactions(): ReadonlyArray<MockTransaction> {
    return this.transactions;
  }

  /**
   * Get last submitted transaction
   */
  getLastTransaction(): MockTransaction | undefined {
    return this.transactions[this.transactions.length - 1];
  }

  /**
   * Clear transaction history
   */
  clearTransactions(): void {
    this.transactions = [];
  }

  /**
   * Set callback for transaction submissions
   */
  onTransaction(callback: (tx: MockTransaction) => void): void {
    this.onTransactionSubmit = callback;
  }

  /**
   * Simulate disconnection
   */
  disconnect(): void {
    this.enabled = false;
  }

  /**
   * Change wallet address (simulates account switch)
   */
  switchAccount(newAddress: string): void {
    this.config.address = newAddress;
  }

  /**
   * Change network configuration
   */
  switchNetwork(network: "testnet" | "mainnet"): void {
    const baseUri = network === "testnet"
      ? "https://testnet.midnight.network"
      : "https://mainnet.midnight.network";

    this.config.serviceURIs = {
      indexerUri: `${baseUri}/indexer`,
      indexerWsUri: `${baseUri.replace("https", "wss")}/indexer`,
      proverServerUri: "http://localhost:6300",
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async simulateLatency(): Promise<void> {
    if (this.config.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.config.latencyMs));
    }
  }

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new Error("Wallet not enabled. Call enable() first.");
    }
  }
}

interface MockTransaction {
  hash: string;
  tx: unknown;
  timestamp: number;
  status: "submitted" | "confirmed" | "failed";
}
```

## Test Setup Patterns

### Injecting into Global Window

```typescript
// test/setup/mockWallet.ts
import { MockWallet } from "./MockWallet";

let mockWallet: MockWallet;

export function setupMockWallet(config?: Partial<MockWalletConfig>): MockWallet {
  mockWallet = new MockWallet(config);

  // Inject into window
  (globalThis as any).window = {
    midnight: {
      mnLace: mockWallet.connector,
    },
  };

  return mockWallet;
}

export function getMockWallet(): MockWallet {
  return mockWallet;
}

export function teardownMockWallet(): void {
  (globalThis as any).window = undefined;
}
```

### Vitest Integration

```typescript
// vitest.setup.ts
import { beforeEach, afterEach } from "vitest";
import { setupMockWallet, teardownMockWallet } from "./test/setup/mockWallet";

beforeEach(() => {
  setupMockWallet();
});

afterEach(() => {
  teardownMockWallet();
});
```

### React Testing Library

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MockWallet } from "./MockWallet";
import { ConnectButton } from "../components/ConnectButton";

describe("ConnectButton", () => {
  let mockWallet: MockWallet;

  beforeEach(() => {
    mockWallet = new MockWallet();
    (globalThis as any).window = {
      midnight: { mnLace: mockWallet.connector },
    };
  });

  it("should show connect button when disconnected", () => {
    render(<ConnectButton />);
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("should connect and show address", async () => {
    render(<ConnectButton />);

    fireEvent.click(screen.getByText("Connect Wallet"));

    await waitFor(() => {
      expect(screen.getByText(/addr_test1qz/)).toBeInTheDocument();
    });
  });

  it("should handle connection rejection", async () => {
    mockWallet.rejectNextTransaction("User cancelled");

    render(<ConnectButton />);

    // ... test rejection handling
  });
});
```

## Common Test Scenarios

### Testing Multiple Accounts

```typescript
describe("Multi-Account", () => {
  it("should handle account switching", async () => {
    const wallet = new MockWallet({ address: "addr_test1_account_a" });

    // Connect as Account A
    const api = await wallet.connector.enable();
    let state = await api.state();
    expect(state.address).toBe("addr_test1_account_a");

    // Switch to Account B
    wallet.switchAccount("addr_test1_account_b");

    state = await api.state();
    expect(state.address).toBe("addr_test1_account_b");
  });
});
```

### Testing Network Switching

```typescript
describe("Network Switching", () => {
  it("should update service URIs on network switch", async () => {
    const wallet = new MockWallet();

    let uris = await wallet.connector.serviceUriConfig();
    expect(uris.indexerUri).toContain("localhost");

    wallet.switchNetwork("testnet");

    uris = await wallet.connector.serviceUriConfig();
    expect(uris.indexerUri).toContain("testnet.midnight.network");
  });
});
```

### Testing Transaction Flow

```typescript
describe("Transaction Flow", () => {
  it("should track submitted transactions", async () => {
    const wallet = new MockWallet();
    const api = await wallet.connector.enable();

    // Submit a transaction
    const tx = { recipient: "addr_test1...", amount: 100n };
    const proven = await api.balanceAndProveTransaction(tx, {});
    const hash = await api.submitTransaction(proven);

    expect(hash).toMatch(/^tx_/);
    expect(wallet.getTransactions()).toHaveLength(1);
    expect(wallet.getLastTransaction()?.hash).toBe(hash);
  });

  it("should callback on transaction submit", async () => {
    const wallet = new MockWallet();
    const onSubmit = vi.fn();
    wallet.onTransaction(onSubmit);

    const api = await wallet.connector.enable();
    await api.submitTransaction({});

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

### Testing Error States

```typescript
describe("Error Handling", () => {
  it("should throw when not enabled", async () => {
    const wallet = new MockWallet({ isEnabled: false });

    await expect(wallet.api.state()).rejects.toThrow("Wallet not enabled");
  });

  it("should simulate user rejection", async () => {
    const wallet = new MockWallet();
    await wallet.connector.enable();

    wallet.rejectNextTransaction("User rejected the transaction");

    await expect(
      wallet.api.balanceAndProveTransaction({}, {})
    ).rejects.toThrow("User rejected the transaction");
  });
});
```

## CI/CD Pipeline Usage

### GitHub Actions Example

```yaml
name: Test with Mock Wallet

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - run: pnpm install
      - run: pnpm test

      # No browser extension needed - mock wallet handles everything
```

### Environment Detection

```typescript
// src/wallet/provider.ts
export function getWalletProvider() {
  if (process.env.NODE_ENV === "test") {
    // In tests, expect mock to be injected
    return window.midnight?.mnLace;
  }

  // In production, use real Lace
  if (!window.midnight?.mnLace) {
    throw new Error("Lace wallet not installed");
  }

  return window.midnight.mnLace;
}
```

## Type Definitions

```typescript
// types/wallet.ts

export interface WalletState {
  address: string;
  coinPublicKey: string;
  encryptionPublicKey: string;
}

export interface ServiceURIs {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
}

export interface DAppConnectorWalletAPI {
  state(): Promise<WalletState>;
  balanceAndProveTransaction(tx: unknown, newCoins: unknown): Promise<unknown>;
  submitTransaction(provenTx: unknown): Promise<string>;
}

export interface DAppConnectorAPI {
  readonly apiVersion: string;
  readonly name: string;
  enable(): Promise<DAppConnectorWalletAPI>;
  isEnabled(): Promise<boolean>;
  serviceUriConfig(): Promise<ServiceURIs>;
}

declare global {
  interface Window {
    midnight?: {
      mnLace?: DAppConnectorAPI;
    };
  }
}
```

## Best Practices

### 1. Reset Between Tests

```typescript
beforeEach(() => {
  mockWallet = new MockWallet();
  mockWallet.clearTransactions();
});
```

### 2. Use Explicit Configuration

```typescript
// Bad - relies on defaults
const wallet = new MockWallet();

// Good - explicit test state
const wallet = new MockWallet({
  address: "addr_test1_alice",
  balance: 500n,
});
```

### 3. Verify Transaction Contents

```typescript
it("should submit correct transaction data", async () => {
  const wallet = new MockWallet();
  const api = await wallet.connector.enable();

  await api.submitTransaction({
    type: "transfer",
    recipient: "addr_test1_bob",
    amount: 100n,
  });

  const tx = wallet.getLastTransaction();
  expect(tx?.tx).toMatchObject({
    type: "transfer",
    recipient: "addr_test1_bob",
    amount: 100n,
  });
});
```

### 4. Test Both Success and Failure Paths

```typescript
describe("Transaction", () => {
  it("should succeed when approved", async () => {
    // ... success test
  });

  it("should fail when rejected", async () => {
    wallet.rejectNextTransaction("User rejected");
    // ... failure test
  });

  it("should fail when disconnected", async () => {
    wallet.disconnect();
    // ... disconnection test
  });
});
```
