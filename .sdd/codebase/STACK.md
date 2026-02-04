# Technology Stack

**Project Type**: Claude Code Plugin (Documentation)
**Generated**: 2026-02-04 for feature 001-compact-core

## Languages

### Primary

- **Markdown** - All skills, commands, and documentation content
- **Compact** - Code examples for Midnight smart contracts (version 0.18.0)
- **TypeScript** - Example code for DApp integration

### Supporting

- **Python** - Validation scripts and tooling helpers
- **Bash** - Build and validation scripts

## Framework / Platform

- **Claude Code Plugin System** - Target platform for skills, commands, agents
- **Midnight Network** - Subject matter (Compact smart contracts, ZK proofs)

## Key Dependencies

### Runtime

- None (documentation-only plugin)

### Development/Testing

- `compactc` (v0.26.0) - Compact compiler for validating examples
- `tsc` - TypeScript compiler for validating TS examples
- `lefthook` - Git hooks for validation
- `python3` - For running validation scripts

## Build & Validation

- **Validation**: `scripts/validate-examples.sh` - Compiles all .compact examples
- **Pre-commit**: lefthook validates changed plugins
- **Pre-push**: Full marketplace validation

## Structure Conventions

```
compact-core/
├── .claude-plugin/plugin.json  # Plugin manifest
├── skills/                      # 8 skill directories
├── commands/                    # Slash commands
├── agents/                      # Specialized agents
├── scripts/                     # Validation scripts
└── README.md
```

## Notes

- This is a documentation plugin, not an application
- Code examples must compile but aren't executed as part of the plugin
- TypeScript examples should type-check with strict mode
- Compact examples target compiler version 0.26.0
