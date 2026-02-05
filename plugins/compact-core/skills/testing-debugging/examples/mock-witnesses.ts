/**
 * Witness Mocking Patterns for Midnight Compact Testing
 *
 * This file demonstrates various patterns for mocking witness functions
 * when testing Compact smart contracts.
 */

import { WitnessProvider, TestContext } from '@midnight-ntwrk/compact-testing';
import { MerkleTree, hash } from '@midnight-ntwrk/midnight-js-crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * User account data stored off-chain
 */
interface UserAccount {
    privateKey: Uint8Array;
    balance: bigint;
    nonce: bigint;
}

/**
 * Vote data for a voting contract
 */
interface VoteData {
    proposalId: bigint;
    choice: number;  // 0 = no, 1 = yes, 2 = abstain
    voterSecret: Uint8Array;
}

/**
 * Token balance proof with Merkle path
 */
interface BalanceProof {
    balance: bigint;
    path: Uint8Array[];
    index: number;
}

// ============================================================================
// Basic Witness Mocking
// ============================================================================

/**
 * Simple static witness mock.
 * Use when witness values don't change during test.
 */
function createStaticWitnesses(account: UserAccount): WitnessProvider {
    return {
        get_private_key: () => account.privateKey,
        get_balance: () => account.balance,
        get_nonce: () => account.nonce
    };
}

// Example usage:
// const witnesses = createStaticWitnesses({
//     privateKey: new Uint8Array(32).fill(0x42),
//     balance: BigInt(1000),
//     nonce: BigInt(0)
// });
// await ctx.call('transfer', [recipient, amount], witnesses);

// ============================================================================
// Dynamic Witness Mocking
// ============================================================================

/**
 * Creates witnesses that track state changes.
 * Useful for testing sequences of operations.
 */
class DynamicWitnessProvider implements WitnessProvider {
    private accounts: Map<string, UserAccount> = new Map();
    private currentUser: string = '';

    constructor() {
        this.accounts = new Map();
    }

    /**
     * Registers a user account.
     */
    registerAccount(userId: string, account: UserAccount): void {
        this.accounts.set(userId, account);
    }

    /**
     * Sets the current user context.
     */
    setCurrentUser(userId: string): void {
        if (!this.accounts.has(userId)) {
            throw new Error(`Unknown user: ${userId}`);
        }
        this.currentUser = userId;
    }

    /**
     * Updates a user's balance.
     */
    updateBalance(userId: string, newBalance: bigint): void {
        const account = this.accounts.get(userId);
        if (!account) throw new Error(`Unknown user: ${userId}`);
        account.balance = newBalance;
    }

    /**
     * Increments a user's nonce.
     */
    incrementNonce(userId: string): void {
        const account = this.accounts.get(userId);
        if (!account) throw new Error(`Unknown user: ${userId}`);
        account.nonce += BigInt(1);
    }

    // WitnessProvider implementation
    get_private_key = (): Uint8Array => {
        const account = this.accounts.get(this.currentUser);
        if (!account) throw new Error('No current user set');
        return account.privateKey;
    };

    get_balance = (): bigint => {
        const account = this.accounts.get(this.currentUser);
        if (!account) throw new Error('No current user set');
        return account.balance;
    };

    get_nonce = (): bigint => {
        const account = this.accounts.get(this.currentUser);
        if (!account) throw new Error('No current user set');
        return account.nonce;
    };
}

// Example usage:
// const provider = new DynamicWitnessProvider();
// provider.registerAccount('alice', { privateKey: aliceKey, balance: 1000n, nonce: 0n });
// provider.registerAccount('bob', { privateKey: bobKey, balance: 500n, nonce: 0n });
//
// provider.setCurrentUser('alice');
// await ctx.call('transfer', [bobAddress, 100n], provider);
// provider.updateBalance('alice', 900n);
// provider.updateBalance('bob', 600n);
// provider.incrementNonce('alice');

// ============================================================================
// Merkle Tree Witness Mocking
// ============================================================================

/**
 * Creates witnesses for Merkle tree membership proofs.
 */
class MerkleWitnessProvider implements WitnessProvider {
    private tree: MerkleTree;
    private leaves: Map<string, { data: Uint8Array; index: number }> = new Map();
    private currentLeafId: string = '';

    constructor(depth: number = 20) {
        this.tree = new MerkleTree(depth);
    }

    /**
     * Adds a leaf to the tree.
     */
    addLeaf(id: string, data: Uint8Array): number {
        const leafHash = this.computeLeafHash(data);
        const index = this.tree.insert(leafHash);
        this.leaves.set(id, { data, index });
        return index;
    }

