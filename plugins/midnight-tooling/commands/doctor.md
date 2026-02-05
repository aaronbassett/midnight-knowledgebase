---
name: doctor
description: Comprehensive diagnostic and repair for Midnight environment
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
argument-hint: [--auto-fix]
---

Run comprehensive diagnostics on the Midnight development environment and offer to fix issues.

## Step 1: Check Cache Freshness

First, check if the release notes cache is fresh:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/check-cache-freshness.py
```

If cache is stale or missing, inform the user and offer to update:
- "Release notes cache is X hours old (or missing). Would you like to update it for accurate version checking?"
- If yes, run: `bash ${CLAUDE_PLUGIN_ROOT}/scripts/sync-release-notes.sh`

## Step 2: Run Diagnostics

Run the comprehensive doctor script:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.py
```

## Step 3: Present Results

Parse the JSON output and present findings organized by severity:

### Critical Issues (must fix)
- List any critical issues with their fix commands

### Errors (should fix)
- List errors with explanations and fixes

### Warnings (recommended to fix)
- List warnings

### OK (no action needed)
- Summarize what's working correctly

## Step 4: Offer Fixes

For each issue that has `fix_available: true`:

1. Present the issue and proposed fix clearly
2. If `$ARGUMENTS` contains `--auto-fix`, apply fixes automatically
3. Otherwise, use AskUserQuestion to confirm each fix before applying:
   - "Issue: [description]. Fix: [fix_description]. Apply this fix?"
   - Options: "Yes, fix it", "Skip this one", "Fix all remaining"

When applying fixes:
- Show the command being run
- Capture and display output
- Report success or failure

## Step 5: Verify Fixes

After applying fixes, re-run the check for affected components to verify they're resolved.

## Step 6: Summary

Provide a final summary:
- Number of issues found
- Number of issues fixed
- Any remaining issues that need manual intervention
- Next steps recommendation

If everything is healthy, congratulate the user and mention they can start developing.
