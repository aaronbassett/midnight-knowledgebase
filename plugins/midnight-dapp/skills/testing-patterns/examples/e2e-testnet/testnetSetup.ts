/**
 * Testnet Setup - Configuration and utilities for E2E testnet tests
 *
 * Provides utilities for account management, faucet requests,
 * and transaction monitoring on Midnight testnet.
 */

import { Page } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

export interface TestnetConfig {
  /** Application URL under test */
  appUrl: string;
  /** Testnet indexer URL */
  indexerUrl: string;
  /** Testnet indexer WebSocket URL */
  indexerWsUrl: string;
  /** Local proof server URL */
  proofServerUrl: string;
  /** Faucet API URL */
  faucetUrl: string;
  /** Faucet API key (if required) */
  faucetApiKey: string | undefined;
  /** Minimum balance required for tests (in smallest unit) */
  minBalance: bigint;
  /** Amount to request from faucet */
  faucetAmount: bigint;
  /** Test recipient address for transfers */
  testRecipientAddress: string;
  /** State polling interval in ms */
  statePollingIntervalMs: number;
  /** Transaction confirmation timeout in ms */
  txConfirmationTimeoutMs: number;
}

export const testnetConfig: TestnetConfig = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  indexerUrl:
    process.env.TESTNET_INDEXER_URL ?? "https://indexer.testnet.midnight.network",
  indexerWsUrl:
    process.env.TESTNET_INDEXER_WS_URL ?? "wss://indexer.testnet.midnight.network",
  proofServerUrl: process.env.PROOF_SERVER_URL ?? "http://localhost:6300",
  faucetUrl:
    process.env.TESTNET_FAUCET_URL ??
    "https://faucet.testnet.midnight.network/api/request",
  faucetApiKey: process.env.TESTNET_FAUCET_KEY,
  minBalance: BigInt(process.env.MIN_TEST_BALANCE ?? "1000000"), // 1M
  faucetAmount: BigInt(process.env.FAUCET_AMOUNT ?? "10000000"), // 10M
  testRecipientAddress:
    process.env.TEST_RECIPIENT_ADDRESS ??
    "addr_test1_default_recipient_for_transfer_tests_00000000000",
  statePollingIntervalMs: parseInt(process.env.STATE_POLLING_MS ?? "5000"),
  txConfirmationTimeoutMs: parseInt(process.env.TX_CONFIRMATION_TIMEOUT_MS ?? "120000"),
};

// =============================================================================
// Account Management
// =============================================================================

export interface TestAccount {
  /** Account address */
  address: string;
  /** Account mnemonic (for wallet restore) */
  mnemonic: string;
  /** Account name/identifier */
  name: string;
}

const testAccounts: TestAccount[] = [
  {
    name: "primary",
    address: process.env.TEST_ACCOUNT_ADDRESS_1 ?? "",
    mnemonic: process.env.TEST_ACCOUNT_MNEMONIC_1 ?? "",
  },
  {
    name: "secondary",
    address: process.env.TEST_ACCOUNT_ADDRESS_2 ?? "",
    mnemonic: process.env.TEST_ACCOUNT_MNEMONIC_2 ?? "",
  },
];

let accountIndex = 0;

/**
 * Get the next available test account.
 * Rotates through accounts to avoid balance depletion.
 */
export async function getTestAccount(): Promise<TestAccount> {
  const account = testAccounts[accountIndex % testAccounts.length];
  accountIndex++;

  if (!account.address || !account.mnemonic) {
    throw new Error(
      `Test account ${account.name} not configured. ` +
        "Set TEST_ACCOUNT_ADDRESS_N and TEST_ACCOUNT_MNEMONIC_N environment variables."
    );
  }

  return account;
}

/**
 * Reset account rotation (call in test cleanup).
 */
export function resetAccountRotation(): void {
  accountIndex = 0;
}

// =============================================================================
// Faucet Utilities
// =============================================================================

