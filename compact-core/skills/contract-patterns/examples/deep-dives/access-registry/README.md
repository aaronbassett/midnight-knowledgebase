# Role-Based Access Registry

A comprehensive access control system for Midnight featuring hierarchical roles, Merkle proof verification, and privacy-preserving permission checks.

## Overview

This registry provides:
- **Hierarchical roles** - Roles with levels and inherited permissions
- **Merkle membership** - Gas-efficient verification using Merkle proofs
- **Dynamic permissions** - Update permissions without redeploying
- **Delegation system** - Temporary permission grants with expiry
- **Audit logging** - Track all access control changes

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     Access Registry System                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────────────────────────┐   │
│  │  Super Admin    │────▶│                                     │   │
│  └─────────────────┘     │                                     │   │
│                          │        registry.compact             │   │
│  ┌─────────────────┐     │                                     │   │
│  │     Roles       │────▶│  • Role Management                  │   │
│  │                 │     │  • Membership Verification          │   │
│  │  ┌──────────┐   │     │  • Permission Checks                │   │
│  │  │  Admin   │   │     │  • Delegation Handling              │   │
│  │  └────┬─────┘   │     │  • Audit Logging                    │   │
│  │       │         │     │                                     │   │
│  │  ┌────▼─────┐   │     └─────────────────────────────────────┘   │
│  │  │ Operator │   │                                                │
│  │  └────┬─────┘   │                                                │
│  │       │         │                                                │
│  │  ┌────▼─────┐   │     ┌─────────────────────────────────────┐   │
│  │  │   User   │   │     │         Merkle Tree                 │   │
│  │  └──────────┘   │     │                                     │   │
│  └─────────────────┘     │           [Root]                    │   │
│                          │          /      \                   │   │
│                          │       [H01]    [H23]                │   │
│                          │       /   \    /   \                │   │
│                          │     [A]  [B] [C]  [D]               │   │
│                          │                                     │   │
│                          │     Members: A, B, C, D             │   │
│                          └─────────────────────────────────────┘   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `registry.compact` | Complete access control contract |

## Permission Model

### Permission Bits

| Permission | Bit | Value | Description |
|------------|-----|-------|-------------|
| Read | 0 | 1 | View data |
| Write | 1 | 2 | Modify data |
| Delete | 2 | 4 | Remove data |
| Grant | 3 | 8 | Delegate permissions |
| Revoke | 4 | 16 | Remove delegations |
| Admin | 5 | 32 | Manage roles |

### Example Permission Sets

```
Admin:    0b111111 = 63 (all permissions)
Operator: 0b000111 = 7  (read, write, delete)
User:     0b000001 = 1  (read only)
Moderator:0b000011 = 3  (read, write)
```

## Role Hierarchy

```
Level 255: Super Admin
    │
    ▼
Level 200: Admin
    │
    ▼
Level 100: Operator/Moderator
    │
    ▼
Level 50: Power User
    │
    ▼
Level 10: Standard User
    │
    ▼
Level 1: Guest
```

## Merkle Membership

### Why Merkle Trees?

1. **Gas Efficiency**: Only store root hash on-chain (32 bytes vs N * 32 bytes)
2. **Scalability**: Support millions of members without increased storage
3. **Privacy**: Member list not stored on-chain
4. **Verifiability**: Proofs can be verified by anyone

### How It Works

**Off-chain**: Build and maintain Merkle tree of members

```typescript
// Build tree from member commitments
const members = [
  hash(member1Secret),
  hash(member2Secret),
  hash(member3Secret),
  hash(member4Secret)
];

const tree = buildMerkleTree(members);
const root = tree.root;

// Update on-chain root
await registry.updateRoleMembership(adminSecret, roleId, root, members.length);
```

**On-chain**: Verify membership with proof

```typescript
// Generate proof for member
const proof = tree.getProof(memberIndex);

// Verify on-chain
const isMember = await registry.verifyMembership(
  memberCommitment,
  roleId,
  proof.path,
  proof.positions
);
```

### Proof Generation (Off-chain)

```typescript
function generateMerkleProof(tree: MerkleTree, index: number): MerkleProof {
  const proof: Bytes32[] = [];
  const positions: boolean[] = [];

  let currentIndex = index;

  for (let level = 0; level < tree.levels.length - 1; level++) {
    const currentLevel = tree.levels[level];
    const isLeft = currentIndex % 2 === 0;
    const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

    if (siblingIndex < currentLevel.length) {
      proof.push(currentLevel[siblingIndex]);
      positions.push(isLeft);
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  return { path: proof, positions };
}
```

