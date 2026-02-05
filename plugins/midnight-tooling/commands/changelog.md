---
name: changelog
description: Show changes between Midnight component versions
allowed-tools: Bash, Read
argument-hint: <component> [version]
---

Display changelog information for Midnight components from cached release notes.

## Arguments

- `$1` (required): Component name (compact, compact-tools, proof-server, ledger, etc.)
- `$2` (optional): Version filter (e.g., "0.26" to show only that version)

## Step 1: Check Cache

Verify release notes cache:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/check-cache-freshness.py
```

If missing, instruct user to run `/midnight:sync-releases` first and stop.
If stale, warn but continue.

## Step 2: List Components (if no argument)

If no component specified, list available components:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/parse-changelog.py --list
```

Present available components and usage example:
- "Available components: compact, compact-tools, proof-server, ledger, ..."
- "Usage: `/midnight:changelog compact` or `/midnight:changelog compact 0.26`"

## Step 3: Get Changelog

Parse changelog for the specified component:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/parse-changelog.py $1 $2
```

## Step 4: Present Changelog

Format the changelog information clearly:

### Component: [name]

#### Version X.Y.Z
**Title:** [release title]

**Summary:** [brief summary]

**Breaking Changes:**
- [list of breaking changes, if any]

**New Features:**
- [list of new features]

**Bug Fixes:**
- [list of bug fixes]

---

#### Version X.Y.Z-1
[previous version info]

---

## Step 5: Highlight Important Information

For the most recent version, emphasize:
- Any breaking changes that require code updates
- Pragma version changes
- Runtime function renames
- New reserved keywords

## Notes

If the component has many versions, show the most recent 3-5 by default.
If a specific version was requested, show details for that version only.

Suggest reviewing the full release notes on docs.midnight.network for complete details.