    /**
     * Sets the current leaf for proof generation.
     */
    setCurrentLeaf(id: string): void {
        if (!this.leaves.has(id)) {
            throw new Error(`Unknown leaf: ${id}`);
        }
        this.currentLeafId = id;
    }

    /**
     * Gets the current Merkle root.
     */
    getRoot(): Uint8Array {
        return this.tree.root();
    }

    /**
     * Computes the leaf hash.
     */
    private computeLeafHash(data: Uint8Array): Uint8Array {
        return hash(data);
    }

    // WitnessProvider implementation
    get_leaf_data = (): Uint8Array => {
        const leaf = this.leaves.get(this.currentLeafId);
        if (!leaf) throw new Error('No current leaf set');
        return leaf.data;
    };

    get_merkle_path = (): Uint8Array[] => {
        const leaf = this.leaves.get(this.currentLeafId);
        if (!leaf) throw new Error('No current leaf set');

        const leafHash = this.computeLeafHash(leaf.data);
        return this.tree.getPath(leafHash);
    };

    get_leaf_index = (): number => {
        const leaf = this.leaves.get(this.currentLeafId);
        if (!leaf) throw new Error('No current leaf set');
        return leaf.index;
    };
}

// Example usage:
// const merkleProvider = new MerkleWitnessProvider(20);
//
// // Add members
// merkleProvider.addLeaf('alice', aliceData);
// merkleProvider.addLeaf('bob', bobData);
//
// // Set up contract with Merkle root
// await ctx.call('set_membership_root', [merkleProvider.getRoot()]);
//
// // Prove Alice's membership
// merkleProvider.setCurrentLeaf('alice');
// const result = await ctx.call('verify_membership', [], merkleProvider);

// ============================================================================
// Voting Witness Mocking
// ============================================================================

/**
 * Creates witnesses for a voting contract.
 */
class VotingWitnessProvider implements WitnessProvider {
    private votes: Map<string, VoteData> = new Map();
    private currentVoterId: string = '';
    private voterTree: MerkleTree;
    private voterLeaves: Map<string, number> = new Map();

    constructor() {
        this.voterTree = new MerkleTree(16);  // Support up to 65536 voters
    }

    /**
     * Registers a voter with their secret.
     */
    registerVoter(voterId: string, voterSecret: Uint8Array): void {
        // Add voter to the eligibility tree
        const voterHash = hash(voterSecret);
        const index = this.voterTree.insert(voterHash);
        this.voterLeaves.set(voterId, index);
    }

    /**
     * Records a vote.
     */
    setVote(voterId: string, proposalId: bigint, choice: number, voterSecret: Uint8Array): void {
        this.votes.set(voterId, { proposalId, choice, voterSecret });
    }

    /**
     * Sets the current voter context.
     */
    setCurrentVoter(voterId: string): void {
        if (!this.votes.has(voterId)) {
            throw new Error(`No vote recorded for: ${voterId}`);
        }
        this.currentVoterId = voterId;
    }

    /**
     * Gets the voter eligibility Merkle root.
     */
    getVoterRoot(): Uint8Array {
        return this.voterTree.root();
    }

    // WitnessProvider implementation
    get_voter_secret = (): Uint8Array => {
        const vote = this.votes.get(this.currentVoterId);
        if (!vote) throw new Error('No current voter');
        return vote.voterSecret;
    };

    get_vote_choice = (): number => {
        const vote = this.votes.get(this.currentVoterId);
        if (!vote) throw new Error('No current voter');
        return vote.choice;
    };

    get_proposal_id = (): bigint => {
        const vote = this.votes.get(this.currentVoterId);
        if (!vote) throw new Error('No current voter');
        return vote.proposalId;
    };

    get_voter_merkle_path = (): Uint8Array[] => {
        const vote = this.votes.get(this.currentVoterId);
        if (!vote) throw new Error('No current voter');

        const voterHash = hash(vote.voterSecret);
        return this.voterTree.getPath(voterHash);
    };

    // Compute nullifier (prevents double voting)
    get_nullifier = (): Uint8Array => {
        const vote = this.votes.get(this.currentVoterId);
        if (!vote) throw new Error('No current voter');

        // Nullifier = hash(secret || proposalId)
        const data = new Uint8Array(40);
        data.set(vote.voterSecret, 0);

        // Append proposalId (8 bytes)
        let pid = vote.proposalId;
        for (let i = 39; i >= 32; i--) {
            data[i] = Number(pid & BigInt(0xff));
            pid = pid >> BigInt(8);
        }

        return hash(data);
    };
}

