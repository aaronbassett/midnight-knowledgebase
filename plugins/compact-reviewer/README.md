# Compact Code Reviewer Plugin

Comprehensive, deep-dive code reviews for Compact smart contracts on the Midnight Network.

## Overview

This plugin performs structured code reviews across 8 dimensions, producing severity-graded reports with line references and actionable recommendations.

**Requires**: [compact-core](../compact-core/) plugin for Compact language knowledge.

## Quick Start

```bash
# Review a contract
/compact-review src/contract.compact

# Security-focused review
/compact-review src/contract.compact --scope=security

# Review a directory
/compact-review contracts/
```

## Review Dimensions

| Dimension | Purpose | Priority |
|-----------|---------|----------|
| Security | Vulnerability detection, ZK-specific attacks | P1 |
| Critical Issues | Bug and logic error detection | P1 |
| Performance | Circuit efficiency analysis | P1 |
| Architecture | Contract structure and patterns | P1 |
| Best Practices | Idiomatic Compact usage | P2 |
| Code Quality | Readability and organization | P2 |
| Testing | Test coverage and quality | P2 |
| Maintainability | Long-term maintenance assessment | P2 |

## Severity Levels

| Icon | Level | Meaning | Action |
|------|-------|---------|--------|
| 🔴 | Critical | Security vulnerabilities, privacy breaches | Fix before deployment |
| 🟠 | High | Major bugs, significant issues | Fix this sprint |
| 🟡 | Medium | Code quality, inefficiencies | Schedule fix |
| 🟢 | Low | Style, documentation | Nice-to-have |
| 🟣 | Enhancement | Optimization opportunities | Future work |
| ✨ | Highlight | Good patterns to reinforce | Reference |

## Skills

| Skill | Description |
|-------|-------------|
| [security-review](skills/security-review/SKILL.md) | Security vulnerability detection including ZK-specific attack vectors |
| [critical-issues](skills/critical-issues/SKILL.md) | Bug and logic error detection |
| [performance-review](skills/performance-review/SKILL.md) | Circuit efficiency and constraint analysis |
| [design-architecture](skills/design-architecture/SKILL.md) | Contract structure and pattern evaluation |
| [best-practices](skills/best-practices/SKILL.md) | Idiomatic Compact usage guidance |
| [code-quality](skills/code-quality/SKILL.md) | Readability and organization feedback |
| [testing-review](skills/testing-review/SKILL.md) | Test coverage and quality assessment |
| [maintainability](skills/maintainability/SKILL.md) | Long-term maintainability evaluation |

## Validation Scripts

Standalone scripts for CI integration:

| Script | Purpose |
|--------|---------|
| `scripts/lint-compact.sh` | Basic style checks |
| `scripts/check-disclosure.py` | Disclosure rule validation |
| `scripts/verify-compilation.sh` | Compilation verification |
| `scripts/analyze-complexity.py` | Circuit complexity estimation |

## Report Output

Reports are output to stdout in structured markdown format. Redirect to save:

```bash
/compact-review contract.compact > review-report.md
```

## Documentation

- [Quick Start Guide](../specs/002-compact-reviewer/quickstart.md)
- [Feature Specification](../specs/002-compact-reviewer/spec.md)
- [Research Findings](../specs/002-compact-reviewer/research.md)

## Version Compatibility

- **Compact Language**: 0.18.0
- **Compact Compiler**: 0.26.0
- **compact-core plugin**: Required dependency
