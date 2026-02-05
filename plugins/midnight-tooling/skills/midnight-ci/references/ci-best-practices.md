# Midnight CI Best Practices

Detailed guidance for setting up robust CI/CD for Midnight projects.

## Version Management in CI

### Pin Everything

Create a `.midnight-versions` file in your repo:

```bash
# .midnight-versions
COMPACT_VERSION=0.26.0
PROOF_SERVER_TAG=4.0.0
NODE_VERSION=20
```

Source in workflows:

```yaml
- name: Load versions
  run: |
    source .midnight-versions
    echo "COMPACT_VERSION=$COMPACT_VERSION" >> $GITHUB_ENV
    echo "PROOF_SERVER_TAG=$PROOF_SERVER_TAG" >> $GITHUB_ENV
```

### Version Consistency Check

Add a job to verify versions match:

```yaml
version-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Check version consistency
      run: |
        # Read expected versions
        source .midnight-versions

        # Check package.json
        RUNTIME_VERSION=$(jq -r '.dependencies["@midnight-ntwrk/compact-runtime"]' package.json)

        # Validate (example mapping)
        if [[ "$COMPACT_VERSION" == "0.26.0" && "$RUNTIME_VERSION" != "0.9.0" ]]; then
          echo "Error: Compiler $COMPACT_VERSION requires runtime 0.9.0, found $RUNTIME_VERSION"
          exit 1
        fi

        echo "Version check passed"
```

## Caching Strategies

### Compact Compiler Cache

```yaml
- name: Cache Compact
  uses: actions/cache@v4
  with:
    path: |
      ~/.compact
    key: compact-${{ runner.os }}-${{ env.COMPACT_VERSION }}
    restore-keys: |
      compact-${{ runner.os }}-
```

### npm Dependencies Cache

```yaml
- name: Cache npm
  uses: actions/cache@v4
  with:
    path: |
      node_modules
      ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      npm-${{ runner.os }}-
```

### Compiled Contracts Cache

For monorepos or unchanged contracts:

```yaml
- name: Cache compiled contracts
  uses: actions/cache@v4
  with:
    path: build/
    key: contracts-${{ hashFiles('contracts/**/*.compact') }}
```

## Proof Server in CI

### Using GitHub Services

```yaml
services:
  proof-server:
    image: midnightnetwork/proof-server:${{ env.PROOF_SERVER_TAG }}
    ports:
      - 6300:6300
    options: >-
      --health-cmd "curl -sf http://localhost:6300/health || exit 1"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 10
      --health-start-period 30s
```

### Manual Container Management

For more control:

```yaml
- name: Start proof server
  run: |
    docker run -d \
      --name proof-server \
      -p 6300:6300 \
      midnightnetwork/proof-server:${{ env.PROOF_SERVER_TAG }} \
      -- midnight-proof-server --network testnet

    # Wait for health
    timeout 60 bash -c 'until curl -sf http://localhost:6300/health; do sleep 2; done'

- name: Run tests
  run: npm test

- name: Stop proof server
  if: always()
  run: docker stop proof-server
```

## Test Organization

### Separate Test Suites

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration"
  }
}
```

### Parallel Jobs

Run unit and integration tests in parallel:

```yaml
jobs:
  unit-tests:
    # No proof server needed
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:unit

  integration-tests:
    # With proof server
    runs-on: ubuntu-latest
    services:
      proof-server:
        # ...
    steps:
      - run: npm run test:integration
```

## Artifact Management

### Upload Compiled Contracts

```yaml
- name: Upload contracts
  uses: actions/upload-artifact@v4
  with:
    name: contracts-${{ github.sha }}
    path: |
      build/**/*.cjs
      build/**/*.d.cts
      build/**/*.prover
      build/**/*.verifier
    retention-days: 7
```

### Download in Dependent Jobs

```yaml
- name: Download contracts
  uses: actions/download-artifact@v4
  with:
    name: contracts-${{ github.sha }}
    path: build/
```

## Matrix Testing

### Multiple Node Versions

```yaml
strategy:
  matrix:
    node: ['18', '20', '22']

steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node }}
```

### Multiple Compiler Versions

```yaml
strategy:
  matrix:
    compact: ['0.25.0', '0.26.0']

steps:
  - run: compact update ${{ matrix.compact }}
```

## Security Considerations

### Secrets Management

```yaml
- name: Deploy
  env:
    DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
  run: ./deploy.sh
```

### Dependency Scanning

```yaml
- name: Audit dependencies
  run: npm audit --production
```

### SARIF Upload

```yaml
- name: Run security scan
  uses: github/codeql-action/analyze@v2
```

## Branch Protection

Recommended settings:

```yaml
# .github/settings.yml (with probot/settings)
branches:
  - name: main
    protection:
      required_status_checks:
        strict: true
        contexts:
          - compile
          - unit-tests
          - integration-tests
          - lint
      required_pull_request_reviews:
        required_approving_review_count: 1
```

## Monitoring and Notifications

### Slack Notification

```yaml
- name: Notify Slack
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    channel-id: 'builds'
    slack-message: 'CI failed for ${{ github.repository }}'
  env:
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

### Build Badges

Add to README:

```markdown
![CI](https://github.com/org/repo/actions/workflows/test.yml/badge.svg)
```

## Troubleshooting CI

### Debug Mode

```yaml
- name: Debug
  if: failure()
  run: |
    echo "=== Environment ==="
    env | sort

    echo "=== Compact ==="
    compact --version || echo "Not installed"
    compact list --installed || echo "No compilers"

    echo "=== Node ==="
    node --version
    npm list | grep @midnight-ntwrk

    echo "=== Docker ==="
    docker ps -a
```

### SSH Debug Session

For debugging failures:

```yaml
- name: Debug SSH
  if: failure()
  uses: mxschmitt/action-tmate@v3
  timeout-minutes: 15
```

## Example: Complete Workflow

See the templates in `templates/github-workflows/` for complete working examples:

- `compile-contracts.yml` - Basic compilation
- `test-dapp.yml` - Full testing suite
- `release.yml` - Release automation
