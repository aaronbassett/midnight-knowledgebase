#!/usr/bin/env python3
"""
check-disclosure.py - Detect witness taint and disclosure violations in Compact contracts

Detects potential privacy issues:
- Witness values flowing to public outputs without disclose()
- Low-entropy witnesses used in persistentHash() (nullifier linkability)
- Witness taint propagation to ledger operations

Usage: python3 check-disclosure.py <file.compact>

Exit codes:
    0 - No disclosure issues detected
    1 - Potential disclosure issues found
    2 - File parse error
"""

import sys
import re
from dataclasses import dataclass
from typing import List, Set, Tuple

# Color codes for terminal output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[0;33m'
NC = '\033[0m'  # No Color


@dataclass
class DisclosureIssue:
    line: int
    description: str
    severity: str  # "critical", "high", "medium"


def parse_compact_file(filepath: str) -> Tuple[str, List[str]]:
    """Read and parse a Compact file into lines."""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
            lines = content.split('\n')
        return content, lines
    except FileNotFoundError:
        print(f"{RED}[FAIL]{NC} Disclosure Check: {filepath}")
        print("Error: File not found")
        sys.exit(2)
    except Exception as e:
        print(f"{RED}[FAIL]{NC} Disclosure Check: {filepath}")
        print(f"Error: {e}")
        sys.exit(2)


def find_witness_declarations(content: str) -> List[Tuple[str, int, str]]:
    """Find all witness declarations and their types."""
    witnesses = []
    lines = content.split('\n')

    # Pattern: witness name(): Type;
    witness_pattern = re.compile(
        r'witness\s+(\w+)\s*\([^)]*\)\s*:\s*(\w+(?:<[^>]+>)?)\s*;'
    )

    for i, line in enumerate(lines, 1):
        match = witness_pattern.search(line)
        if match:
            name, type_str = match.groups()
            witnesses.append((name, i, type_str))

    return witnesses


def is_low_entropy_type(type_str: str) -> bool:
    """Check if a type has low entropy (< 2^20 possible values)."""
    low_entropy_patterns = [
        r'Uint<[1-9]>',       # Uint<1> through Uint<9>
        r'Uint<1[0-9]>',      # Uint<10> through Uint<19>
        r'Boolean',           # Only 2 values
        r'Enum<',             # Enums typically have few variants
    ]

    for pattern in low_entropy_patterns:
        if re.search(pattern, type_str):
            return True

    return False


def find_witness_usages(content: str, witness_name: str) -> List[Tuple[int, str]]:
    """Find all lines where a witness is used."""
    usages = []
    lines = content.split('\n')

    # Match witness call: witness_name()
    usage_pattern = re.compile(rf'\b{witness_name}\s*\(\s*\)')

    for i, line in enumerate(lines, 1):
        if usage_pattern.search(line):
            usages.append((i, line.strip()))

    return usages


def check_disclosure_violations(content: str, lines: List[str]) -> List[DisclosureIssue]:
    """Check for disclosure rule violations."""
    issues = []

    witnesses = find_witness_declarations(content)

    for witness_name, decl_line, type_str in witnesses:
        usages = find_witness_usages(content, witness_name)

        for line_num, line_content in usages:
            # Check for low-entropy witness in persistentHash
            if 'persistentHash' in line_content:
                if is_low_entropy_type(type_str):
                    issues.append(DisclosureIssue(
                        line=line_num,
                        description=f"Low-entropy witness '{witness_name}' ({type_str}) used in persistentHash() - vulnerable to brute-force (AV-03/AV-06)",
                        severity="critical"
                    ))

            # Check for witness value in return without disclose
            if 'return' in line_content and 'disclose' not in line_content:
                # Simple heuristic: witness appears in return statement
                if witness_name in line_content:
                    issues.append(DisclosureIssue(
                        line=line_num,
                        description=f"Witness '{witness_name}' may flow to public output without disclose()",
                        severity="high"
                    ))

            # Check for witness in ledger operations without proper handling
            ledger_ops = ['increment', 'decrement', 'write', 'push', 'set', 'insert']
            for op in ledger_ops:
                if f'.{op}(' in line_content:
                    # Check if witness value is used directly in ledger operation
                    if witness_name in line_content and 'disclose' not in line_content:
                        issues.append(DisclosureIssue(
                            line=line_num,
                            description=f"Witness '{witness_name}' used in ledger {op}() - verify disclosure intent",
                            severity="medium"
                        ))

    # Check for witness-dependent control flow (timing leak potential)
    for i, line in enumerate(lines, 1):
        if re.search(r'if\s+.*\bget_\w+\s*\(\)', line):
            issues.append(DisclosureIssue(
                line=i,
                description="Control flow depends on witness value - potential timing leak (AV-01)",
                severity="high"
            ))

    return issues


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 check-disclosure.py <file.compact>")
        sys.exit(2)

    filepath = sys.argv[1]

    if not filepath.endswith('.compact'):
        print(f"{RED}[FAIL]{NC} Disclosure Check: {filepath}")
        print("Error: Not a .compact file")
        sys.exit(2)

    content, lines = parse_compact_file(filepath)
    issues = check_disclosure_violations(content, lines)

    if not issues:
        print(f"{GREEN}[PASS]{NC} Disclosure Check: {filepath}")
        print()
        print("No disclosure issues detected.")
        sys.exit(0)
    else:
        print(f"{YELLOW}[FAIL]{NC} Disclosure Check: {filepath}")
        print()
        print("Potential violations:")

        # Sort by severity
        severity_order = {"critical": 0, "high": 1, "medium": 2}
        issues.sort(key=lambda x: severity_order.get(x.severity, 3))

        for issue in issues:
            severity_icon = {"critical": "🔴", "high": "🟠", "medium": "🟡"}.get(issue.severity, "⚪")
            print(f"  - Line {issue.line}: {severity_icon} {issue.description}")

        print()
        print(f"Summary: {len(issues)} potential disclosure issues")
        sys.exit(1)


if __name__ == "__main__":
    main()
