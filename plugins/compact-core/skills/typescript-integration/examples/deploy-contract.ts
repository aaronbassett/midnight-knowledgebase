/**
 * Contract Deployment Example
 *
 * This file demonstrates deploying a Midnight Compact contract from TypeScript,
 * including provider setup, state initialization, and deployment verification.
 *
 * Corresponding Compact contract (token.compact):
 * ```compact
 * ledger {
 *     admin: Bytes<32>;
 *     total_supply: Uint<128>;
 *     balances: Map<Bytes<32>, Uint<128>>;
 *     allowances: Map<Bytes<32>, Map<Bytes<32>, Uint<128>>>;
 *     is_paused: Boolean;
 * }
 *
 * witness get_admin_key(): Bytes<32>;
 *
 * export circuit initialize(name: Opaque<'string'>, symbol: Opaque<'string'>): [];
 * export circuit mint(to: Bytes<32>, amount: Uint<128>): [];
 * export circuit transfer(to: Bytes<32>, amount: Uint<128>): [];
 * ```
 */

import type { WitnessContext } from "@midnight-ntwrk/midnight-js-types";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Initial ledger state for deployment
 */
interface TokenLedgerState {
  admin: Uint8Array; // Bytes<32>
  total_supply: bigint; // Uint<128>
  is_paused: boolean; // Boolean
}

/**
 * Private state for admin operations
 */
interface TokenPrivateState {
  adminKey: Uint8Array;
  nonce: bigint;
}

/**
 * Deployment configuration
 */
interface DeploymentConfig {
  networkId: "testnet" | "mainnet";
  nodeUrl: string;
  indexerUrl: string;
  tokenName: string;
  tokenSymbol: string;
  initialSupply: bigint;
  decimals: number;
}

/**
 * Deployment result
 */
interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  blockNumber: bigint;
  gasUsed: bigint;
}

// =============================================================================
// Mock SDK Types (replace with actual imports)
// =============================================================================

// These would be imported from @midnight-ntwrk/midnight-js-*
interface MidnightProvider {
  connect(): Promise<void>;
  getAddress(): Promise<Uint8Array>;
  getBalance(): Promise<bigint>;
  networkId: string;
}

interface ContractModule {
  // Generated contract module type
}

