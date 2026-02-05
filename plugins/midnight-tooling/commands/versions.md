---
name: versions
description: Compare installed Midnight versions vs current recommended versions
allowed-tools: Bash, Read
argument-hint: [component]
---

Compare locally installed Midnight tool versions against the current recommended versions from the support matrix.

## Step 1: Check Cache

First, verify the release notes cache is fresh:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/check-cache-freshness.py
```

If stale (>48 hours) or missing, warn the user:
- "⚠️ Release notes cache is [X hours old / missing]. Version information may be outdated."
- "Run `/midnight:sync-releases` to update."

Continue with available data if cache exists (even if stale).

## Step 2: Get Current Versions from Support Matrix

Parse the cached support matrix:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/parse-support-matrix.py $1
```

If a component argument was provided ($1), filter to just that component.

## Step 3: Get Installed Versions

Gather installed versions:
```bash
# Compact CLI
compact --version 2>/dev/null || echo "not installed"

# Compact compiler
compact compile --version 2>/dev/null || echo "not installed"

# npm packages (if in a project directory)
npm list @midnight-ntwrk/compact-runtime 2>/dev/null | grep compact-runtime || echo "not installed"
npm list @midnight-ntwrk/ledger 2>/dev/null | grep ledger || echo "not installed"
npm list @midnight-ntwrk/midnight.js 2>/dev/null | grep midnight.js || echo "not installed"

# Proof server docker image
docker images midnightnetwork/proof-server --format "{{.Tag}}" 2>/dev/null | head -1 || echo "not pulled"
```

## Step 4: Present Comparison Table

Display a comparison table:

| Component | Installed | Current | Status |
|-----------|-----------|---------|--------|
| Compact Compiler | 0.25.0 | 0.26.0 | ⚠️ Outdated |
| compact-runtime | 0.9.0 | 0.9.0 | ✅ Current |
| ledger | - | 4.0.0 | ❌ Not installed |
| Proof Server | latest | 4.0.0 | ℹ️ Check tag |

Status indicators:
- ✅ Current - versions match
- ⚠️ Outdated - installed version is older
- ❌ Not installed - component missing
- ℹ️ - needs verification

## Step 5: Recommendations

Based on the comparison:
- If components are outdated, suggest update commands
- If versions don't align, warn about potential compatibility issues
- Reference the `midnight-compatibility` skill for version alignment guidance

Example recommendations:
- "Compact compiler is outdated. Update with: `compact update`"
- "Runtime version 0.8.0 may not be compatible with compiler 0.26.0. Check compatibility matrix."
