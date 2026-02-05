/**
 * Wallet Test Utilities - Helper functions for testing wallet integration
 *
 * Provides utilities for setting up mock wallets in tests,
 * common assertions, and test fixtures.
 */

import {
  MockWallet,
  MockWalletConfig,
  MockTransaction,
  DAppConnectorAPI,
} from "./MockWallet";

// =============================================================================
// Test Setup Utilities
// =============================================================================

/** Store reference to current mock wallet for cleanup */
let currentMockWallet: MockWallet | null = null;

/**
 * Set up a mock wallet and inject it into the global window object.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupMockWallet({ balance: 1000n });
 * });
 *
 * afterEach(() => {
 *   teardownMockWallet();
 * });
 * ```
 */
export function setupMockWallet(
  config?: Partial<MockWalletConfig>
): MockWallet {
  const wallet = new MockWallet(config);

  // Inject into window
  (globalThis as unknown as { window: { midnight?: { mnLace?: DAppConnectorAPI } } }).window = {
    midnight: {
      mnLace: wallet.connector,
    },
  };

  currentMockWallet = wallet;
  return wallet;
}

/**
 * Get the currently active mock wallet.
 */
export function getMockWallet(): MockWallet | null {
  return currentMockWallet;
}

/**
 * Clean up the mock wallet from global window.
 */
export function teardownMockWallet(): void {
  (globalThis as unknown as { window?: unknown }).window = undefined;
  currentMockWallet = null;
}

/**
 * Create a mock wallet without injecting into window.
 * Useful for testing multiple wallets in isolation.
 */
export function createIsolatedWallet(
  config?: Partial<MockWalletConfig>
): MockWallet {
  return new MockWallet(config);
}

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Pre-configured wallet fixtures for common test scenarios.
 */
export const walletFixtures = {
  /** Rich user with plenty of balance */
  richUser: (): Partial<MockWalletConfig> => ({
    address: "addr_test1_rich_user_with_large_balance_00000000000000",
    balance: 1_000_000_000n, // 1 billion
  }),

  /** Poor user with minimal balance */
  poorUser: (): Partial<MockWalletConfig> => ({
    address: "addr_test1_poor_user_with_small_balance_00000000000",
    balance: 100n,
  }),

  /** User with zero balance */
  emptyWallet: (): Partial<MockWalletConfig> => ({
    address: "addr_test1_empty_wallet_no_balance_0000000000000000",
    balance: 0n,
  }),

  /** Already enabled wallet */
  preConnected: (): Partial<MockWalletConfig> => ({
    address: "addr_test1_pre_connected_wallet_000000000000000000",
    balance: 10_000n,
    isEnabled: true,
  }),

  /** Wallet on testnet */
  testnetUser: (): Partial<MockWalletConfig> => ({
    address: "addr_test1_testnet_user_0000000000000000000000000000",
    balance: 50_000n,
    serviceURIs: {
      indexerUri: "https://indexer.testnet.midnight.network",
      indexerWsUri: "wss://indexer.testnet.midnight.network",
      proverServerUri: "http://localhost:6300",
    },
  }),

  /** Slow wallet with latency */
  slowWallet: (): Partial<MockWalletConfig> => ({
    address: "addr_test1_slow_wallet_with_latency_0000000000000000",
    balance: 10_000n,
    latencyMs: 100,
  }),
};

/**
 * Create multiple test wallets for multi-user scenarios.
 */
