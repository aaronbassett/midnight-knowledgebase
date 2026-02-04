<!--
Sync Impact Report
==================
Version change: N/A → 1.0.0
Modified principles: N/A (initial creation)
Added sections: Core Principles (6), Content Standards, Development Workflow, Governance
Removed sections: N/A
Templates requiring updates: N/A (initial creation)
Follow-up TODOs: None
-->

# Midnight Knowledgebase Constitution

## Core Principles

### I. Documentation Accuracy First

All documentation MUST accurately reflect the current Midnight/Compact platform behavior.

**Rules:**
- Every code example MUST be tested against the declared Compact compiler version
- Version compatibility MUST be explicitly stated (e.g., "Compact 0.18.0 / Compiler 0.26.0")
- Outdated documentation is worse than no documentation - mark stale content clearly
- When in doubt, link to authoritative Midnight docs rather than paraphrasing incorrectly

**Rationale:** Developers trust this knowledgebase to be correct. Wrong examples waste hours of debugging.

### II. Plugin Modularity

Each plugin serves a distinct, well-scoped purpose with clear boundaries.

**Rules:**
- `midnight-tooling`: Environment setup, debugging, CI/CD - NOT concepts or language
- `midnight-core-concepts`: Blockchain fundamentals, privacy model - NOT implementation details
- `compact-core`: Language reference, patterns, testing - NOT tooling or theory
- No circular dependencies between plugins
- Cross-references use explicit plugin references (`@midnight-core-concepts`, `@midnight-tooling`)

**Rationale:** Solo maintainer + long lifespan requires clear ownership boundaries. Developers should know exactly which plugin to consult.

### III. Semantic Versioning with Platform Tracking

Plugins use semver AND declare Midnight platform compatibility.

**Rules:**
- MAJOR: Breaking changes to skill/command interfaces or removing content
- MINOR: New skills, commands, or substantial content additions
- PATCH: Corrections, clarifications, typo fixes
- Each plugin declares compatible Midnight version range in `plugin.json`
- Update compatibility when platform changes break documented behavior

**Rationale:** Developers need to know if plugin content matches their Midnight version. Clear versioning enables this.

### IV. Simplicity Over Completeness

Ship focused, useful documentation rather than comprehensive but overwhelming content.

**Rules:**
- YAGNI: Don't document edge cases until someone hits them
- KISS: Prefer simple explanations with examples over exhaustive specifications
- One concept per skill section - don't mix concerns
- If a skill exceeds ~500 lines, split it
- Signpost to authoritative sources rather than duplicating everything

**Rationale:** Solo maintainer can't keep comprehensive docs current. Focused docs stay accurate.

### V. Automated Validation

All structural and format requirements MUST be enforced automatically.

**Rules:**
- Pre-commit hooks validate changed plugins
- Pre-push hooks validate all plugins + marketplace structure
- CI validates all changes before merge
- Plugin structure violations block commits
- Manual review for content quality, automated checks for format

**Rationale:** Automation catches mistakes the maintainer would miss. Consistent structure improves discoverability.

### VI. Examples First

Documentation leads with working examples, not abstract explanations.

**Rules:**
- Every skill MUST have at least one complete, runnable example
- Examples MUST be copy-paste ready (no pseudocode in code blocks)
- Show the most common use case first, variations after
- Include expected output or behavior where applicable
- Complex patterns get 1-3 deeply documented examples, not many shallow ones

**Rationale:** Developers learn by example. Working code builds trust.

## Content Standards

### Skill Structure

Every skill file follows this pattern:
1. **What** - One sentence describing purpose
2. **When** - Trigger conditions or use cases
3. **Example** - Complete working code
4. **Details** - Deeper explanation (optional)
5. **See Also** - Cross-references to related skills/docs

### Version Declarations

Every plugin that references Compact syntax MUST include:
```
Tested with: Compact 0.18.0 / Compiler 0.26.0
```

Update this when re-validating against new versions.

### Cross-Plugin References

Use explicit plugin references for discoverability:
- `See @midnight-core-concepts for UTXO model explanation`
- `Requires @midnight-tooling environment setup`

## Development Workflow

### Commit Standards

All commits MUST use Conventional Commits format:
```
type(scope): subject

types: feat|fix|docs|refactor|test|chore
scopes: tooling|concepts|compact|meta
```

Examples:
- `feat(compact): add private-voting pattern example`
- `fix(tooling): correct Node.js version requirement`
- `docs(concepts): clarify witness vs disclosure`

### Validation Gates

1. **Pre-commit**: `lefthook` validates changed plugins
2. **Pre-push**: Full marketplace validation
3. **CI**: All plugins + cross-references validated

### Content Updates

When Midnight platform releases a new version:
1. Review changelog for breaking changes
2. Test all code examples against new version
3. Update version declarations
4. Bump plugin patch/minor version as appropriate

## Governance

This constitution governs all contributions to the midnight-knowledgebase repository.

**Amendment Process:**
1. Propose change via PR with rationale
2. Document migration plan if principles change
3. Update dependent artifacts (spec, plan, task templates)
4. Bump constitution version

**Compliance:**
- All PRs reviewed against constitution principles
- Automated validation enforces structural rules
- Content quality verified through manual review

**Version**: 1.0.0 | **Ratified**: 2026-02-04 | **Last Amended**: 2026-02-04
