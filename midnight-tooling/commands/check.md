---
name: check
description: Quick verification of Midnight development environment
allowed-tools: Bash, Read
model: haiku
---

Run a quick environment check for Midnight development tools.

Execute the check script:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/check-environment.sh
```

Parse the JSON output and present results as a formatted table:

| Tool | Installed | Version | Required |
|------|-----------|---------|----------|
| ... | ✓/✗ | x.y.z | Yes/No |

Also show:
- Docker daemon status
- Proof server status (running or not)
- Node.js version validation (18+ required)

If any required tools are missing or outdated, briefly explain how to install/update them.

If the check shows issues, suggest running `/midnight:doctor` for detailed diagnostics and fixes.
