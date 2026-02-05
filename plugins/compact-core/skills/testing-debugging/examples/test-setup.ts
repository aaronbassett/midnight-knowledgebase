/**
 * Test Setup for Midnight Compact Contracts
 *
 * This file demonstrates how to configure a TypeScript test harness
 * for testing Compact smart contracts on the Midnight Network.
 */

import { TestContext, ContractState, WitnessProvider } from '@midnight-ntwrk/compact-testing';
import { MerkleTree } from '@midnight-ntwrk/midnight-js-crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the test suite
 */
interface TestConfig {
    /** Path to the compiled Compact contract */
    contractPath: string;
    /** Initial ledger state (optional) */
    initialState?: Record<string, unknown>;
    /** Default timeout for operations in milliseconds */
    timeout?: number;
}

/**
 * User identity for multi-user testing
 */
interface TestUser {
    /** Unique identifier */
    id: string;
    /** Private key for signing */
    privateKey: Uint8Array;
    /** Public key / address */
    publicKey: Uint8Array;
}

/**
 * Result from a circuit call
 */
interface CircuitResult<T = unknown> {
    /** Whether the proof was generated successfully */
    success: boolean;
    /** Return value from the circuit */
    returnValue?: T;
    /** Ledger state changes */
    stateChanges?: Record<string, unknown>;
    /** Error message if failed */
    error?: string;
}

// ============================================================================
// Test Context Setup
// ============================================================================

/**
 * Creates a test context for the given contract.
 *
 * @example
 * ```typescript
 * const ctx = await createTestContext({
 *     contractPath: 'contracts/token.compact',
 *     initialState: {
 *         total_supply: BigInt(1000000)
 *     }
 * });
 * ```
 */
async function createTestContext(config: TestConfig): Promise<TestContext> {
    const ctx = await TestContext.create(config.contractPath, {
        timeout: config.timeout ?? 30000
    });

    if (config.initialState) {
        await ctx.ledger.initialize(config.initialState);
    }

    return ctx;
}

/**
 * Creates a test user with generated keys.
 */
async function createTestUser(id: string): Promise<TestUser> {
    const privateKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKey = derivePublicKey(privateKey);

    return {
        id,
        privateKey,
        publicKey
    };
}

/**
 * Derives public key from private key.
 * In production, use the actual Midnight crypto library.
 */
function derivePublicKey(privateKey: Uint8Array): Uint8Array {
    // Placeholder - actual implementation would use ed25519 or similar
    const publicKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        publicKey[i] = privateKey[i] ^ 0xff;
    }
    return publicKey;
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Converts a bigint to a 32-byte Uint8Array (big-endian).
 */
function bigintToBytes32(value: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    let remaining = value;
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(remaining & BigInt(0xff));
        remaining = remaining >> BigInt(8);
    }
    return bytes;
}

/**
 * Converts a Uint8Array to a bigint.
 */
function bytes32ToBigint(bytes: Uint8Array): bigint {
    let result = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
        result = (result << BigInt(8)) | BigInt(bytes[i]);
    }
    return result;
}

/**
 * Creates a hex string from bytes.
 */