## API Reference

### Initialization

| Function | Description |
|----------|-------------|
| `initialize()` | Set up registry with super admin |

### Role Management

| Function | Description |
|----------|-------------|
| `createRole()` | Create new role |
| `updateRoleMembership()` | Update role's Merkle root |
| `updateRolePermissions()` | Change role permissions |
| `deactivateRole()` | Disable a role |
| `reactivateRole()` | Re-enable a role |

### Membership & Permissions

| Function | Description |
|----------|-------------|
| `verifyMembership()` | Check if member belongs to role |
| `hasPermission()` | Check if member has specific permission |

### Delegation

| Function | Description |
|----------|-------------|
| `delegate()` | Grant temporary permissions |
| `hasDelegatedPermission()` | Check delegated permission |
| `revokeDelegation()` | Remove delegation |
| `isDelegationValid()` | Check delegation status |

### Administration

| Function | Description |
|----------|-------------|
| `transferSuperAdmin()` | Change super admin |
| `getRole()` | Get role information |
| `getDelegation()` | Get delegation details |
| `getRecentAudit()` | Get audit log entries |

## Integration Example

```typescript
import { ContractRuntime } from '@midnight/runtime';
import { registry } from './contracts';
import { MerkleTree } from './merkle';

class AccessManager {
  private runtime: ContractRuntime;
  private trees: Map<string, MerkleTree> = new Map();

  // Initialize registry
  async initialize(adminSecret: Bytes32) {
    await this.runtime.call(registry.initialize, {
      adminCommitment: hash(adminSecret),
      maxDelegation: 10000n
    });
  }

  // Create a new role with members
  async createRole(
    adminSecret: Bytes32,
    roleName: string,
    level: number,
    permissions: number,
    members: Bytes32[]
  ) {
    const roleId = hash(roleName);

    // Create role on-chain
    await this.runtime.call(registry.createRole, {
      adminSecret,
      roleId,
      name: hash(roleName),
      level,
      permissions
    });

    // Build Merkle tree for members
    const tree = new MerkleTree(members);
    this.trees.set(roleName, tree);

    // Update membership
    await this.runtime.call(registry.updateRoleMembership, {
      adminSecret,
      roleId,
      newRoot: tree.root,
      newCount: BigInt(members.length)
    });

    return roleId;
  }

  // Add member to role
  async addMember(
    adminSecret: Bytes32,
    roleName: string,
    memberCommitment: Bytes32
  ) {
    const tree = this.trees.get(roleName)!;
    tree.addLeaf(memberCommitment);

    await this.runtime.call(registry.updateRoleMembership, {
      adminSecret,
      roleId: hash(roleName),
      newRoot: tree.root,
      newCount: BigInt(tree.leafCount)
    });
  }

  // Check permission
  async checkPermission(
    memberSecret: Bytes32,
    roleName: string,
    permission: Permission
  ): Promise<boolean> {
    const tree = this.trees.get(roleName)!;
    const memberCommitment = hash(memberSecret);
    const memberIndex = tree.findLeaf(memberCommitment);

    if (memberIndex === -1) return false;

    const proof = tree.getProof(memberIndex);

    return await this.runtime.call(registry.hasPermission, {
      memberSecret,
      roleId: hash(roleName),
      proof: proof.path,
      proofPositions: proof.positions,
      permission
    });
  }

  // Delegate permissions
  async delegate(
    delegatorSecret: Bytes32,
    roleName: string,
    delegateeCommitment: Bytes32,
    permissions: number,
    duration: bigint
  ): Promise<Bytes32> {
    const tree = this.trees.get(roleName)!;
    const delegatorCommitment = hash(delegatorSecret);
    const delegatorIndex = tree.findLeaf(delegatorCommitment);
    const proof = tree.getProof(delegatorIndex);

    return await this.runtime.call(registry.delegate, {
      delegatorSecret,
      delegatorProof: proof.path,
      delegatorProofPositions: proof.positions,
      roleId: hash(roleName),
      delegateeCommitment,
      permissions,
      duration
    });
  }
}
```

## Use Cases

### DAO Governance

