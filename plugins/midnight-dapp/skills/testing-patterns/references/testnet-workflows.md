# Testnet Workflows

Integration testing against Midnight testnet validates your DApp with real infrastructure before mainnet deployment.

## When to Use Testnet

### Testnet vs Mocks Decision Matrix

| Test Goal | Use Mocks | Use Testnet |
|-----------|-----------|-------------|
| UI component behavior | Yes | No |
| Transaction flow logic | Yes | No |
| Contract constraint satisfaction | No | Yes |
| Proof generation correctness | No | Yes |
| Full deployment validation | No | Yes |
| CI/CD (every commit) | Yes | No |
| CI/CD (pre-release) | No | Yes |
| Local development | Usually | Sometimes |

### Testnet Testing Covers

- Real proof generation and verification
- Actual contract deployment
- Real network latency
- Real wallet integration (Lace)
- Full transaction lifecycle
- Token balancing and fees

## Getting Testnet Tokens

### Faucet Usage

Testnet tokens have no real value and are available from the Midnight faucet.

```typescript
interface FaucetConfig {
  /** Faucet API endpoint */
  url: string;
  /** Required API key (if any) */
  apiKey?: string;
  /** Amount to request */
  amount: bigint;
}

async function requestTestnetTokens(
  address: string,
  config: FaucetConfig
): Promise<string> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({
      address,
      amount: config.amount.toString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Faucet request failed: ${response.status}`);
  }

  const { transactionHash } = await response.json();
  return transactionHash;
}
```

### Programmatic Faucet in Tests

```typescript
// test/e2e/setup/faucet.ts
const FAUCET_CONFIG: FaucetConfig = {
  url: process.env.TESTNET_FAUCET_URL ?? "https://faucet.testnet.midnight.network/api/request",
  apiKey: process.env.TESTNET_FAUCET_KEY,
  amount: 10_000_000n, // 10M test tokens
};

export async function fundTestAccount(address: string): Promise<void> {
  console.log(`Requesting testnet tokens for ${address}...`);

  const txHash = await requestTestnetTokens(address, FAUCET_CONFIG);
  console.log(`Faucet transaction: ${txHash}`);

  // Wait for transaction confirmation
  await waitForTransaction(txHash);
  console.log("Account funded successfully");
}

async function waitForTransaction(
  txHash: string,
  timeoutMs: number = 60_000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await checkTransactionStatus(txHash);

    if (status === "confirmed") {
      return;
    }

    if (status === "failed") {
      throw new Error(`Transaction ${txHash} failed`);
    }

    // Poll every 2 seconds
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(`Transaction ${txHash} timed out after ${timeoutMs}ms`);
}
```

## Deploying to Testnet

### Contract Deployment Script

```typescript
// scripts/deploy-testnet.ts
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { getWalletAPI, getServiceURIs } from "../src/wallet";

interface DeploymentResult {
  contractAddress: string;
  deploymentTxHash: string;
  blockHeight: number;
}

export async function deployToTestnet(
  contractCode: Uint8Array,
  initialState: unknown
): Promise<DeploymentResult> {
  // Get wallet connection
  const walletAPI = await getWalletAPI();
  const serviceURIs = await getServiceURIs();

  // Verify we're on testnet
  if (!serviceURIs.indexerUri.includes("testnet")) {
    throw new Error("Please switch to testnet in Lace wallet");
  }

  console.log("Deploying contract to testnet...");

  const result = await deployContract({
    code: contractCode,
    initialState,
    walletAPI,
    serviceURIs,
  });

  console.log(`Contract deployed at: ${result.contractAddress}`);
  console.log(`Deployment tx: ${result.deploymentTxHash}`);

  return result;
}
```

### Deployment in E2E Tests

```typescript
// test/e2e/setup/deployment.ts
import { deployToTestnet } from "../../../scripts/deploy-testnet";
import { loadCompiledContract } from "../../../src/contract";

let deployedContractAddress: string | null = null;

export async function getTestContract(): Promise<string> {
  if (deployedContractAddress) {
    return deployedContractAddress;
  }

  // Load compiled contract
  const { code, initialState } = await loadCompiledContract("MyContract");

  // Deploy to testnet
  const { contractAddress } = await deployToTestnet(code, initialState);

  deployedContractAddress = contractAddress;
  return contractAddress;
}