export function createTestWallets(count: number): MockWallet[] {
  return Array.from({ length: count }, (_, i) => {
    return new MockWallet({
      address: `addr_test1_user_${i + 1}_${randomSuffix()}`,
      balance: BigInt((i + 1) * 1000),
    });
  });
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that a transaction was submitted with specific properties.
 */
export function assertTransactionSubmitted(
  wallet: MockWallet,
  expectations: {
    count?: number;
    lastTxContains?: Record<string, unknown>;
  }
): void {
  const transactions = wallet.getTransactions();

  if (expectations.count !== undefined) {
    if (transactions.length !== expectations.count) {
      throw new Error(
        `Expected ${expectations.count} transactions, but found ${transactions.length}`
      );
    }
  }

  if (expectations.lastTxContains) {
    const lastTx = wallet.getLastTransaction();
    if (!lastTx) {
      throw new Error("No transactions submitted");
    }

    const txData = lastTx.tx as Record<string, unknown>;
    for (const [key, value] of Object.entries(expectations.lastTxContains)) {
      if (JSON.stringify(txData[key]) !== JSON.stringify(value)) {
        throw new Error(
          `Expected transaction.${key} to be ${JSON.stringify(value)}, but got ${JSON.stringify(txData[key])}`
        );
      }
    }
  }
}

/**
 * Assert that no transactions were submitted.
 */
export function assertNoTransactions(wallet: MockWallet): void {
  const transactions = wallet.getTransactions();
  if (transactions.length > 0) {
    throw new Error(
      `Expected no transactions, but found ${transactions.length}`
    );
  }
}

/**
 * Assert wallet connection state.
 */
export function assertWalletState(
  wallet: MockWallet,
  expectations: {
    isEnabled?: boolean;
    address?: string;
    balance?: bigint;
  }
): void {
  if (expectations.isEnabled !== undefined) {
    const isEnabled = wallet.isCurrentlyEnabled();
    if (isEnabled !== expectations.isEnabled) {
      throw new Error(
        `Expected wallet enabled=${expectations.isEnabled}, but got ${isEnabled}`
      );
    }
  }

  if (expectations.address !== undefined) {
    const state = wallet.getCurrentState();
    if (state.address !== expectations.address) {
      throw new Error(
        `Expected address ${expectations.address}, but got ${state.address}`
      );
    }
  }

  if (expectations.balance !== undefined) {
    const balance = wallet.getBalance();
    if (balance !== expectations.balance) {
      throw new Error(
        `Expected balance ${expectations.balance}, but got ${balance}`
      );
    }
  }
}

// =============================================================================
// Transaction Helpers
// =============================================================================

/**
 * Wait for a specific number of transactions to be submitted.
 */
export function waitForTransactions(
  wallet: MockWallet,
  count: number,
  timeoutMs: number = 5000
): Promise<MockTransaction[]> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      const transactions = wallet.getTransactions();
      if (transactions.length >= count) {
        resolve([...transactions]);
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(
          new Error(
            `Timeout waiting for ${count} transactions. Got ${transactions.length}`
          )
        );
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}

/**
 * Wait for the next transaction to be submitted.
 */
export function waitForNextTransaction(
  wallet: MockWallet,
  timeoutMs: number = 5000
): Promise<MockTransaction> {
  return new Promise((resolve, reject) => {
    const initialCount = wallet.getTransactions().length;
    const startTime = Date.now();

    const check = () => {
      const transactions = wallet.getTransactions();
      if (transactions.length > initialCount) {
        resolve(transactions[transactions.length - 1]);
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(new Error("Timeout waiting for transaction"));
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}

// =============================================================================
// Scenario Helpers
// =============================================================================

/**
 * Set up a complete connection flow for testing.
 */
export async function setupConnectedWallet(
  config?: Partial<MockWalletConfig>
): Promise<{
  wallet: MockWallet;
  api: Awaited<ReturnType<DAppConnectorAPI["enable"]>>;
  state: Awaited<ReturnType<Awaited<ReturnType<DAppConnectorAPI["enable"]>>["state"]>>;
}> {
  const wallet = setupMockWallet(config);
  const api = await wallet.connector.enable();
  const state = await api.state();

  return { wallet, api, state };
}

/**
 * Simulate a complete transfer flow.
 */
export async function simulateTransfer(
  wallet: MockWallet,
  params: {
    recipient: string;
    amount: bigint;
    shouldReject?: boolean;
    rejectMessage?: string;
  }
): Promise<{ success: boolean; txHash?: string; error?: Error }> {
  if (params.shouldReject) {
    wallet.rejectNextTransaction(
      params.rejectMessage ?? "User rejected the transaction"
    );
  }

  try {
    const api = await wallet.connector.enable();

    const tx = { type: "transfer", recipient: params.recipient, amount: params.amount };
    const provenTx = await api.balanceAndProveTransaction(tx, {});
    const txHash = await api.submitTransaction(provenTx);

    // Update balance tracking
    wallet.adjustBalance(-params.amount);

    return { success: true, txHash };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Simulate multiple accounts interacting.
 */
export function createMultiAccountScenario(
  accounts: Array<{ name: string; balance: bigint }>
): Map<string, MockWallet> {
  const wallets = new Map<string, MockWallet>();

  for (const account of accounts) {
    wallets.set(
      account.name,
      new MockWallet({
        address: `addr_test1_${account.name}_${randomSuffix()}`,
        balance: account.balance,
      })
    );
  }

  return wallets;
}

// =============================================================================
// Network Helpers
// =============================================================================

/**
 * Get network name from service URIs.
 */
export function detectNetwork(wallet: MockWallet): "testnet" | "mainnet" | "local" | "unknown" {
  const uris = wallet.getCurrentServiceURIs();

  if (uris.indexerUri.includes("testnet")) {
    return "testnet";
  }
  if (uris.indexerUri.includes("localhost") || uris.indexerUri.includes("127.0.0.1")) {
    return "local";
  }
  if (uris.indexerUri.includes("midnight.network") && !uris.indexerUri.includes("testnet")) {
    return "mainnet";
  }

  return "unknown";
}

/**
 * Assert wallet is on expected network.
 */
export function assertNetwork(
  wallet: MockWallet,
  expected: "testnet" | "mainnet" | "local"
): void {
  const actual = detectNetwork(wallet);
  if (actual !== expected) {
    throw new Error(`Expected wallet on ${expected}, but found ${actual}`);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a random suffix for unique addresses.
 */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Format address for display (truncated).
 */
export function formatAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 12)}...${address.slice(-8)}`;
}

/**
 * Format balance for display.
 */
export function formatBalance(balance: bigint, decimals: number = 6): string {
  const str = balance.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, -decimals) || "0";
  const decPart = str.slice(-decimals);
  return `${intPart}.${decPart}`;
}

// =============================================================================
// Test Reporter
// =============================================================================

/**
 * Create a transaction reporter for debugging tests.
 */
export function createTransactionReporter(wallet: MockWallet): {
  start: () => void;
  stop: () => void;
  getReport: () => string;
} {
  const logs: string[] = [];
  let unsubscribe: (() => void) | null = null;

  return {
    start: () => {
      wallet.onTransaction((tx) => {
        logs.push(
          `[${new Date(tx.timestamp).toISOString()}] TX ${tx.hash}: ${JSON.stringify(tx.tx)}`
        );
      });
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = null;
    },
    getReport: () => {
      return logs.length > 0
        ? `Transaction Report:\n${logs.join("\n")}`
        : "No transactions recorded";
    },
  };
}