// Example usage:
// const votingProvider = new VotingWitnessProvider();
//
// // Register voters
// votingProvider.registerVoter('alice', aliceSecret);
// votingProvider.registerVoter('bob', bobSecret);
//
// // Set up voting contract with eligibility root
// await ctx.call('initialize_proposal', [proposalId, votingProvider.getVoterRoot()]);
//
// // Alice votes
// votingProvider.setVote('alice', proposalId, 1, aliceSecret);  // Vote yes
// votingProvider.setCurrentVoter('alice');
// await ctx.call('cast_vote', [], votingProvider);

// ============================================================================
// Conditional Witness Mocking
// ============================================================================

/**
 * Creates witnesses that return different values based on conditions.
 * Useful for testing different scenarios in the same test.
 */
function createConditionalWitnesses(
    conditions: Record<string, () => unknown>
): WitnessProvider {
    return new Proxy({} as WitnessProvider, {
        get(_target, prop: string) {
            if (conditions[prop]) {
                return conditions[prop];
            }
            throw new Error(`Witness not mocked: ${prop}`);
        }
    });
}

// Example usage:
// let shouldSucceed = true;
//
// const witnesses = createConditionalWitnesses({
//     get_balance: () => shouldSucceed ? BigInt(1000) : BigInt(0),
//     get_private_key: () => privateKey
// });
//
// // Test success case
// shouldSucceed = true;
// await ctx.call('transfer', [recipient, 100n], witnesses);
//
// // Test failure case
// shouldSucceed = false;
// await expect(ctx.call('transfer', [recipient, 100n], witnesses))
//     .rejects.toThrow('Insufficient balance');

// ============================================================================
// Spy Witness Mocking
// ============================================================================

/**
 * Creates witnesses that track how they were called.
 * Useful for verifying circuit behavior.
 */
class SpyWitnessProvider implements WitnessProvider {
    private calls: Map<string, unknown[][]> = new Map();
    private returnValues: Map<string, unknown> = new Map();

    /**
     * Sets the return value for a witness function.
     */
    setReturnValue(witnessName: string, value: unknown): void {
        this.returnValues.set(witnessName, value);
    }

    /**
     * Gets the call history for a witness function.
     */
    getCalls(witnessName: string): unknown[][] {
        return this.calls.get(witnessName) ?? [];
    }

    /**
     * Gets how many times a witness was called.
     */
    getCallCount(witnessName: string): number {
        return this.getCalls(witnessName).length;
    }

    /**
     * Resets all call tracking.
     */
    reset(): void {
        this.calls.clear();
    }

    /**
     * Creates the actual witness provider with spying.
     */
    [key: string]: unknown;

    constructor(witnessNames: string[]) {
        for (const name of witnessNames) {
            this[name] = (...args: unknown[]) => {
                // Track the call
                if (!this.calls.has(name)) {
                    this.calls.set(name, []);
                }
                this.calls.get(name)!.push(args);

                // Return the configured value
                const returnValue = this.returnValues.get(name);
                if (returnValue === undefined) {
                    throw new Error(`No return value set for: ${name}`);
                }
                return returnValue;
            };
        }
    }
}

// Example usage:
// const spyProvider = new SpyWitnessProvider([
//     'get_balance',
//     'get_private_key'
// ]);
//
// spyProvider.setReturnValue('get_balance', BigInt(1000));
// spyProvider.setReturnValue('get_private_key', privateKey);
//
// await ctx.call('transfer', [recipient, 100n], spyProvider);
//
// // Verify witnesses were called
// expect(spyProvider.getCallCount('get_balance')).toBe(1);
// expect(spyProvider.getCallCount('get_private_key')).toBe(1);

// ============================================================================
// Failing Witness Mocking
// ============================================================================

/**
 * Creates witnesses that throw errors for testing error handling.
 */
function createFailingWitness(
    witnessName: string,
    errorMessage: string
): WitnessProvider {
    return {
        [witnessName]: () => {
            throw new Error(errorMessage);
        }
    } as WitnessProvider;
}

/**
 * Creates witnesses that fail after N successful calls.
 */
function createFlakeyWitness(
    witnessName: string,
    successValue: unknown,
    failAfter: number
): WitnessProvider {
    let callCount = 0;

    return {
        [witnessName]: () => {
            callCount++;
            if (callCount > failAfter) {
                throw new Error(`Witness failed after ${failAfter} calls`);
            }
            return successValue;
        }
    } as WitnessProvider;
}

