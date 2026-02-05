# DApp SDD Plugin

Streamlined specification-driven development for Midnight Network example dApps.

## Overview

PR-centric workflow that takes a spec from README.md, asks clarifying questions via PR comments, then autonomously implements the dApp with mandatory phase reviews.

## Commands

| Command | Description |
|---------|-------------|
| `/dapp-sdd:start owner/repo@branch` | Clone repo, create PR, read spec, post clarifying questions |
| `/dapp-sdd:clarify --continue` | Fetch answers from PR, run full pipeline to completion |

## Workflow

1. User creates repo with README.md containing dApp spec
2. User runs `/dapp-sdd:start owner/repo@branch`
3. Agent creates draft PR, posts 5 clarifying questions
4. User answers questions in PR comment
5. User runs `/dapp-sdd:clarify --continue`
6. Agent implements dApp autonomously with phase reviews
7. Agent marks PR ready when complete

## Internal Skills

| Skill | Purpose |
|-------|---------|
| `constitution` | Hardcoded quality standards for example dApps |
| `specify` | Expand README into full specification |
| `plan` | Create phased implementation plan |
| `tasks` | Generate task list with review gates |
| `implement` | Execute tasks with commits and reviews |

## Dependencies

Requires these plugins:
- `compact-core` - Compact language reference
- `compact-reviewer` - Compact code review
- `midnight-dapp` - dApp patterns
- `midnight-proofs` - Proof generation
- `midnight-tooling` - Tooling setup
- `devs` - Code reviewer agent
- `git-lovely` - Commit message standards
- `readme-and-co` - Documentation standards
