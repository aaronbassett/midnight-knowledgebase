---
name: compact-review
description: Perform comprehensive code review of Compact smart contracts with severity-graded findings and actionable recommendations
arguments:
  - name: target
    description: File or directory to review (defaults to current file if omitted)
    required: false
  - name: scope
    description: Review scope - "all" for full review, "security" for security-focused review
    required: false
    default: all
  - name: format
    description: Output format - "full" for complete report, "summary" for condensed overview
    required: false
    default: full
---

# /compact-review Command

Performs comprehensive code review of Compact smart contracts across 8 dimensions.

## Usage

```bash
# Review current file
/compact-review

# Review specific file
/compact-review src/contract.compact

# Review directory
/compact-review contracts/

# Security-focused review
/compact-review contract.compact --scope=security

# Summary format
/compact-review contract.compact --format=summary
```

## Workflow

When invoked, this command:

1. **Validates target exists** and is a `.compact` file or directory containing `.compact` files

2. **Runs validation scripts** (in parallel when possible):
   - `lint-compact.sh` - Basic style checks
   - `check-disclosure.py` - Privacy violation detection
   - `verify-compilation.sh` - Compilation verification (if compactc available)
   - `analyze-complexity.py` - Circuit complexity estimation

3. **Invokes compact-reviewer agent** with collected context

4. **Produces structured report** to stdout

## Scope Options

| Scope | Dimensions Included |
|-------|---------------------|
| `all` (default) | All 8 dimensions |
| `security` | Security + Critical Issues only |

**Note**: When using `--scope=security`, a warning indicates skipped dimensions.

## Format Options

| Format | Description |
|--------|-------------|
| `full` (default) | Complete report with all findings and code examples |
| `summary` | Condensed overview with severity counts and key findings |

## Output

Reports are written to stdout. To save:

```bash
/compact-review contract.compact > review-report.md
```

## Error Handling

- **File not found**: Reports error and exits
- **Compiler not found**: Skips compilation check, continues with other analyses
- **Parse error**: Reports error, continues with available analysis
- **No .compact files**: Reports warning and exits

## Examples

### Full Review of Counter Contract

```bash
/compact-review examples/counter.compact
```

**Output** (abbreviated):

```markdown
# Code Review Report: examples/counter.compact

**Reviewed**: 2026-02-05T10:30:00Z
**Scope**: all

## Executive Summary
Contract implements a basic counter pattern...

## 🔴 Critical Issues [1]
### Missing Access Control...

## ✨ Positive Highlights [2]
### Clean ledger organization...
```

### Security-Only Review

```bash
/compact-review contracts/ --scope=security
```

**Output**: Only security vulnerabilities and critical bugs, with explicit note that other dimensions were skipped.

## Related

- [compact-reviewer agent](../agents/compact-reviewer.md) - Orchestrates the review
- [security-review skill](../skills/security-review/SKILL.md) - Security analysis
- [Quick Start Guide](../../specs/002-compact-reviewer/quickstart.md) - Full usage guide
