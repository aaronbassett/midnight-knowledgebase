# Common Midnight Error Messages

A catalog of common error messages, their causes, and solutions.

## Installation & PATH Errors

### `compact: command not found`

**Full error**: `zsh: command not found: compact` or `bash: compact: command not found`

**Cause**: Compact developer tools not installed or not in PATH.

**Solutions**:
1. Install Compact developer tools:
   ```bash
   curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
   ```

2. Add to PATH in shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   export PATH="$HOME/.compact/bin:$PATH"
   ```

3. Open a **new** terminal window (don't just source the profile).

### `error: no such command: 'compile'`

**Cause**: Compact CLI installed but compiler not downloaded.

**Solution**:
```bash
compact update
```

## Node.js & Module Errors

### `ERR_UNSUPPORTED_DIR_IMPORT`

**Full error**: `Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import '...' is not supported`

**Cause**: Node.js trying to import a directory instead of a specific file. Often caused by stale terminal environment.

**Solutions**:
1. Open a **new terminal window** (critical!)
2. Clear module cache:
   ```bash
   rm -rf node_modules/.cache
   ```
3. Reinstall dependencies:
   ```bash
   rm -rf node_modules && npm install
   ```

### `Error: Cannot find module '@midnight-ntwrk/...'`

**Cause**: Midnight packages not installed or version conflict.

**Solutions**:
1. Install the missing package:
   ```bash
   npm install @midnight-ntwrk/compact-runtime
   ```
2. Check for version conflicts:
   ```bash
   npm list @midnight-ntwrk/compact-runtime
   ```
3. Use exact versions in package.json (no `^` or `~`).

### `Unexpected token 'export'`

**Cause**: ESM/CommonJS module incompatibility.

**Solutions**:
1. Ensure `"type": "module"` in package.json for ESM
2. Or use `.mjs` extension for ESM files
3. Or configure TypeScript to output CommonJS

## Version Mismatch Errors

### `Version mismatch: compiler X.Y.Z but runtime expects A.B.C`

**Cause**: Compact compiler version doesn't match runtime library version.

**Solutions**:
1. Check compatibility matrix (`/midnight:versions`)
2. Update compiler:
   ```bash
   compact update <version>
   ```
3. Or update runtime:
   ```bash
   npm install @midnight-ntwrk/compact-runtime@<version>
   ```
4. Recompile contracts after any version change.

### `pragma language_version X.Y does not match compiler version`

**Cause**: Contract declares a language version the current compiler doesn't support.

**Solutions**:
1. Update the pragma in your `.compact` file:
   ```compact
   pragma language_version 0.18;  // Match your compiler
   ```
2. Or switch compiler version:
   ```bash
   compact update <version>
   # Or for one-off:
   compact compile +0.25.0 src/contract.compact build/
   ```

## Docker & Proof Server Errors

### `Cannot connect to the Docker daemon`

**Full error**: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`

**Cause**: Docker Desktop not running.

**Solutions**:
1. Start Docker Desktop application
2. Wait for daemon to initialize
3. Verify: `docker info`

### `Error response from daemon: pull access denied`

**Cause**: Docker image doesn't exist or registry issue.

**Solutions**:
1. Check image name:
   ```bash
   docker search midnightnetwork
   ```
2. Pull with correct name:
   ```bash
   docker pull midnightnetwork/proof-server:latest
   ```

### `bind: address already in use` (port 6300)

**Cause**: Something else is using port 6300.

**Solutions**:
1. Find and stop the process:
   ```bash
   lsof -i :6300
   kill <PID>
   ```
2. Or use a different port:
   ```bash
   docker run -p 6301:6300 midnightnetwork/proof-server -- midnight-proof-server --network testnet
   ```

### `Proof server connection refused`

**Cause**: Proof server not running or wrong address.

**Solutions**:
1. Start proof server:
   ```bash
   docker run -p 6300:6300 midnightnetwork/proof-server -- midnight-proof-server --network testnet
   ```
2. Check it's running:
   ```bash
   docker ps | grep proof-server
   ```
3. Verify port mapping is correct.

## Compilation Errors

### `Unknown symbol '...'`

**Cause**: Using a feature not available in the declared language version.

**Solutions**:
1. Check if feature was added in a later version
2. Update pragma and compiler if feature is needed
3. Check release notes for when feature was introduced (`/midnight:changelog compact`)

### `Type error: expected X but got Y`

**Cause**: Type mismatch in Compact code.

**Solutions**:
1. Check the exact types involved
2. Use explicit casts if needed: `value as TargetType`
3. Review type rules in release notes for version-specific changes

### `Circuit generation failed: too complex`

**Cause**: Contract logic too complex for ZK circuit generation.

**Solutions**:
1. Simplify computation logic
2. Split into multiple smaller circuits/transactions
3. Reduce loop iterations or recursion depth

## Package Manager Conflicts

### `ERESOLVE unable to resolve dependency tree`

**Cause**: npm peer dependency conflict.

**Solutions**:
1. Use exact versions in package.json
2. Clear and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Use `npm install --legacy-peer-deps` as last resort

### Mixed lockfile errors

**Cause**: Both `package-lock.json` and `bun.lock` present.

**Solutions**:
1. Choose one package manager
2. Remove the other lockfile:
   ```bash
   # For npm:
   rm bun.lock
   # For Bun:
   rm package-lock.json
   ```
3. Reinstall with chosen manager

## Build & Runtime Errors

### `ReferenceError: BigInt is not defined`

**Cause**: Node.js version too old.

**Solutions**:
1. Upgrade Node.js to 18+:
   ```bash
   nvm install 18
   nvm use 18
   ```

### `Error: ENOENT: no such file or directory, open '.../*.prover'`

**Cause**: Compiled contract artifacts missing.

**Solutions**:
1. Compile the contract:
   ```bash
   compact compile src/contract.compact contract/
   ```
2. Check output directory path is correct
3. Verify compilation succeeded without errors
