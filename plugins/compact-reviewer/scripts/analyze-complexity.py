#!/usr/bin/env python3
"""
analyze-complexity.py - Estimate circuit complexity for Compact contracts

Provides constraint count estimation using heuristics from research.md:
- Hash operations: ~1,000-25,000 constraints
- Comparisons: ~254 constraints for inequality
- Merkle proofs: ~1,000 × depth
- Loops: multiply inner constraints by iteration count

Usage: python3 analyze-complexity.py <file.compact>

Exit codes:
    0 - Analysis complete
    1 - Parse error
    2 - File not found
"""

import sys
import re
from dataclasses import dataclass, field
from typing import List, Dict, Tuple

# Color codes
GREEN = '\033[0;32m'
YELLOW = '\033[0;33m'
CYAN = '\033[0;36m'
NC = '\033[0m'  # No Color


@dataclass
class CircuitAnalysis:
    name: str
    line: int
    operations: Dict[str, int] = field(default_factory=dict)
    estimated_constraints: int = 0
    breakdown: List[str] = field(default_factory=list)
    optimizations: List[str] = field(default_factory=list)


# Constraint cost table from research.md
CONSTRAINT_COSTS = {
    # Cryptographic operations
    'sha256': 25000,
    'persistentHash': 1000,
    'persistentCommit': 1000,
    'hash': 1000,
    'ecMul': 7500,  # Average of 5000-10000

    # Comparisons (bit decomposition)
    'comparison_inequality': 254,  # <, >, <=, >=
    'comparison_equality': 1,      # ==

    # Merkle operations
    'merkle_hash_per_level': 1000,

    # Collections
    'map_membership': 254,
    'set_membership': 254,
    'list_access': 254,

    # Arithmetic (mostly free)
    'addition': 0,
    'subtraction': 0,
    'multiplication': 1,
    'division': 1,
}


def parse_compact_file(filepath: str) -> str:
    """Read a Compact file."""
    try:
        with open(filepath, 'r') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}")
        sys.exit(2)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


def find_circuits(content: str) -> List[Tuple[str, int, str]]:
    """Find all circuit definitions and their bodies."""
    circuits = []
    lines = content.split('\n')

    # Pattern: export? circuit name(...): ReturnType { ... }
    circuit_pattern = re.compile(
        r'(?:export\s+)?circuit\s+(\w+)\s*\([^)]*\)\s*:\s*[^\{]+\{'
    )

    i = 0
    while i < len(lines):
        line = lines[i]
        match = circuit_pattern.search(line)
        if match:
            circuit_name = match.group(1)
            start_line = i + 1

            # Find the matching closing brace
            brace_count = line.count('{') - line.count('}')
            body_lines = [line[match.end()-1:]]  # Start from opening brace

            j = i + 1
            while j < len(lines) and brace_count > 0:
                body_lines.append(lines[j])
                brace_count += lines[j].count('{') - lines[j].count('}')
                j += 1

            circuits.append((circuit_name, start_line, '\n'.join(body_lines)))
            i = j
        else:
            i += 1

    return circuits


def count_operations(body: str) -> Dict[str, int]:
    """Count constraint-generating operations in circuit body."""
    ops = {
        'hash_operations': 0,
        'sha256_operations': 0,
        'merkle_proofs': 0,
        'merkle_depth': 0,
        'inequality_comparisons': 0,
        'equality_comparisons': 0,
        'loop_iterations': 0,
        'ec_operations': 0,
        'collection_accesses': 0,
    }

    # Hash operations
    ops['hash_operations'] += len(re.findall(r'\bpersistentHash\s*\(', body))
    ops['hash_operations'] += len(re.findall(r'\bpersistentCommit\s*\(', body))
    ops['hash_operations'] += len(re.findall(r'\bhash\s*\(', body))

    # SHA256 specifically
    ops['sha256_operations'] += len(re.findall(r'\bsha256\s*\(', body))

    # EC operations
    ops['ec_operations'] += len(re.findall(r'\becMul\s*\(', body))

    # Merkle operations
    merkle_matches = re.findall(r'MerkleTree(?:Client)?<(\d+)>', body)
    if merkle_matches:
        ops['merkle_proofs'] += len(merkle_matches)
        ops['merkle_depth'] = max(int(d) for d in merkle_matches)

    # Comparisons
    ops['inequality_comparisons'] += len(re.findall(r'[<>]=?', body))
    ops['equality_comparisons'] += len(re.findall(r'==', body))

    # Loops - try to extract iteration count
    loop_matches = re.findall(r'for\s+\w+\s+in\s+(\d+)\.\.(\d+)', body)
    for start, end in loop_matches:
        ops['loop_iterations'] += int(end) - int(start)

    # Collection accesses
    ops['collection_accesses'] += len(re.findall(r'\[\w+\]', body))

    return ops