// For test isolation, deploy fresh contract per suite
export async function deployFreshContract(): Promise<string> {
  const { code, initialState } = await loadCompiledContract("MyContract");
  const { contractAddress } = await deployToTestnet(code, initialState);
  return contractAddress;
}
```

## E2E Test Setup

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false, // Sequential for blockchain tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for deterministic state
  timeout: 120_000, // 2 minutes per test

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Lace requires Chrome
      },
    },
  ],

  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

### Global Setup

```typescript
// test/e2e/global-setup.ts
import { FullConfig } from "@playwright/test";
import { fundTestAccount, getTestAccount } from "./setup/accounts";
import { deployFreshContract } from "./setup/deployment";

async function globalSetup(config: FullConfig) {
  console.log("Setting up E2E test environment...");

  // Get or create test account
  const testAccount = await getTestAccount();
  console.log(`Test account: ${testAccount.address}`);

  // Fund account if needed
  const balance = await getBalance(testAccount.address);
  if (balance < 1_000_000n) {
    await fundTestAccount(testAccount.address);
  }

  // Deploy test contract
  const contractAddress = await deployFreshContract();
  process.env.TEST_CONTRACT_ADDRESS = contractAddress;

  console.log("E2E setup complete");
}

export default globalSetup;
```

### Test Account Management

```typescript
// test/e2e/setup/accounts.ts

interface TestAccount {
  address: string;
  mnemonic: string; // For wallet restore
}

// Store test accounts securely
const TEST_ACCOUNTS: TestAccount[] = [
  {
    address: process.env.TEST_ACCOUNT_ADDRESS_1!,
    mnemonic: process.env.TEST_ACCOUNT_MNEMONIC_1!,
  },
  {
    address: process.env.TEST_ACCOUNT_ADDRESS_2!,
    mnemonic: process.env.TEST_ACCOUNT_MNEMONIC_2!,
  },
];

let accountIndex = 0;

/**
 * Get next available test account
 * Rotates through accounts to avoid conflicts in parallel tests
 */
export function getTestAccount(): TestAccount {
  const account = TEST_ACCOUNTS[accountIndex % TEST_ACCOUNTS.length];
  accountIndex++;
  return account;
}

/**
 * Reset account rotation (call in afterAll)
 */
export function resetAccountRotation(): void {
  accountIndex = 0;
}
```

## Writing E2E Tests

### Basic Test Structure

```typescript
// test/e2e/transfer.spec.ts
import { test, expect, Page } from "@playwright/test";
import { connectWallet, waitForTransaction } from "./helpers";

test.describe("Transfer Flow", () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto("/");

    // Connect wallet (may need manual Lace interaction in headed mode)
    await connectWallet(page);
  });

  test("should complete token transfer", async () => {
    // Navigate to transfer page
    await page.click('text="Transfer"');

    // Fill transfer form
    await page.fill('[data-testid="recipient-input"]', "addr_test1_recipient");
    await page.fill('[data-testid="amount-input"]', "100");

    // Submit transfer
    await page.click('[data-testid="submit-transfer"]');

    // Wait for proof generation
    await expect(page.locator('text="Generating proof"')).toBeVisible();

    // Wait for confirmation (may take 30+ seconds)
    await expect(page.locator('text="Transfer Complete"')).toBeVisible({
      timeout: 60_000,
    });

    // Verify transaction details
    const txHash = await page.locator('[data-testid="tx-hash"]').textContent();
    expect(txHash).toMatch(/^tx_/);
  });

  test("should show error for insufficient balance", async () => {
    await page.click('text="Transfer"');

    // Try to transfer more than balance
    await page.fill('[data-testid="amount-input"]', "999999999999");
    await page.click('[data-testid="submit-transfer"]');

    await expect(page.locator('text="Insufficient balance"')).toBeVisible();
  });
});
```

### Helper Functions

```typescript
// test/e2e/helpers.ts
import { Page, expect } from "@playwright/test";

/**
 * Connect wallet via UI
 * Note: In automated tests, you may need headed mode for Lace popup
 */