```typescript
// Create governance roles
await manager.createRole(adminSecret, "Council", 200, ADMIN_PERMS, councilMembers);
await manager.createRole(adminSecret, "Proposer", 100, WRITE_PERMS, proposerMembers);
await manager.createRole(adminSecret, "Voter", 50, READ_PERMS, voterMembers);

// Check if user can propose
if (await manager.checkPermission(userSecret, "Proposer", Permission.Write)) {
  await governance.createProposal(proposalData);
}
```

### Enterprise Access

```typescript
// Department-based access
await manager.createRole(adminSecret, "Engineering", 150, READ_WRITE, engineers);
await manager.createRole(adminSecret, "Finance", 150, READ_WRITE, financeTeam);
await manager.createRole(adminSecret, "HR", 100, READ, hrTeam);

// Temporary contractor access
const delegationId = await manager.delegate(
  engineeringLeadSecret,
  "Engineering",
  contractorCommitment,
  PERM_READ,
  30 * 24 * 60 // 30 days in blocks
);
```

### Tiered Services

```typescript
// Service tiers
await manager.createRole(adminSecret, "Premium", 100, ALL_FEATURES, premiumUsers);
await manager.createRole(adminSecret, "Standard", 50, BASIC_FEATURES, standardUsers);
await manager.createRole(adminSecret, "Free", 10, LIMITED_FEATURES, freeUsers);

// Feature gating
const hasFeature = await manager.checkPermission(
  userSecret,
  "Premium",
  Permission.Write // Write = premium feature access
);
```

## Security Considerations

### Attack Vectors

| Attack | Mitigation |
|--------|------------|
| Proof forgery | Cryptographic hash verification |
| Replay attacks | Role version tracking |
| Permission escalation | Bitmask enforcement |
| Stale delegations | Expiry checking |

### Best Practices

1. **Version your roots** - Increment version on every membership change
2. **Set delegation limits** - Prevent indefinite delegations
3. **Audit regularly** - Review audit log for anomalies
4. **Minimize admin exposure** - Use multi-sig for super admin
5. **Test proof generation** - Verify off-chain/on-chain consistency

## Testing

```typescript
describe('Access Registry', () => {
  describe('Roles', () => {
    it('should create role with correct permissions', async () => {
      await registry.createRole(adminSecret, roleId, name, 100, 7);
      const role = await registry.getRole(roleId);
      expect(role.permissions).toBe(7);
    });
  });

  describe('Membership', () => {
    it('should verify valid membership proof', async () => {
      const proof = tree.getProof(memberIndex);
      const isMember = await registry.verifyMembership(
        memberCommitment, roleId, proof.path, proof.positions
      );
      expect(isMember).toBe(true);
    });

    it('should reject invalid proof', async () => {
      const fakeProof = [randomBytes32()];
      const isMember = await registry.verifyMembership(
        memberCommitment, roleId, fakeProof, [false]
      );
      expect(isMember).toBe(false);
    });
  });

  describe('Delegation', () => {
    it('should grant temporary permissions', async () => {
      const delegationId = await registry.delegate(...args);
      const hasPermission = await registry.hasDelegatedPermission(
        delegateeSecret, delegationId, Permission.Read
      );
      expect(hasPermission).toBe(true);
    });

    it('should expire delegations', async () => {
      await advanceBlocks(delegationDuration + 1);
      const isValid = await registry.isDelegationValid(delegationId);
      expect(isValid).toBe(false);
    });
  });
});
```

## Extensions

### Multi-Root Roles

Support multiple Merkle roots for large roles:

```compact
struct Role {
  memberRoots: Vector<Bytes<32>>,  // Multiple roots
  // ...
}

circuit verifyMembership(...) {
  for root in role.memberRoots {
    if verifyAgainstRoot(member, root, proof) {
      return true;
    }
  }
  return false;
}
```

### Anonymous Verification

Prove role membership without revealing identity:

```compact
export circuit proveRoleAnonymously(
  witness memberSecret: Bytes<32>,
  witness proof: Vector<Bytes<32>>,
  roleId: Bytes<32>
): Bytes<32> {
  // Verify membership
  assert verifyMembership(hash(memberSecret), roleId, proof, positions);

  // Return nullifier (prevents double-proof without revealing identity)
  return hash(memberSecret, roleId, "anonymous-proof");
}
```

## Related Patterns

- [Whitelist](../../simple/whitelist.compact) - Simpler membership
- [Multi-Sig](../../simple/multi-sig.compact) - Admin operations
- [Ownership](../../simple/ownership.compact) - Single admin
- [Time Lock](../../simple/time-lock.compact) - Delayed permission changes
