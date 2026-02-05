# Bun Runtime Setup for Midnight

Alternative setup using the Bun JavaScript runtime instead of Node.js with npm.

## When to Use Bun

Bun is a fast JavaScript runtime that can replace Node.js for Midnight development. Consider Bun when:

- You want faster package installation and script execution
- You prefer a simpler toolchain
- Your project doesn't rely on Node.js-specific native modules

**Note**: The Midnight documentation primarily uses npm examples. Bun works but you may need to adapt some commands.

## Installation

### macOS

```bash
curl -fsSL https://bun.sh/install | bash

# Verify
bun --version
```

### Linux/WSL

```bash
# Install unzip first
sudo apt update && sudo apt install unzip -y

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Add to PATH if needed
export PATH="$HOME/.bun/bin:$PATH"

# Verify
bun --version
```

## Project Setup with Bun

### Initialize Project

```bash
# Create new project
mkdir my-midnight-app
cd my-midnight-app
bun init -y

# Create directory structure
mkdir -p src contracts
```

### Install Midnight Packages

```bash
# Install runtime (use exact version)
bun add @midnight-ntwrk/compact-runtime@0.9.0

# Install other Midnight packages as needed
bun add @midnight-ntwrk/ledger@4.0.0
bun add @midnight-ntwrk/midnight.js@2.1.0
```

### Configure TypeScript

Update `tsconfig.json` for Bun compatibility:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "contracts"]
}
```

### Package Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "build": "bun build src/index.ts --outdir dist",
    "compile:contract": "compact compile contracts/my-contract.compact contracts/managed",
    "build:all": "bun run compile:contract && bun run build"
  }
}
```

## Critical Compatibility Notes

### Version Matching

The Compact compiler and runtime versions must match exactly. Check the compatibility matrix:

```bash
# Check compiler version
compact compile --version

# The runtime version in package.json should match
# e.g., compiler 0.26.0 requires compact-runtime 0.9.0
```

### Pragma Declaration

Smart contracts must declare the exact language version:

```compact
pragma language_version 0.18;

// Contract code...
```

### Known Bun Limitations

1. **Native modules**: Some Node.js native modules may not work. Use `bun --bun run` for compatibility mode.

2. **Lockfile conflicts**: Don't mix npm and Bun lockfiles:
   ```bash
   # If migrating from npm
   rm -rf node_modules package-lock.json
   bun install
   ```

3. **Environment variables**: Bun automatically loads `.env` files. To disable:
   ```bash
   bun --env-file= run script.ts
   ```

## Migration from npm

```bash
# Remove npm artifacts
rm -rf node_modules package-lock.json

# Install with Bun
bun install

# Run scripts with bun
bun run dev
bun run build
```

## Running with Bun

```bash
# Development with hot reload
bun run --hot src/index.ts

# Run tests
bun test

# Build for production
bun build src/index.ts --outdir dist --minify
```

## Comparison: npm vs Bun

| Aspect | npm | Bun |
|--------|-----|-----|
| Package install | Slower | Much faster |
| Script execution | Node.js | Bun runtime |
| Docs/examples | Primary | May need adaptation |
| Native modules | Full support | Some limitations |
| Lockfile | package-lock.json | bun.lock |

## Troubleshooting Bun

### Bun not found after install

```bash
# Add to PATH in ~/.bashrc or ~/.zshrc
export PATH="$HOME/.bun/bin:$PATH"

# macOS alternative location
export PATH="$HOME/.local/bin:$PATH"

# Then source
source ~/.zshrc
```

### Native module errors

```bash
# Try compatibility mode
bun --bun run your-script.ts
```

### TypeScript issues

Ensure `tsconfig.json` uses `"moduleResolution": "bundler"` for Bun compatibility.