export async function connectWallet(page: Page): Promise<void> {
  // Click connect button
  await page.click('[data-testid="connect-wallet"]');

  // Wait for connection (Lace popup in headed mode)
  await expect(page.locator('[data-testid="wallet-address"]')).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Wait for a transaction to be confirmed
 */
export async function waitForTransaction(
  page: Page,
  options?: { timeout?: number }
): Promise<string> {
  const { timeout = 60_000 } = options ?? {};

  // Wait for tx hash to appear
  const txHashLocator = page.locator('[data-testid="tx-hash"]');
  await expect(txHashLocator).toBeVisible({ timeout });

  // Wait for confirmed status
  await expect(page.locator('text="Confirmed"')).toBeVisible({ timeout });

  const txHash = await txHashLocator.textContent();
  return txHash ?? "";
}

/**
 * Get current balance from UI
 */
export async function getDisplayedBalance(page: Page): Promise<bigint> {
  const balanceText = await page.locator('[data-testid="balance"]').textContent();
  return BigInt(balanceText?.replace(/[^0-9]/g, "") ?? "0");
}
```

### Handling Lace Wallet Popup

For tests that need real Lace interaction:

```typescript
// test/e2e/lace-helpers.ts
import { BrowserContext, Page } from "@playwright/test";

/**
 * Wait for Lace popup and approve connection
 * Only works in headed mode with Lace extension loaded
 */
export async function approveLaceConnection(
  context: BrowserContext
): Promise<void> {
  // Wait for popup to open
  const popupPromise = context.waitForEvent("page");

  // Trigger connection (e.g., click connect button in your app)
  // ...

  const popup = await popupPromise;

  // Click approve in Lace popup
  await popup.click('button:has-text("Connect")');

  // Popup closes automatically
  await popup.waitForEvent("close");
}

/**
 * Approve transaction in Lace popup
 */
export async function approveLaceTransaction(
  context: BrowserContext
): Promise<void> {
  const popupPromise = context.waitForEvent("page");

  // Trigger transaction (happens in your test)
  // ...

  const popup = await popupPromise;

  // Review and confirm
  await popup.click('button:has-text("Confirm")');
  await popup.waitForEvent("close");
}
```

## CI/CD Integration

### GitHub Actions for Testnet E2E

```yaml
# .github/workflows/e2e-testnet.yml
name: E2E Testnet Tests

on:
  schedule:
    # Run nightly at 2 AM UTC
    - cron: "0 2 * * *"
  workflow_dispatch:
    # Allow manual trigger

jobs:
  e2e-testnet:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Start proof server
        run: |
          docker run -d --name proof-server \
            -p 6300:6300 \
            midnightnetwork/proof-server:latest

      - name: Wait for proof server
        run: |
          timeout 60 bash -c 'until curl -s http://localhost:6300/health; do sleep 2; done'

      - name: Run E2E tests
        run: pnpm test:e2e:testnet
        env:
          TESTNET_FAUCET_KEY: ${{ secrets.TESTNET_FAUCET_KEY }}
          TEST_ACCOUNT_ADDRESS_1: ${{ secrets.TEST_ACCOUNT_ADDRESS_1 }}
          TEST_ACCOUNT_MNEMONIC_1: ${{ secrets.TEST_ACCOUNT_MNEMONIC_1 }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30

      - name: Stop proof server
        if: always()
        run: docker stop proof-server || true
```

### Secrets Management

Required secrets for testnet E2E:
- `TESTNET_FAUCET_KEY` - API key for testnet faucet
- `TEST_ACCOUNT_ADDRESS_1` - Pre-created test account address
- `TEST_ACCOUNT_MNEMONIC_1` - Test account recovery phrase

Never commit test account mnemonics to source control.

## Best Practices

### 1. Isolate Test State

```typescript
test.describe("Contract Tests", () => {
  let contractAddress: string;

  test.beforeAll(async () => {
    // Deploy fresh contract for this test suite
    contractAddress = await deployFreshContract();
  });

  // Tests operate on isolated contract
});
```

### 2. Handle Timing Variability

```typescript
// Use generous timeouts for blockchain operations
await expect(locator).toBeVisible({ timeout: 60_000 });

// Add retry logic for flaky operations
await test.step("Wait for balance update", async () => {
  await expect
    .poll(async () => await getBalance(address), {
      intervals: [2_000, 5_000, 10_000],
      timeout: 60_000,
    })
    .toBeGreaterThan(0n);
});
```

### 3. Clean Up Resources

```typescript
test.afterAll(async () => {
  // Return unused tokens to faucet
  // Clean up test contracts if possible
  // Reset account state
});
```

### 4. Log Everything

```typescript
test("transfer tokens", async ({ page }) => {
  const balance = await getBalance(testAccount.address);
  console.log(`Starting balance: ${balance}`);

  // ... perform transfer

  const newBalance = await getBalance(testAccount.address);
  console.log(`Ending balance: ${newBalance}`);
  console.log(`Difference: ${balance - newBalance}`);
});
```

### 5. Use Test Tags

```typescript
// Run only smoke tests in pre-merge
test("critical transfer flow @smoke", async () => {});

// Run full suite nightly
test("edge case handling @full", async () => {});

// pnpm test:e2e --grep @smoke
```