def estimate_constraints(ops: Dict[str, int]) -> Tuple[int, List[str]]:
    """Estimate total constraints and provide breakdown."""
    breakdown = []
    total = 0

    # Hash operations (Pedersen-style)
    if ops['hash_operations'] > 0:
        cost = ops['hash_operations'] * CONSTRAINT_COSTS['persistentHash']
        breakdown.append(f"Hash operations: {ops['hash_operations']} × ~1,000 = ~{cost:,}")
        total += cost

    # SHA256 operations
    if ops['sha256_operations'] > 0:
        cost = ops['sha256_operations'] * CONSTRAINT_COSTS['sha256']
        breakdown.append(f"SHA256 operations: {ops['sha256_operations']} × ~25,000 = ~{cost:,}")
        total += cost

    # EC operations
    if ops['ec_operations'] > 0:
        cost = ops['ec_operations'] * CONSTRAINT_COSTS['ecMul']
        breakdown.append(f"EC multiplications: {ops['ec_operations']} × ~7,500 = ~{cost:,}")
        total += cost

    # Merkle proofs
    if ops['merkle_proofs'] > 0:
        depth = ops['merkle_depth'] or 20  # Default assumption
        cost = ops['merkle_proofs'] * depth * CONSTRAINT_COSTS['merkle_hash_per_level']
        breakdown.append(f"Merkle proofs: depth {depth} × ~1,000 = ~{cost:,}")
        total += cost

    # Comparisons
    if ops['inequality_comparisons'] > 0:
        cost = ops['inequality_comparisons'] * CONSTRAINT_COSTS['comparison_inequality']
        breakdown.append(f"Comparisons (<, >): {ops['inequality_comparisons']} × ~254 = ~{cost:,}")
        total += cost

    # Collection accesses
    if ops['collection_accesses'] > 0:
        cost = ops['collection_accesses'] * CONSTRAINT_COSTS['map_membership']
        breakdown.append(f"Collection accesses: {ops['collection_accesses']} × ~254 = ~{cost:,}")
        total += cost

    # Loop multiplier (rough estimate - multiplies base by iterations)
    if ops['loop_iterations'] > 1:
        loop_multiplier = min(ops['loop_iterations'], 100)  # Cap estimate
        # Don't multiply total, just note the loops
        breakdown.append(f"Loop iterations: ~{ops['loop_iterations']} (constraints scale linearly)")

    return total, breakdown


def suggest_optimizations(ops: Dict[str, int], circuit_body: str) -> List[str]:
    """Suggest potential optimizations."""
    suggestions = []

    # SHA256 to Pedersen
    if ops['sha256_operations'] > 0:
        suggestions.append("Consider replacing SHA256 with Pedersen hash (~25x constraint reduction)")

    # Reduce comparisons
    if ops['inequality_comparisons'] > 5:
        suggestions.append("High comparison count - consider restructuring logic to minimize < and > operations")

    # Large loops
    if ops['loop_iterations'] > 50:
        suggestions.append("Large loop detected - consider moving computation to witness functions")

    # Deep Merkle trees
    if ops.get('merkle_depth', 0) > 20:
        suggestions.append(f"Deep Merkle tree (depth {ops['merkle_depth']}) - consider if smaller tree is sufficient")

    # Witness suggestions
    if 'get_' in circuit_body and ops['hash_operations'] > 2:
        suggestions.append("Multiple hash operations - verify some can be computed off-chain in witness")

    return suggestions


def classify_complexity(total_constraints: int) -> str:
    """Classify overall complexity level."""
    if total_constraints < 1000:
        return "Low"
    elif total_constraints < 10000:
        return "Medium"
    elif total_constraints < 50000:
        return "High"
    else:
        return "Very High"


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 analyze-complexity.py <file.compact>")
        sys.exit(1)

    filepath = sys.argv[1]

    if not filepath.endswith('.compact'):
        print(f"Error: Not a .compact file: {filepath}")
        sys.exit(1)

    content = parse_compact_file(filepath)
    circuits = find_circuits(content)

    if not circuits:
        print(f"Complexity Analysis: {filepath}")
        print()
        print("No circuits found in file.")
        sys.exit(0)

    print(f"{CYAN}Complexity Analysis:{NC} {filepath}")
    print()

    total_project_constraints = 0
    analyses = []

    for circuit_name, line_num, body in circuits:
        ops = count_operations(body)
        estimated, breakdown = estimate_constraints(ops)
        optimizations = suggest_optimizations(ops, body)

        analysis = CircuitAnalysis(
            name=circuit_name,
            line=line_num,
            operations=ops,
            estimated_constraints=estimated,
            breakdown=breakdown,
            optimizations=optimizations
        )
        analyses.append(analysis)
        total_project_constraints += estimated

    # Output each circuit analysis
    for analysis in analyses:
        print(f"{YELLOW}Circuit:{NC} {analysis.name} (line {analysis.line})")
        print(f"  Estimated constraints: ~{analysis.estimated_constraints:,}")

        if analysis.breakdown:
            print("  Breakdown:")
            for item in analysis.breakdown:
                print(f"    - {item}")

        if analysis.optimizations:
            print("  Optimization opportunities:")
            for opt in analysis.optimizations:
                print(f"    - {opt}")

        print()

    # Overall summary
    complexity = classify_complexity(total_project_constraints)
    print(f"{GREEN}Overall complexity:{NC} {complexity} (~{total_project_constraints:,} estimated constraints)")
    print()
    print("Note: Estimates are heuristic-based. Actual constraint count requires compilation.")

    sys.exit(0)


if __name__ == "__main__":
    main()