function bytesToHex(bytes: Uint8Array): string {
    return '0x' + Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Parses a hex string to bytes.
 */
function hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

// ============================================================================
// Example Test Suite
// ============================================================================

describe('Token Contract', () => {
    let ctx: TestContext;
    let alice: TestUser;
    let bob: TestUser;

    // -------------------------------------------------------------------------
    // Setup and Teardown
    // -------------------------------------------------------------------------

    beforeAll(async () => {
        // Create test users once for all tests
        alice = await createTestUser('alice');
        bob = await createTestUser('bob');
    });

    beforeEach(async () => {
        // Create fresh context for each test
        ctx = await createTestContext({
            contractPath: 'contracts/token.compact',
            initialState: {
                total_supply: BigInt(0),
                balances: new Map()
            }
        });
    });

    afterEach(async () => {
        // Clean up after each test
        await ctx.dispose();
    });

    // -------------------------------------------------------------------------
    // Initialization Tests
    // -------------------------------------------------------------------------

    describe('initialization', () => {
        it('should start with zero total supply', async () => {
            const totalSupply = await ctx.ledger.get('total_supply');
            expect(totalSupply).toBe(BigInt(0));
        });

        it('should initialize with specified supply', async () => {
            const initialSupply = BigInt(1000000);

            await ctx.call('initialize', [
                alice.publicKey,
                initialSupply
            ]);

            const totalSupply = await ctx.ledger.get('total_supply');
            expect(totalSupply).toBe(initialSupply);

            const aliceBalance = await ctx.ledger.get(
                'balances',
                bytesToHex(alice.publicKey)
            );
            expect(aliceBalance).toBe(initialSupply);
        });
    });

    // -------------------------------------------------------------------------
    // Transfer Tests
    // -------------------------------------------------------------------------

    describe('transfer', () => {
        beforeEach(async () => {
            // Give Alice some tokens
            await ctx.call('initialize', [
                alice.publicKey,
                BigInt(1000)
            ]);
        });

        it('should transfer tokens between users', async () => {
            const amount = BigInt(100);

            const witnesses: WitnessProvider = {
                get_private_key: () => alice.privateKey,
                get_balance: () => BigInt(1000)
            };

            const result = await ctx.call(
                'transfer',
                [bob.publicKey, amount],
                witnesses
            );

            expect(result.success).toBe(true);

            // Verify balances updated
            const aliceBalance = await ctx.ledger.get(
                'balances',
                bytesToHex(alice.publicKey)
            );
            expect(aliceBalance).toBe(BigInt(900));

            const bobBalance = await ctx.ledger.get(
                'balances',
                bytesToHex(bob.publicKey)
            );
            expect(bobBalance).toBe(BigInt(100));
        });

        it('should fail transfer with insufficient balance', async () => {
            const witnesses: WitnessProvider = {
                get_private_key: () => alice.privateKey,
                get_balance: () => BigInt(50)  // Less than transfer amount
            };

            await expect(
                ctx.call('transfer', [bob.publicKey, BigInt(100)], witnesses)
            ).rejects.toThrow('Insufficient balance');
        });

        it('should preserve total supply after transfer', async () => {
            const totalBefore = await ctx.ledger.get('total_supply');

            const witnesses: WitnessProvider = {
                get_private_key: () => alice.privateKey,
                get_balance: () => BigInt(1000)
            };

            await ctx.call('transfer', [bob.publicKey, BigInt(100)], witnesses);

            const totalAfter = await ctx.ledger.get('total_supply');
            expect(totalAfter).toBe(totalBefore);
        });
    });

    // -------------------------------------------------------------------------
    // Error Condition Tests
    // -------------------------------------------------------------------------

    describe('error conditions', () => {
        it('should reject zero amount transfer', async () => {
            const witnesses: WitnessProvider = {
                get_private_key: () => alice.privateKey,
                get_balance: () => BigInt(1000)
            };

            await expect(
                ctx.call('transfer', [bob.publicKey, BigInt(0)], witnesses)
            ).rejects.toThrow('Amount must be positive');
        });

        it('should reject self-transfer', async () => {
            const witnesses: WitnessProvider = {
                get_private_key: () => alice.privateKey,
                get_balance: () => BigInt(1000)
            };

            await expect(
                ctx.call('transfer', [alice.publicKey, BigInt(100)], witnesses)
            ).rejects.toThrow('Cannot transfer to self');
        });
    });
});

// ============================================================================
// Merkle Tree Testing Example
// ============================================================================

describe('Membership Contract', () => {
    let ctx: TestContext;
    let tree: MerkleTree;

    beforeEach(async () => {
        ctx = await createTestContext({
            contractPath: 'contracts/membership.compact'
        });
        tree = new MerkleTree(20);  // 20 levels = 2^20 leaves
    });

    afterEach(async () => {
        await ctx.dispose();
    });

    it('should prove valid membership', async () => {
        // Add member to tree
        const memberData = new Uint8Array(32);
        memberData.fill(0x42);
        const leaf = computeLeafHash(memberData);

        tree.insert(leaf);
        const merkleRoot = tree.root();
        const merklePath = tree.getPath(leaf);

        // Set up contract with this root
        await ctx.call('set_root', [merkleRoot]);

        // Create witnesses
        const witnesses: WitnessProvider = {
            get_member_data: () => memberData,
            get_merkle_path: () => merklePath
        };

        // Verify membership
        const result = await ctx.call(
            'verify_membership',
            [],
            witnesses
        );

        expect(result.success).toBe(true);
        expect(result.returnValue).toBe(true);
    });

    it('should reject invalid membership proof', async () => {
        const nonMemberData = new Uint8Array(32);
        nonMemberData.fill(0x99);

        // Create fake path
        const fakePath = Array(20).fill(null).map(() =>
            crypto.getRandomValues(new Uint8Array(32))
        );

        const witnesses: WitnessProvider = {
            get_member_data: () => nonMemberData,
            get_merkle_path: () => fakePath
        };

        const result = await ctx.call(
            'verify_membership',
            [],
            witnesses
        );

        // Should succeed but return false
        expect(result.success).toBe(true);
        expect(result.returnValue).toBe(false);
    });
});

/**
 * Computes the leaf hash for the Merkle tree.
 */
function computeLeafHash(data: Uint8Array): Uint8Array {
    // Placeholder - use actual hash function
    const hash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        hash[i] = data[i % data.length] ^ (i * 17);
    }
    return hash;
}

// ============================================================================
// Exports for Other Test Files
// ============================================================================

export {
    createTestContext,
    createTestUser,
    bigintToBytes32,
    bytes32ToBigint,
    bytesToHex,
    hexToBytes,
    computeLeafHash,
    TestConfig,
    TestUser,
    CircuitResult
};