// Example usage:
// // Test handling of witness errors
// const failingWitness = createFailingWitness(
//     'get_external_data',
//     'External service unavailable'
// );
//
// await expect(ctx.call('process', [], failingWitness))
//     .rejects.toThrow('External service unavailable');

// ============================================================================
// Composite Witness Provider
// ============================================================================

/**
 * Combines multiple witness providers into one.
 * Useful for complex contracts with many witnesses.
 */
function combineWitnesses(...providers: WitnessProvider[]): WitnessProvider {
    return new Proxy({} as WitnessProvider, {
        get(_target, prop: string) {
            for (const provider of providers) {
                if (typeof (provider as Record<string, unknown>)[prop] === 'function') {
                    return (provider as Record<string, (...args: unknown[]) => unknown>)[prop];
                }
            }
            throw new Error(`Witness not found in any provider: ${prop}`);
        }
    });
}

// Example usage:
// const accountWitnesses = createStaticWitnesses(aliceAccount);
// const merkleWitnesses = new MerkleWitnessProvider(20);
//
// const combined = combineWitnesses(accountWitnesses, merkleWitnesses);
// await ctx.call('private_transfer', [recipient, amount, commitment], combined);

// ============================================================================
// Test Examples Using Mock Witnesses
// ============================================================================

describe('Transfer Contract with Mocked Witnesses', () => {
    let ctx: TestContext;
    let dynamicProvider: DynamicWitnessProvider;

    beforeEach(async () => {
        ctx = await TestContext.create('contracts/transfer.compact');

        dynamicProvider = new DynamicWitnessProvider();
        dynamicProvider.registerAccount('alice', {
            privateKey: new Uint8Array(32).fill(0xaa),
            balance: BigInt(1000),
            nonce: BigInt(0)
        });
        dynamicProvider.registerAccount('bob', {
            privateKey: new Uint8Array(32).fill(0xbb),
            balance: BigInt(500),
            nonce: BigInt(0)
        });
    });

    it('should track balance changes correctly', async () => {
        dynamicProvider.setCurrentUser('alice');

        await ctx.call('transfer', [
            new Uint8Array(32).fill(0xbb),  // Bob's address
            BigInt(100)
        ], dynamicProvider);

        // Update our local state to match
        dynamicProvider.updateBalance('alice', BigInt(900));
        dynamicProvider.updateBalance('bob', BigInt(600));
        dynamicProvider.incrementNonce('alice');

        // Verify subsequent transfer uses updated values
        const result = await ctx.call('get_balance', [], dynamicProvider);
        expect(result.returnValue).toBe(BigInt(900));
    });
});

describe('Voting Contract with Mocked Witnesses', () => {
    let ctx: TestContext;
    let votingProvider: VotingWitnessProvider;

    beforeEach(async () => {
        ctx = await TestContext.create('contracts/voting.compact');
        votingProvider = new VotingWitnessProvider();

        // Register voters
        const aliceSecret = new Uint8Array(32).fill(0xaa);
        const bobSecret = new Uint8Array(32).fill(0xbb);

        votingProvider.registerVoter('alice', aliceSecret);
        votingProvider.registerVoter('bob', bobSecret);

        // Initialize proposal
        await ctx.call('create_proposal', [
            BigInt(1),  // Proposal ID
            votingProvider.getVoterRoot()
        ]);

        // Set up votes
        votingProvider.setVote('alice', BigInt(1), 1, aliceSecret);  // Yes
        votingProvider.setVote('bob', BigInt(1), 0, bobSecret);       // No
    });

    it('should accept valid vote', async () => {
        votingProvider.setCurrentVoter('alice');

        const result = await ctx.call('cast_vote', [], votingProvider);
        expect(result.success).toBe(true);
    });

    it('should reject double voting', async () => {
        votingProvider.setCurrentVoter('alice');
        await ctx.call('cast_vote', [], votingProvider);

        // Try to vote again
        await expect(ctx.call('cast_vote', [], votingProvider))
            .rejects.toThrow('Already voted');
    });
});

// ============================================================================
// Exports
// ============================================================================

export {
    DynamicWitnessProvider,
    MerkleWitnessProvider,
    VotingWitnessProvider,
    SpyWitnessProvider,
    createStaticWitnesses,
    createConditionalWitnesses,
    createFailingWitness,
    createFlakeyWitness,
    combineWitnesses,
    UserAccount,
    VoteData,
    BalanceProof
};