export interface FaucetResponse {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Request tokens from the testnet faucet.
 */
export async function requestFromFaucet(
  address: string,
  amount?: bigint
): Promise<FaucetResponse> {
  const requestAmount = amount ?? testnetConfig.faucetAmount;

  console.log(`Requesting ${requestAmount} tokens from faucet for ${address}...`);

  try {
    const response = await fetch(testnetConfig.faucetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(testnetConfig.faucetApiKey && {
          Authorization: `Bearer ${testnetConfig.faucetApiKey}`,
        }),
      },
      body: JSON.stringify({
        address,
        amount: requestAmount.toString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Faucet request failed: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `Faucet error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    console.log(`Faucet transaction: ${data.transactionHash}`);

    return {
      success: true,
      transactionHash: data.transactionHash,
    };
  } catch (error) {
    console.error("Faucet request error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Fund account if balance is below minimum.
 */
export async function fundAccountIfNeeded(
  address: string,
  minBalance?: bigint
): Promise<void> {
  const required = minBalance ?? testnetConfig.minBalance;
  const currentBalance = await getAccountBalance(address);

  console.log(`Account ${address} balance: ${currentBalance}`);

  if (currentBalance < required) {
    console.log(`Balance below minimum (${required}). Requesting from faucet...`);

    const result = await requestFromFaucet(address);
    if (!result.success) {
      throw new Error(`Failed to fund account: ${result.error}`);
    }

    if (result.transactionHash) {
      console.log("Waiting for faucet transaction to confirm...");
      await waitForTransaction(result.transactionHash);
    }

    // Verify balance increased
    const newBalance = await getAccountBalance(address);
    console.log(`New balance: ${newBalance}`);

    if (newBalance < required) {
      throw new Error(
        `Balance still below minimum after faucet. Got ${newBalance}, need ${required}`
      );
    }
  }
}

// =============================================================================
// Balance Queries
// =============================================================================

/**
 * Get account balance from indexer.
 */
export async function getAccountBalance(address: string): Promise<bigint> {
  try {
    const response = await fetch(
      `${testnetConfig.indexerUrl}/api/accounts/${address}/balance`
    );

    if (!response.ok) {
      console.warn(`Failed to fetch balance: ${response.status}`);
      return 0n;
    }

    const data = await response.json();
    return BigInt(data.balance ?? 0);
  } catch (error) {
    console.error("Balance query error:", error);
    return 0n;
  }
}

// =============================================================================
// Transaction Monitoring
// =============================================================================

export type TransactionStatus = "pending" | "confirmed" | "failed" | "not_found";

/**
 * Check transaction status on chain.
 */
export async function checkTransactionStatus(
  txHash: string
): Promise<TransactionStatus> {
  try {
    const response = await fetch(
      `${testnetConfig.indexerUrl}/api/transactions/${txHash}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return "not_found";
      }
      return "pending";
    }

    const data = await response.json();

    if (data.confirmed) {
      return "confirmed";
    }
    if (data.failed) {
      return "failed";
    }

    return "pending";
  } catch (error) {
    console.error("Transaction status check error:", error);
    return "pending";
  }
}

/**
 * Wait for a transaction to be confirmed.
 */
export async function waitForTransaction(
  txHash: string,
  timeoutMs?: number
): Promise<void> {
  const timeout = timeoutMs ?? testnetConfig.txConfirmationTimeoutMs;
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds

  console.log(`Waiting for transaction ${txHash} to confirm...`);

  while (Date.now() - startTime < timeout) {
    const status = await checkTransactionStatus(txHash);

    if (status === "confirmed") {
      console.log(`Transaction ${txHash} confirmed`);
      return;
    }

    if (status === "failed") {
      throw new Error(`Transaction ${txHash} failed`);
    }

    await sleep(pollInterval);
  }

  throw new Error(
    `Transaction ${txHash} not confirmed within ${timeout}ms`
  );
}

/**
 * Wait for transaction confirmation via UI element.
 */
export async function waitForTransactionConfirmation(
  page: Page,
  txHash: string,
  timeoutMs?: number
): Promise<void> {
  const timeout = timeoutMs ?? testnetConfig.txConfirmationTimeoutMs;

  // Wait for confirmation status in UI
  await page.locator(`[data-testid='tx-status-${txHash}']`).waitFor({
    state: "visible",
    timeout,
  });

  const status = await page.locator(`[data-testid='tx-status-${txHash}']`).textContent();

  if (status?.toLowerCase().includes("failed")) {
    throw new Error(`Transaction ${txHash} failed`);
  }

  if (!status?.toLowerCase().includes("confirmed")) {
    // Fall back to checking via API
    await waitForTransaction(txHash, timeout);
  }
}

// =============================================================================
// Health Checks
// =============================================================================

export interface ServiceHealth {
  service: string;
  available: boolean;
  latencyMs: number | null;
  error?: string;
}

/**
 * Check if proof server is available.
 */
export async function checkProofServerHealth(): Promise<ServiceHealth> {
  const startTime = performance.now();

  try {
    const response = await fetch(`${testnetConfig.proofServerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    return {
      service: "proof-server",
      available: response.ok,
      latencyMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      service: "proof-server",
      available: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if indexer is available.
 */
export async function checkIndexerHealth(): Promise<ServiceHealth> {
  const startTime = performance.now();

  try {
    const response = await fetch(`${testnetConfig.indexerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    return {
      service: "indexer",
      available: response.ok,
      latencyMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      service: "indexer",
      available: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check all required services before running tests.
 */
export async function verifyTestEnvironment(): Promise<void> {
  console.log("Verifying test environment...");

  const proofHealth = await checkProofServerHealth();
  const indexerHealth = await checkIndexerHealth();

  console.log(`Proof server: ${proofHealth.available ? "OK" : "UNAVAILABLE"}`);
  console.log(`Indexer: ${indexerHealth.available ? "OK" : "UNAVAILABLE"}`);

  if (!proofHealth.available) {
    throw new Error(
      `Proof server not available at ${testnetConfig.proofServerUrl}. ` +
        "Start it with: docker run -d -p 6300:6300 midnightnetwork/proof-server:latest"
    );
  }

  if (!indexerHealth.available) {
    throw new Error(
      `Indexer not available at ${testnetConfig.indexerUrl}. ` +
        "Check network configuration."
    );
  }

  console.log("Test environment verified");
}

// =============================================================================
// Test Data Generation
// =============================================================================

/**
 * Generate a unique test transfer recipient.
 */
export function generateTestRecipient(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `addr_test1_test_recipient_${timestamp}_${random}`;
}

/**
 * Generate unique memo for transfer tracking.
 */
export function generateTestMemo(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// =============================================================================
// Utility Functions
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);

      if (attempt < maxAttempts) {
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        console.log(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error("Operation failed after retries");
}

// =============================================================================
// Cleanup Utilities
// =============================================================================

/**
 * Clean up test artifacts (if any).
 */
export async function cleanupTestData(): Promise<void> {
  // Reset account rotation
  resetAccountRotation();

  // Additional cleanup as needed
  console.log("Test cleanup complete");
}
