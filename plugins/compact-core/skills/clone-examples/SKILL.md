# Clone Examples

> Catalog of cloneable Compact contract examples and starter projects

## Metadata

- **Name**: clone-examples
- **Version**: 1.0.0
- **Category**: Reference
- **Tags**: examples, templates, starters, clone, scaffold

## Triggers

Activate when users mention:
- "clone example", "starter template", "example project"
- "get started with", "scaffold", "bootstrap"
- "OpenZeppelin contracts", "midnight examples"
- Specific project types: "token", "NFT", "counter", "DEX", "kitties"

## Usage

### Listing Examples

Read `references/catalog.yaml` to browse available examples.
Filter by tags, source, or compatibility requirements.

### Cloning Examples

Always use shallow clone to minimize download size:

```bash
git clone --depth 1 <clone_url> <destination>
```

**Before cloning**: If the user hasn't specified a destination directory, ask where they'd like to clone the repository.

For examples where `path` is not `/`, guide the user to the specific file or directory after cloning.

### Compatibility Check

Before recommending an example, use `/midnight-tooling:midnight-compatibility` to verify the user's environment matches the example's `compatibility` requirements. Warn if versions differ or are incompatible.

## References

- [catalog.yaml](references/catalog.yaml) - Full example catalog
