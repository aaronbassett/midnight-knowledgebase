# Midnight Tooling Plugin

A Claude Code plugin for developers building on the Midnight Network. Provides environment setup guidance, debugging expertise, version management, and CI/CD workflow templates.

## Features

### Skills

- **midnight-setup** - Step-by-step environment setup including Compact developer tools, Docker, proof server
- **midnight-debugging** - Expert knowledge for identifying and fixing common toolchain issues
- **midnight-compatibility** - Version compatibility matrix and pragma requirements
- **midnight-ci** - CI/CD setup guidance with GitHub workflow templates
- **contract-calling** - Calling deployed contracts from Node.js, querying state, executing transactions
- **contract-deployment** - Deploying Compact contracts to testnet/mainnet, configuring network endpoints
- **lifecycle-management** - Managing deployed contract lifecycles, state backup, migrations, versioning

### Commands

| Command | Description |
|---------|-------------|
| `/midnight:check` | Quick verification of installed tools |
| `/midnight:doctor` | Deep diagnostic with automatic fix suggestions |
| `/midnight:sync-releases` | Fetch/update release notes cache |
| `/midnight:versions` | Compare installed vs current versions |
| `/midnight:changelog` | Show changes between versions |

### Agent

- **environment-debugger** - Proactively triggers on Midnight-related errors to provide systematic debugging

## Installation

```bash
# Install via Claude Code
claude plugins install midnight-tooling

# Or use locally
claude --plugin-dir /path/to/midnight-tooling
```

## Prerequisites

The plugin helps you install these, but for reference:

- **Node.js** 18+ (via nvm recommended)
- **Docker Desktop** (for proof server)
- **Compact Developer Tools** (installed via plugin guidance)

## Release Notes Cache

The plugin caches Midnight release notes locally for offline version checking:

```
~/.cache/midnight-tooling/
├── metadata.json           # Cache freshness tracking
└── release-notes/          # Cached release notes
```

Run `/midnight:sync-releases` to update the cache. The plugin warns if cache is >48 hours old.

## Scope

This plugin covers:
- Local development environment setup
- Toolchain debugging and troubleshooting
- Version compatibility management
- CI/CD workflow configuration

This plugin does **not** cover:
- Running a Midnight node

## Documentation

- [Midnight Docs](https://docs.midnight.network)
- [Getting Started](https://docs.midnight.network/getting-started/installation)
- [Building Tutorial](https://docs.midnight.network/develop/tutorial/building)

## Testing the Plugin

To test the plugin locally:

```bash
# Start Claude Code with the plugin
claude --plugin-dir /path/to/midnight-tooling

# Test commands
/midnight:check              # Should show environment status
/midnight:sync-releases      # Should download release notes
/midnight:versions           # Should compare versions
/midnight:doctor             # Should run diagnostics

# Test skills (ask questions that trigger them)
"How do I set up Midnight development environment?"
"I'm getting compact: command not found"
"What versions are compatible with compiler 0.26.0?"
"How do I set up CI for my Midnight project?"

# Test agent (should trigger on error messages)
"I'm getting ERR_UNSUPPORTED_DIR_IMPORT when running my project"
```

## Plugin Structure

```
midnight-tooling/
├── .claude-plugin/plugin.json    # Plugin manifest
├── commands/                      # 5 slash commands
├── agents/                        # 1 debugging agent
├── skills/                        # 7 skills with references
│   ├── midnight-setup/
│   ├── midnight-debugging/
│   ├── midnight-compatibility/
│   ├── midnight-ci/
│   ├── contract-calling/
│   ├── contract-deployment/
│   └── lifecycle-management/
└── scripts/                       # Utility scripts
```

## Contributing

Contributions welcome! Please ensure:
- Skills use third-person descriptions with trigger phrases
- Commands include proper frontmatter
- Scripts are executable and well-documented
- Version information stays current with Midnight releases

## License

Apache-2.0