interface DeployOptions<L, P> {
  contractModule: ContractModule;
  initialLedgerState: L;
  initialPrivateState: P;
  witnesses: Record<string, Function>;
  privateStateKey: string;
  options?: {
    gasLimit?: bigint;
    timeout?: number;
    confirmations?: number;
    onProofGenerated?: () => void;
    onTransactionSubmitted?: (txHash: string) => void;
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// =============================================================================
// Witness Implementation
// =============================================================================

const createWitnesses = (adminKey: Uint8Array) => ({
  get_admin_key: ({ privateState }: WitnessContext<TokenPrivateState>): Uint8Array => {
    return privateState.adminKey;
  },

  get_nonce: ({
    privateState,
    setPrivateState,
  }: WitnessContext<TokenPrivateState>): bigint => {
    const nonce = privateState.nonce;
    setPrivateState({ ...privateState, nonce: nonce + 1n });
    return nonce;
  },
});

// =============================================================================
// Deployment Functions
// =============================================================================

/**
 * Deploy a new token contract
 */
async function deployTokenContract(
  config: DeploymentConfig
): Promise<DeploymentResult> {
  console.log("=".repeat(60));
  console.log("Midnight Token Contract Deployment");
  console.log("=".repeat(60));

  // 1. Generate admin key (in production, use secure key management)
  console.log("\n1. Generating admin key...");
  const adminKey = new Uint8Array(32);
  crypto.getRandomValues(adminKey);
  console.log("   Admin public key:", bytesToHex(adminKey).substring(0, 16) + "...");

  // 2. Create provider (mock - use actual SDK)
  console.log("\n2. Connecting to network...");
  console.log(`   Network: ${config.networkId}`);
  console.log(`   Node URL: ${config.nodeUrl}`);

  // Mock provider - replace with actual implementation:
  // import { MidnightProvider } from '@midnight-ntwrk/midnight-js-provider';
  // const provider = new MidnightProvider({
  //   networkId: config.networkId,
  //   nodeUrl: config.nodeUrl,
  //   indexerUrl: config.indexerUrl
  // });
  // await provider.connect();

  const mockWalletAddress = new Uint8Array(32);
  crypto.getRandomValues(mockWalletAddress);
  console.log("   Connected as:", bytesToHex(mockWalletAddress).substring(0, 16) + "...");

  // 3. Check balance
  console.log("\n3. Checking balance...");
  const mockBalance = 1000000n * 10n ** 18n;
  console.log(`   Balance: ${mockBalance / 10n ** 18n} tokens`);

  const minRequired = 100n * 10n ** 18n;
  if (mockBalance < minRequired) {
    throw new Error(`Insufficient balance. Required: ${minRequired}, Available: ${mockBalance}`);
  }

  // 4. Prepare initial states
  console.log("\n4. Preparing initial state...");

  const initialLedgerState: TokenLedgerState = {
    admin: adminKey,
    total_supply: config.initialSupply * 10n ** BigInt(config.decimals),
    is_paused: false,
  };

  const initialPrivateState: TokenPrivateState = {
    adminKey: adminKey,
    nonce: 0n,
  };

  console.log(`   Token name: ${config.tokenName}`);
  console.log(`   Token symbol: ${config.tokenSymbol}`);
  console.log(`   Initial supply: ${config.initialSupply}`);
  console.log(`   Decimals: ${config.decimals}`);

  // 5. Create witnesses
  console.log("\n5. Creating witnesses...");
  const witnesses = createWitnesses(adminKey);

  // 6. Deploy contract (mock - use actual SDK)
  console.log("\n6. Deploying contract...");
  console.log("   Generating proof...");

  // Mock deployment - replace with actual implementation:
  // import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
  // import { TokenContract } from './build/token';
  //
  // const deployment = await deployContract(provider, {
  //   contractModule: TokenContract,
  //   initialLedgerState,
  //   initialPrivateState,
  //   witnesses,
  //   privateStateKey: 'my-token',
  //   options: {
  //     gasLimit: 5_000_000n,
  //     onProofGenerated: () => console.log('   Proof generated'),
  //     onTransactionSubmitted: (tx) => console.log('   TX submitted:', tx)
  //   }
  // });

  // Simulate deployment delay
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("   Proof generated");

  await new Promise((resolve) => setTimeout(resolve, 500));
  const mockTxHash = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  console.log(`   TX submitted: ${mockTxHash.substring(0, 16)}...`);

  await new Promise((resolve) => setTimeout(resolve, 500));
  const mockContractAddress = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

  const result: DeploymentResult = {
    contractAddress: mockContractAddress,
    transactionHash: mockTxHash,
    blockNumber: 12345n,
    gasUsed: 2_500_000n,
  };

  // 7. Output results
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Successful!");
  console.log("=".repeat(60));
  console.log(`Contract Address: ${result.contractAddress}`);
  console.log(`Transaction Hash: ${result.transactionHash}`);
  console.log(`Block Number:     ${result.blockNumber}`);
  console.log(`Gas Used:         ${result.gasUsed}`);

  return result;
}

/**
 * Verify a deployed contract
 */
async function verifyDeployment(
  contractAddress: string,
  expectedAdmin: Uint8Array
): Promise<boolean> {
  console.log("\nVerifying deployment...");

  // Mock verification - replace with actual implementation:
  // const contract = createTokenContract(provider, contractAddress);
  // const admin = await contract.state.admin();
  // const totalSupply = await contract.state.total_supply();
  // const isPaused = await contract.state.is_paused();

  // Verify state matches expectations
  console.log("  Checking admin address... OK");
  console.log("  Checking total supply... OK");
  console.log("  Checking pause status... OK");

  console.log("\nDeployment verified successfully!");
  return true;
}

/**
 * Save deployment information to file
 */
async function saveDeploymentInfo(
  config: DeploymentConfig,
  result: DeploymentResult,
  outputPath: string
): Promise<void> {
  const deploymentInfo = {
    network: config.networkId,
    contractAddress: result.contractAddress,
    transactionHash: result.transactionHash,
    blockNumber: result.blockNumber.toString(),
    gasUsed: result.gasUsed.toString(),
    tokenName: config.tokenName,
    tokenSymbol: config.tokenSymbol,
    initialSupply: config.initialSupply.toString(),
    decimals: config.decimals,
    deployedAt: new Date().toISOString(),
  };

  // In Node.js:
  // await fs.writeFile(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\nDeployment info saved to: ${outputPath}`);
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

// =============================================================================
// Main Deployment Script
// =============================================================================

async function main() {
  // Configuration
  const config: DeploymentConfig = {
    networkId: "testnet",
    nodeUrl: "https://rpc.testnet.midnight.network",
    indexerUrl: "https://indexer.testnet.midnight.network",
    tokenName: "Example Token",
    tokenSymbol: "EXT",
    initialSupply: 1_000_000n,
    decimals: 18,
  };

  try {
    // Deploy contract
    const result = await deployTokenContract(config);

    // Generate admin key for verification (in production, load from secure storage)
    const adminKey = new Uint8Array(32); // Would be the actual admin key

    // Verify deployment
    await verifyDeployment(result.contractAddress, adminKey);

    // Save deployment info
    await saveDeploymentInfo(
      config,
      result,
      `./deployments/${config.networkId}-token.json`
    );

    console.log("\n" + "=".repeat(60));
    console.log("Deployment complete!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\nDeployment failed:", error);
    process.exit(1);
  }
}

// =============================================================================
// Multi-Contract Deployment Example
// =============================================================================

async function deployTokenSystem() {
  console.log("Deploying complete token system...\n");

  // 1. Deploy token contract
  console.log("Step 1: Deploying Token Contract");
  const tokenResult = await deployTokenContract({
    networkId: "testnet",
    nodeUrl: "https://rpc.testnet.midnight.network",
    indexerUrl: "https://indexer.testnet.midnight.network",
    tokenName: "Governance Token",
    tokenSymbol: "GOV",
    initialSupply: 100_000_000n,
    decimals: 18,
  });

  // 2. Deploy governance contract (referencing token)
  console.log("\nStep 2: Deploying Governance Contract");
  // const governanceResult = await deployGovernanceContract({
  //   tokenAddress: tokenResult.contractAddress,
  //   proposalThreshold: 100_000n * 10n ** 18n,
  //   votingPeriod: 7n * 24n * 60n * 60n
  // });

  // 3. Deploy treasury contract
  console.log("\nStep 3: Deploying Treasury Contract");
  // const treasuryResult = await deployTreasuryContract({
  //   tokenAddress: tokenResult.contractAddress,
  //   governanceAddress: governanceResult.contractAddress
  // });

  // 4. Configure token to recognize governance
  console.log("\nStep 4: Configuring Token");
  // await tokenContract.callTx.set_governance(
  //   hexToBytes(governanceResult.contractAddress),
  //   witnesses
  // );

  console.log("\nToken system deployment complete!");
  return {
    token: tokenResult,
    // governance: governanceResult,
    // treasury: treasuryResult
  };
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  deployTokenContract,
  verifyDeployment,
  saveDeploymentInfo,
  deployTokenSystem,
  DeploymentConfig,
  DeploymentResult,
};
