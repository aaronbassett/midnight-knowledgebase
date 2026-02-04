# Midnight Expert

Plugins and skills to turn AI coding assistants into Midnight Network experts

## Development

### Git Hooks Setup

This repository uses [lefthook](https://github.com/evilmartians/lefthook) for git hooks.

1. Check lefthook is installed: `lefthook --version`
2. Activate hooks: `lefthook install`
3. Hooks will now run automatically on commit and push

### Validation

**Automatic validation:**
- Pre-commit: Validates changed plugins
- Pre-push: Validates all plugins + marketplace

**Manual validation:**
- All plugins: `scripts/validate-marketplace.sh`
- Single plugin: `scripts/validate-plugin.sh <plugin-name>`
- CI validation: `scripts/ci/validate.sh`

Note: GitHub Actions will still validate all changes.
