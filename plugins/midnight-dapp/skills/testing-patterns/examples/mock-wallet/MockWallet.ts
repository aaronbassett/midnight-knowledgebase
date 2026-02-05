/**
 * MockWallet - Fake Lace wallet for testing without browser extension
 *
 * Simulates the DAppConnectorAPI and WalletAPI interfaces,
 * allowing automated testing in Node.js and CI/CD environments.
 */

// =============================================================================
// Types
// =============================================================================

export interface WalletState {
  /** Bech32m wallet address */
  address: string;
  /** Coin public key (hex or base64) */
  coinPublicKey: string;
  /** Encryption public key */
  encryptionPublicKey: string;
}

export interface ServiceURIs {
  /** HTTP indexer endpoint */
  indexerUri: string;
  /** WebSocket indexer endpoint */
  indexerWsUri: string;
  /** Proof server endpoint */
  proverServerUri: string;
}

export interface DAppConnectorWalletAPI {
  /** Get current wallet state */
  state(): Promise<WalletState>;
  /** Balance and prove a transaction */
  balanceAndProveTransaction(tx: unknown, newCoins: unknown): Promise<unknown>;
  /** Submit a proven transaction */
  submitTransaction(provenTx: unknown): Promise<string>;
}

export interface DAppConnectorAPI {
  /** API version */
  readonly apiVersion: string;
  /** Wallet name */
  readonly name: string;
  /** Enable wallet connection */
  enable(): Promise<DAppConnectorWalletAPI>;
  /** Check if wallet is enabled */
  isEnabled(): Promise<boolean>;
  /** Get service URIs */
  serviceUriConfig(): Promise<ServiceURIs>;
}

export interface MockWalletConfig {
  /** Initial wallet address */
  address: string;
  /** Coin public key */
  coinPublicKey: string;
  /** Encryption public key */
  encryptionPublicKey: string;
  /** Initial balance (for tracking) */
  balance: bigint;
  /** Service URIs to return */
  serviceURIs: ServiceURIs;
  /** Whether wallet starts enabled */
  isEnabled: boolean;
  /** Simulated latency in ms */
  latencyMs: number;
  /** API version to report */
  apiVersion: string;
  /** Wallet name to report */
  name: string;
}

export interface MockTransaction {
  /** Transaction hash */
  hash: string;
  /** Transaction data */
  tx: unknown;
  /** Submission timestamp */
  timestamp: number;
  /** Transaction status */
  status: "submitted" | "confirmed" | "failed";
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: MockWalletConfig = {
  address: "addr_test1qz_mock_wallet_address_for_testing_purposes_0123456789abcdef",
  coinPublicKey: "mock_coin_public_key_32_bytes_0000000000000000",
  encryptionPublicKey: "mock_encryption_public_key_32_bytes_00000000",
  balance: 1_000_000n,
  serviceURIs: {
    indexerUri: "http://localhost:8080",
    indexerWsUri: "ws://localhost:8080",
    proverServerUri: "http://localhost:6300",
  },
  isEnabled: false,
  latencyMs: 0,
  apiVersion: "1.0.0",
  name: "MockLace",
};

// =============================================================================
// MockWallet Implementation
// =============================================================================

/**
 * Mock Lace wallet for testing Midnight DApps.
 *
 * @example
 * ```typescript
 * // Create mock wallet
 * const wallet = new MockWallet({ balance: 1000n });
 *
 * // Inject into window (for components that check window.midnight)
 * globalThis.window = {
 *   midnight: { mnLace: wallet.connector }
 * };
 *
 * // Use in tests
 * const api = await wallet.connector.enable();
 * const state = await api.state();
 * expect(state.address).toMatch(/^addr_test/);
 * ```
 */
export class MockWallet {
  private config: MockWalletConfig;
  private enabled: boolean;
  private transactions: MockTransaction[] = [];
  private nextTxShouldReject: { reject: true; message: string } | null = null;
  private onTransactionSubmit?: (tx: MockTransaction) => void;
  private onEnable?: () => void;
  private enableShouldFail: { fail: true; message: string } | null = null;

  constructor(config: Partial<MockWalletConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.isEnabled;
  }

  // ===========================================================================
  // Public API - DAppConnectorAPI (window.midnight.mnLace)
  // ===========================================================================

  /**
   * Get the DAppConnectorAPI that would be injected into window.midnight.mnLace
   */
  get connector(): DAppConnectorAPI {
    return {
      apiVersion: this.config.apiVersion,
      name: this.config.name,

      enable: async (): Promise<DAppConnectorWalletAPI> => {
        await this.simulateLatency();

        if (this.enableShouldFail) {
          const message = this.enableShouldFail.message;
          this.enableShouldFail = null;
          throw new Error(message);
        }

        this.enabled = true;
        this.onEnable?.();

        return this.api;
      },

      isEnabled: async (): Promise<boolean> => {
        await this.simulateLatency();
        return this.enabled;
      },

      serviceUriConfig: async (): Promise<ServiceURIs> => {
        await this.simulateLatency();
        return { ...this.config.serviceURIs };
      },
    };
  }

  /**
   * Get the WalletAPI (returned from enable())
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

        // Check for configured rejection
        if (this.nextTxShouldReject) {
          const message = this.nextTxShouldReject.message;
          this.nextTxShouldReject = null;
          throw new MockWalletError(message, "USER_REJECTED");
        }

        // Return the transaction as "proven"
        return {
          originalTx: tx,
          newCoins,
          proven: true,
          mockProofTimestamp: Date.now(),
        };
      },

      submitTransaction: async (provenTx: unknown): Promise<string> => {
        await this.simulateLatency();
        this.ensureEnabled();

        // Generate mock transaction hash
        const txHash = this.generateTxHash();

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
   * Configure the next transaction to be rejected (simulates user clicking "Reject")
   */
  rejectNextTransaction(message: string = "User rejected the transaction"): void {
    this.nextTxShouldReject = { reject: true, message };
  }

