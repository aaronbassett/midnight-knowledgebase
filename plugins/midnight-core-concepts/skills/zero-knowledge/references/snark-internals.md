# ZK SNARK Internals

## Mathematical Foundation

### Elliptic Curves

ZK SNARKs use elliptic curve cryptography for:
- Efficient group operations
- Bilinear pairings
- Compact representations

### Bilinear Pairings

A pairing is a function:
```
e: G1 × G2 → GT
```

Properties:
- Bilinearity: e(aP, bQ) = e(P, Q)^(ab)
- Non-degeneracy: e(P, Q) ≠ 1 for generators
- Computability: Efficiently computable

Pairings enable verification without revealing values.

## SNARK Components

### 1. Setup Phase

Generates proving and verification keys from circuit.

```
Setup(Circuit) → (ProvingKey, VerificationKey)
```

**Trusted setup**: Some SNARK variants require a trusted ceremony to generate parameters. Compromised setup could allow fake proofs.

### 2. Proving

Prover creates proof using:
- Witness (private inputs)
- Public inputs
- Proving key

```
Prove(ProvingKey, Witness, PublicInputs) → Proof
```

**Cost**: Proportional to circuit size. Can take seconds to minutes.

### 3. Verification

Verifier checks proof using:
- Proof
- Public inputs
- Verification key

```
Verify(VerificationKey, Proof, PublicInputs) → bool
```

**Cost**: Constant time (milliseconds), regardless of circuit complexity.

## Proof Size

SNARK proofs are succinct:
- ~200-300 bytes regardless of computation size
- Constant verification time
- Efficient on-chain verification

## Circuit Representation

### Arithmetic Circuits

Computation expressed as polynomial constraints:

```
For constraint: a × b = c
Variables: a, b, c
Constraint: a · b - c = 0
```

### R1CS (Rank-1 Constraint System)

Standard form for SNARK circuits:
```
(A · witness) ⊙ (B · witness) = (C · witness)
```

Where:
- A, B, C are constraint matrices
- witness is variable assignment
- ⊙ is element-wise product

### QAP (Quadratic Arithmetic Program)

R1CS converted to polynomial form for efficient proving.

## Security Properties

### Completeness

Valid proof for valid statement always verifies.

### Soundness

Cannot create valid proof for false statement (computationally).

### Zero-Knowledge

Proof reveals nothing beyond statement truth.

## Midnight's SNARK Usage

### Per-Circuit Keys

Each Compact circuit has its own:
- Proving key (distributed to users)
- Verification key (stored with contract)

### Proof Generation

Users generate proofs locally:
1. Compile Compact to circuit
2. Provide witness (private inputs)
3. Generate proof
4. Submit proof + public transcript

### On-Chain Verification

Nodes verify:
1. Proof is well-formed
2. Proof verifies against public inputs
3. Public inputs match transaction data
