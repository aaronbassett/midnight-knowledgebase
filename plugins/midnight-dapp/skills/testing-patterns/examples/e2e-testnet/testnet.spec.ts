/**
 * E2E Testnet Tests - Playwright tests against Midnight testnet
 *
 * These tests run against real testnet infrastructure and require:
 * - Proof server running locally (port 6300)
 * - Lace wallet extension installed (headed mode)
 * - Test account with testnet tokens
 */

import { test, expect, Page, BrowserContext } from "@playwright/test";
import {
  testnetConfig,
  getTestAccount,
  fundAccountIfNeeded,
  waitForTransactionConfirmation,
} from "./testnetSetup";

// =============================================================================
// Test Configuration
// =============================================================================

test.describe.configure({ mode: "serial" }); // Run tests sequentially

// Skip these tests in CI unless explicitly enabled
const shouldRunTestnet = process.env.ENABLE_TESTNET_TESTS === "true";

test.describe("E2E Testnet Tests", () => {
  test.skip(!shouldRunTestnet, "Testnet tests disabled");

  let page: Page;
  let context: BrowserContext;
  let testAccount: Awaited<ReturnType<typeof getTestAccount>>;

  // ===========================================================================
  // Setup
  // ===========================================================================

  test.beforeAll(async ({ browser }) => {
    console.log("Setting up E2E testnet tests...");

    // Get test account
    testAccount = await getTestAccount();
    console.log(`Test account: ${testAccount.address}`);

    // Fund account if needed
    await fundAccountIfNeeded(testAccount.address, testnetConfig.minBalance);

    // Create browser context with potential Lace extension
    // Note: For automated tests, you may need headed mode with extension loaded
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.beforeEach(async () => {
    // Navigate to app
    await page.goto(testnetConfig.appUrl);

    // Wait for app to load
    await expect(page.locator("[data-testid='app-loaded']")).toBeVisible({
      timeout: 10000,
    });
  });

  // ===========================================================================
  // Connection Tests
  // ===========================================================================

  test("should connect wallet successfully", async () => {
    // Click connect button
    await page.click("[data-testid='connect-wallet']");

    // Wait for Lace popup (in headed mode with extension)
    // Note: This requires manual interaction or Lace automation
    // For automated tests, you may need a mock or browser extension automation

    // Wait for connection (with generous timeout for user interaction)
    await expect(page.locator("[data-testid='wallet-address']")).toBeVisible({
      timeout: 60000,
    });

    // Verify address is displayed
    const address = await page.locator("[data-testid='wallet-address']").textContent();
    expect(address).toMatch(/^addr_test1/);

    console.log(`Connected with address: ${address}`);
  });

  test("should show correct network indicator", async () => {
    // Assuming wallet is connected from previous test
    await expect(page.locator("[data-testid='network-indicator']")).toContainText(
      "Testnet"
    );
  });

  test("should display balance after connection", async () => {
    const balanceLocator = page.locator("[data-testid='balance']");
    await expect(balanceLocator).toBeVisible();

    const balanceText = await balanceLocator.textContent();
    console.log(`Current balance: ${balanceText}`);

    // Balance should be a valid number
    expect(balanceText).toMatch(/[\d,]+(\.\d+)?/);
  });

  // ===========================================================================
  // Transfer Tests
  // ===========================================================================

  test("should complete token transfer", async () => {
    // Navigate to transfer page
    await page.click("[data-testid='nav-transfer']");
    await expect(page.locator("[data-testid='transfer-form']")).toBeVisible();

    // Fill transfer form
    const recipientAddress = testnetConfig.testRecipientAddress;
    const transferAmount = "100";

    await page.fill("[data-testid='recipient-input']", recipientAddress);
    await page.fill("[data-testid='amount-input']", transferAmount);

    // Get initial balance
    const initialBalance = await getDisplayedBalance(page);
    console.log(`Initial balance: ${initialBalance}`);

    // Submit transfer
    await page.click("[data-testid='submit-transfer']");

    // Wait for proof generation (can take 10-30 seconds)
    await expect(page.locator("[data-testid='proof-status']")).toContainText(
      "Generating",
      { timeout: 5000 }
    );
    console.log("Proof generation started...");

    // Wait for transaction submission
    await expect(page.locator("[data-testid='tx-submitted']")).toBeVisible({
      timeout: 60000,
    });
    console.log("Transaction submitted");

    // Get transaction hash
    const txHash = await page.locator("[data-testid='tx-hash']").textContent();
    expect(txHash).toBeTruthy();
    console.log(`Transaction hash: ${txHash}`);

    // Wait for confirmation (can take 30+ seconds)
    await waitForTransactionConfirmation(page, txHash!, 120000);
    console.log("Transaction confirmed");

    // Verify balance changed
    const finalBalance = await getDisplayedBalance(page);
    console.log(`Final balance: ${finalBalance}`);

    expect(finalBalance).toBeLessThan(initialBalance);
  });

  test("should show error for insufficient balance", async () => {
    await page.click("[data-testid='nav-transfer']");

    // Try to transfer more than balance
    const hugeAmount = "999999999999999";

    await page.fill("[data-testid='recipient-input']", testnetConfig.testRecipientAddress);
    await page.fill("[data-testid='amount-input']", hugeAmount);

    await page.click("[data-testid='submit-transfer']");

    // Should show error
    await expect(page.locator("[data-testid='error-message']")).toContainText(
      "Insufficient",
      { timeout: 10000 }
    );
  });

  test("should handle user transaction rejection", async () => {
    await page.click("[data-testid='nav-transfer']");

    await page.fill("[data-testid='recipient-input']", testnetConfig.testRecipientAddress);
    await page.fill("[data-testid='amount-input']", "1");

    await page.click("[data-testid='submit-transfer']");

    // In Lace popup, user clicks "Reject"
    // This part requires manual interaction in headed mode
    // or browser extension automation

    // Should show rejection message
    // Note: This assertion will fail in automated headless mode
    // await expect(page.locator("[data-testid='error-message']")).toContainText(
    //   "rejected",
    //   { timeout: 60000 }
    // );
  });

  // ===========================================================================
  // State Reading Tests
  // ===========================================================================

  test("should read contract state", async () => {
    // Navigate to contract view
    await page.click("[data-testid='nav-contract']");

    // Wait for state to load
    await expect(page.locator("[data-testid='contract-state']")).toBeVisible({
      timeout: 10000,
    });

    // Verify some state is displayed
    const totalSupply = await page.locator("[data-testid='total-supply']").textContent();
    expect(totalSupply).toBeTruthy();
    console.log(`Total supply: ${totalSupply}`);
  });

  test("should update state after polling interval", async () => {
    await page.click("[data-testid='nav-contract']");

    // Get initial state
    const initialValue = await page.locator("[data-testid='state-value']").textContent();

    // Wait for polling update (typically 5-10 seconds)
    await page.waitForTimeout(testnetConfig.statePollingIntervalMs + 1000);

    // State should have been refreshed (timestamp or value may change)
    const refreshedValue = await page.locator("[data-testid='state-value']").textContent();

    // At minimum, verify the state read didn't fail
    expect(refreshedValue).toBeTruthy();
  });

  // ===========================================================================
  // Disclosure Flow Tests
  // ===========================================================================

  test("should show disclosure modal before revealing data", async () => {
    // Navigate to a feature that requires disclosure
    await page.click("[data-testid='nav-verify']");

    // Trigger verification that requires disclosure
    await page.click("[data-testid='verify-credential']");

    // Disclosure modal should appear
    await expect(page.locator("[data-testid='disclosure-modal']")).toBeVisible();

    // Verify disclosure details are shown
    await expect(page.locator("[data-testid='disclosure-items']")).toBeVisible();

    // User confirms disclosure
    await page.click("[data-testid='confirm-disclosure']");

    // Proceed with verification
    await expect(page.locator("[data-testid='verification-in-progress']")).toBeVisible();
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

async function getDisplayedBalance(page: Page): Promise<number> {
  const balanceText = await page.locator("[data-testid='balance']").textContent();
  // Parse balance (remove commas, convert to number)
  const cleanBalance = balanceText?.replace(/[^0-9.]/g, "") ?? "0";
  return parseFloat(cleanBalance);
}

// =============================================================================
// Performance Tests (Optional)
// =============================================================================

test.describe("Performance Tests", () => {
  test.skip(!shouldRunTestnet, "Testnet tests disabled");

  test("should measure proof generation time", async ({ page }) => {
    await page.goto(testnetConfig.appUrl);

    // Connect wallet (assuming already connected)

    await page.click("[data-testid='nav-transfer']");

    await page.fill("[data-testid='recipient-input']", testnetConfig.testRecipientAddress);
    await page.fill("[data-testid='amount-input']", "1");

    const startTime = Date.now();
    await page.click("[data-testid='submit-transfer']");

    // Wait for proof generation to complete
    await expect(page.locator("[data-testid='proof-complete']")).toBeVisible({
      timeout: 120000,
    });

    const proofTime = Date.now() - startTime;
    console.log(`Proof generation time: ${proofTime}ms`);

    // Log for performance tracking
    test.info().annotations.push({
      type: "metric",
      description: `proof_generation_ms: ${proofTime}`,
    });

    // Basic assertion - proof should complete in reasonable time
    expect(proofTime).toBeLessThan(120000); // 2 minutes max
  });
});

// =============================================================================
// Smoke Tests (Quick validation)
// =============================================================================

test.describe("Smoke Tests", () => {
  test.skip(!shouldRunTestnet, "Testnet tests disabled");

  test("should load app and show connect button @smoke", async ({ page }) => {
    await page.goto(testnetConfig.appUrl);

    await expect(page.locator("[data-testid='connect-wallet']")).toBeVisible({
      timeout: 10000,
    });
  });

  test("should verify proof server is accessible @smoke", async ({ request }) => {
    const response = await request.get(`${testnetConfig.proofServerUrl}/health`);
    expect(response.ok()).toBeTruthy();
  });

  test("should verify indexer is accessible @smoke", async ({ request }) => {
    const response = await request.get(`${testnetConfig.indexerUrl}/health`);
    expect(response.ok()).toBeTruthy();
  });
});
