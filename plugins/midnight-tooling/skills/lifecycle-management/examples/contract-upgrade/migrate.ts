/**
 * Contract Upgrade Migration Example
 *
 * Migrate from an old contract version to a new version,
 * including state transformation and verification.
 *
 * Prerequisites:
 * - Old contract deployed and address known
 * - New contract artifact compiled
 * - Backup of old contract state
 * - MIDNIGHT_WALLET_SEED environment variable
 *
 * Usage:
 *   OLD_CONTRACT_ADDRESS="0x..." MIDNIGHT_WALLET_SEED="..." npx ts-node migrate.ts
 */

import * as fs from 'fs/promises';
import { deployContract, connectContract, ConnectedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet, Wallet } from '@midnight-ntwrk/midnight-js-wallet';
import { createIndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

// Import contract versions
import { Contract as OldContract } from './build-v1/contract.cjs';
import { Contract as NewContract } from './build-v2/contract.cjs';
import type { ContractState as OldState } from './build-v1/contract.d.cts';
import type { ContractState as NewState } from './build-v2/contract.d.cts';

// Network configuration
interface NetworkConfig {
  indexer: string;
  indexerWs: string;
  prover: string;
}

// Migration result
interface MigrationResult {
  success: boolean;
  oldContractAddress: string;
  newContractAddress?: string;
  error?: string;
  rollbackAvailable: boolean;
}

// Migration step interface
interface MigrationStep {
  name: string;
  execute: () => Promise<void>;
  verify: () => Promise<boolean>;
  rollback?: () => Promise<void>;
}

function getNetworkConfig(): NetworkConfig {
  return {
    indexer: process.env.INDEXER_URL || 'https://indexer.testnet.midnight.network',
    indexerWs: process.env.INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/ws',
    prover: process.env.PROVER_URL || 'https://prover.testnet.midnight.network',
  };
}

// State transformation from v1 to v2
function transformState(oldState: OldState): NewState {
  console.log('Transforming state from v1 to v2...');

  // Example transformations:
  // 1. Add new fields with default values
  // 2. Rename fields
  // 3. Restructure data
  // 4. Convert types

  const newState: NewState = {
    // Preserved fields
    totalSupply: oldState.totalSupply,
    owner: oldState.owner,

    // Migrated balances (same structure)
    balances: oldState.balances,

    // New field in v2 with default
    version: 2n,

    // New field: track migration time
    migratedAt: BigInt(Date.now()),

    // Restructured metadata
    metadata: {
      name: oldState.name,
      symbol: oldState.symbol,
      decimals: oldState.decimals,
      // New metadata field
      description: '',
    },

    // New feature in v2
    paused: false,
  } as unknown as NewState;

  return newState;
}

// Validate transformed state
function validateNewState(state: NewState): string[] {
  const errors: string[] = [];

  if (!state.totalSupply || state.totalSupply < 0n) {
    errors.push('Invalid totalSupply');
  }

  if (!state.owner || state.owner === '') {
    errors.push('Missing owner address');
  }

  if (state.version !== 2n) {
    errors.push('Version must be 2');
  }

  return errors;
}

// Create migration steps
function createMigrationSteps(
  oldContract: ConnectedContract<OldState, unknown>,
  wallet: Wallet,
  config: NetworkConfig
): { steps: MigrationStep[]; getNewAddress: () => string | undefined } {
  let exportedState: OldState | undefined;
  let transformedState: NewState | undefined;
  let newContractAddress: string | undefined;

  const steps: MigrationStep[] = [
    {
      name: 'Export state from old contract',
      execute: async () => {
        exportedState = await oldContract.query.export_state() as OldState;
        console.log('  Exported state with', Object.keys(exportedState).length, 'fields');
      },
      verify: async () => {
        return exportedState !== undefined;
      },
    },
    {
      name: 'Transform state to new schema',
      execute: async () => {
        if (!exportedState) throw new Error('No exported state');
        transformedState = transformState(exportedState);

        const errors = validateNewState(transformedState);
        if (errors.length > 0) {
          throw new Error(`State validation failed: ${errors.join(', ')}`);
        }

        console.log('  State transformed and validated');
      },
      verify: async () => {
        return transformedState !== undefined;
      },
    },
    {
      name: 'Deploy new contract with migrated state',
      execute: async () => {
        if (!transformedState) throw new Error('No transformed state');

        const deployed = await deployContract({
          wallet,
          artifact: NewContract,
          initialState: transformedState,
          config,
        });

        const confirmation = await deployed.waitForConfirmation({
          timeout: 180000,
        });

        if (confirmation.status !== 'confirmed') {
          throw new Error(`Deployment failed: ${confirmation.error}`);
        }

        newContractAddress = confirmation.address;
        console.log('  New contract deployed at:', newContractAddress);
      },
      verify: async () => {
        if (!newContractAddress) return false;

        // Verify new contract responds
        const newContract = await connectContract({
          address: newContractAddress,
          artifact: NewContract,
          wallet,
          config,
        });

        const version = await newContract.query.get_version();
        return version === 2n;
      },
    },
    {
      name: 'Verify state migration',
      execute: async () => {
        if (!newContractAddress || !exportedState) {
          throw new Error('Missing addresses or state');
        }

        const newContract = await connectContract({
          address: newContractAddress,
          artifact: NewContract,
          wallet,
          config,
        });

        // Verify critical state values match
        const [newTotalSupply, newOwner] = await Promise.all([
          newContract.query.get_total_supply(),
          newContract.query.get_owner(),
        ]);

        if (newTotalSupply !== exportedState.totalSupply) {
          throw new Error('Total supply mismatch after migration');
        }

        if (newOwner !== exportedState.owner) {
          throw new Error('Owner mismatch after migration');
        }

        console.log('  State verification passed');
      },
      verify: async () => true,
    },
    {
      name: 'Deprecate old contract',
      execute: async () => {
        if (!newContractAddress) throw new Error('No new contract address');

        try {
          await oldContract.call.deprecate({
            successor: newContractAddress,
          });
          console.log('  Old contract marked as deprecated');
        } catch {
          console.log('  Old contract does not support deprecation (skipped)');
        }
      },
      verify: async () => true,
      rollback: async () => {
        try {
          await oldContract.call.undeprecate();
          console.log('  Old contract reactivated');
        } catch {
          console.log('  Cannot reactivate old contract');
        }
      },
    },
  ];

  return {
    steps,
    getNewAddress: () => newContractAddress,
  };
}

// Execute migration with rollback support
async function executeMigration(
  steps: MigrationStep[]
): Promise<{ success: boolean; completedSteps: number }> {
  const completedSteps: MigrationStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\nStep ${i + 1}/${steps.length}: ${step.name}`);

    try {
      await step.execute();

      const verified = await step.verify();
      if (!verified) {
        throw new Error('Step verification failed');
      }

      completedSteps.push(step);
      console.log('  Completed');
    } catch (error) {
      console.error(`  Failed: ${(error as Error).message}`);

      // Attempt rollback
      console.log('\nInitiating rollback...');
      for (const completed of completedSteps.reverse()) {
        if (completed.rollback) {
          try {
            await completed.rollback();
          } catch (rollbackError) {
            console.error(`  Rollback failed for "${completed.name}"`);
          }
        }
      }

      return { success: false, completedSteps: completedSteps.length };
    }
  }

  return { success: true, completedSteps: completedSteps.length };
}

// Save migration result
async function saveMigrationResult(result: MigrationResult): Promise<void> {
  const filename = `migration-${Date.now()}.json`;
  await fs.writeFile(filename, JSON.stringify(result, null, 2));
  console.log(`\nMigration result saved to: ${filename}`);
}

// Main migration function
async function migrate(): Promise<MigrationResult> {
  // Validate environment
  const oldContractAddress = process.env.OLD_CONTRACT_ADDRESS;
  if (!oldContractAddress) {
    throw new Error('OLD_CONTRACT_ADDRESS environment variable required');
  }

  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) {
    throw new Error('MIDNIGHT_WALLET_SEED environment variable required');
  }

  const config = getNetworkConfig();
  console.log('=== Contract Migration ===');
  console.log('Old contract:', oldContractAddress);
  console.log('Network:', config.indexer);

  // Create wallet
  const wallet = await createWallet({
    seed,
    keyIndex: parseInt(process.env.WALLET_KEY_INDEX || '0'),
  });

  const walletAddress = await wallet.getAddress();
  console.log('Wallet:', walletAddress);

  // Check balance
  const indexer = createIndexerClient({ url: config.indexer });
  const balance = await indexer.getBalance(walletAddress);
  console.log('Balance:', balance.unshielded, 'tDUST');

  const MIN_BALANCE = BigInt(20_000_000);
  if (balance.unshielded < MIN_BALANCE) {
    throw new Error(`Insufficient balance. Need at least ${MIN_BALANCE} tDUST`);
  }

  // Connect to old contract
  console.log('\nConnecting to old contract...');
  const oldContract = await connectContract<OldState, unknown>({
    address: oldContractAddress,
    artifact: OldContract,
    wallet,
    config,
  });

  // Create and execute migration steps
  const { steps, getNewAddress } = createMigrationSteps(
    oldContract,
    wallet,
    config
  );

  console.log(`\nExecuting ${steps.length} migration steps...`);
  const { success, completedSteps } = await executeMigration(steps);

  const result: MigrationResult = {
    success,
    oldContractAddress,
    newContractAddress: getNewAddress(),
    rollbackAvailable: completedSteps < steps.length,
  };

  if (!success) {
    result.error = `Failed after ${completedSteps} steps`;
  }

  return result;
}

// Run migration
migrate()
  .then(async (result) => {
    await saveMigrationResult(result);

    if (result.success) {
      console.log('\n=== Migration Successful ===');
      console.log('New contract address:', result.newContractAddress);
      console.log('\nNext steps:');
      console.log('1. Update frontend configuration');
      console.log('2. Update any dependent contracts');
      console.log('3. Notify users of new address');
      console.log('4. Monitor new contract for issues');
      process.exit(0);
    } else {
      console.log('\n=== Migration Failed ===');
      console.log('Error:', result.error);
      if (result.rollbackAvailable) {
        console.log('Rollback was attempted');
      }
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Migration error:', error.message);
    process.exit(1);
  });