  /**
   * Configure the next enable() call to fail (simulates user rejecting connection)
   */
  rejectNextEnable(message: string = "User rejected connection"): void {
    this.enableShouldFail = { fail: true, message };
  }

  /**
   * Simulate wallet disconnection
   */
  disconnect(): void {
    this.enabled = false;
  }

  /**
   * Get current balance
   */
  getBalance(): bigint {
    return this.config.balance;
  }

  /**
   * Set balance (for test setup)
   */
  setBalance(balance: bigint): void {
    if (balance < 0n) {
      throw new Error("Balance cannot be negative");
    }
    this.config.balance = balance;
  }

  /**
   * Adjust balance by delta (for simulating transfers)
   */
  adjustBalance(delta: bigint): void {
    const newBalance = this.config.balance + delta;
    if (newBalance < 0n) {
      throw new Error("Balance would become negative");
    }
    this.config.balance = newBalance;
  }

  /**
   * Switch to a different account address
   */
  switchAccount(newAddress: string): void {
    this.config.address = newAddress;
  }

  /**
   * Switch network configuration
   */
  switchNetwork(network: "testnet" | "mainnet" | "local"): void {
    const configs: Record<string, ServiceURIs> = {
      testnet: {
        indexerUri: "https://indexer.testnet.midnight.network",
        indexerWsUri: "wss://indexer.testnet.midnight.network",
        proverServerUri: "http://localhost:6300",
      },
      mainnet: {
        indexerUri: "https://indexer.midnight.network",
        indexerWsUri: "wss://indexer.midnight.network",
        proverServerUri: "http://localhost:6300",
      },
      local: {
        indexerUri: "http://localhost:8080",
        indexerWsUri: "ws://localhost:8080",
        proverServerUri: "http://localhost:6300",
      },
    };

    this.config.serviceURIs = configs[network];
  }

  /**
   * Update service URIs directly
   */
  setServiceURIs(uris: Partial<ServiceURIs>): void {
    this.config.serviceURIs = { ...this.config.serviceURIs, ...uris };
  }

  /**
   * Set simulated latency
   */
  setLatency(latencyMs: number): void {
    this.config.latencyMs = latencyMs;
  }

  // ===========================================================================
  // Transaction History Methods
  // ===========================================================================

  /**
   * Get all submitted transactions
   */
  getTransactions(): ReadonlyArray<MockTransaction> {
    return [...this.transactions];
  }

  /**
   * Get the last submitted transaction
   */
  getLastTransaction(): MockTransaction | undefined {
    return this.transactions[this.transactions.length - 1];
  }

  /**
   * Get transaction by hash
   */
  getTransaction(hash: string): MockTransaction | undefined {
    return this.transactions.find((tx) => tx.hash === hash);
  }

  /**
   * Clear transaction history
   */
  clearTransactions(): void {
    this.transactions = [];
  }

  /**
   * Update transaction status (for simulating confirmation)
   */
  confirmTransaction(hash: string): void {
    const tx = this.transactions.find((t) => t.hash === hash);
    if (tx) {
      tx.status = "confirmed";
    }
  }

  /**
   * Mark transaction as failed
   */
  failTransaction(hash: string): void {
    const tx = this.transactions.find((t) => t.hash === hash);
    if (tx) {
      tx.status = "failed";
    }
  }

  // ===========================================================================
  // Event Callbacks
  // ===========================================================================

  /**
   * Set callback for transaction submissions
   */
  onTransaction(callback: (tx: MockTransaction) => void): void {
    this.onTransactionSubmit = callback;
  }

  /**
   * Set callback for wallet enable
   */
  onWalletEnabled(callback: () => void): void {
    this.onEnable = callback;
  }

  // ===========================================================================
  // State Inspection
  // ===========================================================================

  /**
   * Check if wallet is currently enabled
   */
  isCurrentlyEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current wallet state for inspection
   */
  getCurrentState(): WalletState {
    return {
      address: this.config.address,
      coinPublicKey: this.config.coinPublicKey,
      encryptionPublicKey: this.config.encryptionPublicKey,
    };
  }

  /**
   * Get current service URIs
   */
  getCurrentServiceURIs(): ServiceURIs {
    return { ...this.config.serviceURIs };
  }

  // ===========================================================================
  // Reset
  // ===========================================================================

  /**
   * Reset wallet to initial state
   */
  reset(newConfig?: Partial<MockWalletConfig>): void {
    this.config = { ...DEFAULT_CONFIG, ...newConfig };
    this.enabled = this.config.isEnabled;
    this.transactions = [];
    this.nextTxShouldReject = null;
    this.enableShouldFail = null;
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
      throw new MockWalletError(
        "Wallet not enabled. Call enable() first.",
        "NOT_ENABLED"
      );
    }
  }

  private generateTxHash(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `tx_${timestamp}_${random}`;
  }
}

// =============================================================================
// Error Class
// =============================================================================

export class MockWalletError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "MockWalletError";
  }
}

// =============================================================================
// Global Type Declaration
// =============================================================================

declare global {
  interface Window {
    midnight?: {
      mnLace?: DAppConnectorAPI;
    };
  }
}
