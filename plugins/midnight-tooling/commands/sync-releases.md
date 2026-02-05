---
name: sync-releases
description: Fetch and cache Midnight release notes from GitHub
allowed-tools: Bash, Read
---

Download the latest Midnight release notes from GitHub to the local cache.

## Process

1. Inform the user what will happen:
   - Sparse clone of midnight-docs repository
   - Only the release notes directory is downloaded
   - Cached to `~/.cache/midnight-tooling/release-notes/`

2. Run the sync script:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/sync-release-notes.sh
```

3. Parse the output and report:
   - Number of files downloaded
   - Cache location
   - Timestamp of update
   - Git commit SHA

4. Confirm success with summary:
   - "Release notes cache updated successfully"
   - "X release note files cached"
   - "Cache valid for version checking for the next 48 hours"

## On Error

If the sync fails:
- Check if git is installed
- Check network connectivity
- Suggest manual troubleshooting steps

## Notes

The cache is used by:
- `/midnight:versions` - to show current recommended versions
- `/midnight:changelog` - to show what changed between versions
- `/midnight:doctor` - to compare installed vs current versions
- `midnight-debugging` skill - for version mismatch resolution

Cache location: `~/.cache/midnight-tooling/`
- `metadata.json` - tracks when cache was last updated
- `release-notes/` - the actual release note files
