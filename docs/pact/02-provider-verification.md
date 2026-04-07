# Provider Verification Guide

## What is Provider Verification?

Provider verification is the process where a provider service replays the interactions defined in a consumer's pact file against its real API. If all responses match the contract, the provider is verified.

## Prerequisites

Before a provider can verify pacts, it needs to be registered with the Pact Broker. This is a one-time setup per provider — see [03-provider-initialisation.md](./03-provider-initialisation.md).

## How Verification Works

1. The provider test fetches pacts from the Pact Broker
2. For each interaction, the framework sends the request to a locally running instance of the provider
3. The actual response is compared against the expected response in the pact
4. Results (pass/fail) are published back to the Pact Broker

```
┌─────────────┐    fetch pacts    ┌─────────────┐
│ Pact Broker │ ───────────────▶  │  Provider   │
│             │                   │  Verifier   │
│             │  ◀─────────────── │  (test)     │
│             │  publish results  └──────┬──────┘
└─────────────┘                          │
                                         ▼
                                  ┌─────────────┐
                                  │  Provider   │
                                  │  API (local)│
                                  └─────────────┘
```

## Writing a Provider Verification Test

### 1. Start a Local Instance of Your Provider

Spin up your API locally within the test. This can be a lightweight HTTP server that routes to your real handlers:

```typescript
let server: http.Server

beforeAll(() => {
  server = http.createServer((req, res) => {
    // route requests to your real handler logic
  })
  server.listen(8000)
})

afterAll(() => {
  server.close()
})
```

The key point: use your real handler code, not mocks. The whole purpose is to verify your actual implementation matches the contract.

### 2. Configure the Verifier

```typescript
await verifyProvider({
  provider: '<provider-name>',
  providerUrl: 'http://localhost:8000',
  branch: '<git-branch>',
  version: '<git-short-sha>',
  pipelineExecution: process.env.CI === 'true',
  pactUrl: process.env.PACT_URL,              // set by webhook trigger
  workInProgressPactsSince: '2022-08-01',
  authentication: {
    username: process.env.PACT_BROKER_USERNAME,
    password: process.env.PACT_BROKER_PASSWORD,
  },
  logLevel: 'warn',
})
```

Key configuration:
- `provider` — must match the name registered in the Broker
- `providerUrl` — where your local server is running
- `version` — always use the git short SHA
- `branch` — the current branch name
- `pactUrl` — when triggered by a webhook, this points to the specific pact to verify
- `workInProgressPactsSince` — includes unverified pacts from feature branches (WIP pacts)

### 3. Implement State Handlers

Consumers define provider states (e.g. "a user exists with id 123"). The provider must set up the corresponding data:

```typescript
stateHandlers: {
  'a user exists with id 123': () => {
    // set up test data or stub dependencies
    return Promise.resolve()
  },
  'no users exist': () => {
    // clear data or configure empty responses
    return Promise.resolve()
  },
}
```

State handlers are where you stub external dependencies or seed test data so the provider can return the expected response.

## Test Configuration

### Separate Pact Config from Unit Tests

Keep pact tests in their own config with a dedicated test pattern:

```javascript
// jest.pact.config.js
module.exports = {
  testRegex: '/*(pact.spec.ts)',
  watchPathIgnorePatterns: ['pact/logs/*', 'pact/pacts/*'],
  testTimeout: 30000,
}
```

Or with Vitest:

```typescript
// vitest.pact.config.mts
export default {
  test: {
    include: ['**/pact/**/*.spec.ts'],
    testTimeout: 30000,
    coverage: undefined, // disable coverage for pact tests
  },
}
```

### Environment Variables for Local Development

Set up a helper file so pact tests work both locally and in CI:

```typescript
// set-env-vars.ts
import { execSync } from 'child_process'

if (process.env.CI !== 'true') {
  process.env.CI = 'false'
  process.env.CI_COMMIT_BRANCH = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  process.env.CI_COMMIT_SHORT_SHA = execSync('git rev-parse --short HEAD').toString().trim()
  process.env.PACT_BROKER_USERNAME = ''
  process.env.PACT_BROKER_PASSWORD = ''
}
```

## CI/CD Integration

### Webhook-Triggered Verification

When a consumer publishes a new pact, the Broker triggers a webhook that runs the provider's pipeline with:
- `PACT_URL` — the specific pact to verify
- `PACT_PROVIDER_VERSION` — the provider version
- `PACT_PROVIDER_BRANCH` — the provider branch

This means the provider verifies new contracts automatically without waiting for a scheduled build.

### Can-I-Deploy Gate

Before deploying, check compatibility:

```yaml
# CI pipeline example
can_deploy:
  script:
    - pact-broker can-i-deploy
        --pacticipant <provider-name>
        --version $CI_COMMIT_SHORT_SHA
        --to-environment <target-environment>
        --broker-base-url $PACT_BROKER_URL
        --broker-username $PACT_BROKER_USERNAME
        --broker-password $PACT_BROKER_PASSWORD
```

Run this gate before each environment deployment (QA, staging, prod).

### Record Deployment

After a successful deploy, record it so the Broker knows what's running where:

```bash
pact-broker record-deployment \
  --pacticipant <provider-name> \
  --version $CI_COMMIT_SHORT_SHA \
  --environment <environment> \
  --broker-base-url $PACT_BROKER_URL \
  --broker-username $PACT_BROKER_USERNAME \
  --broker-password $PACT_BROKER_PASSWORD
```

## Best Practices

- Use your real handler code in the verification server — don't rewrite the logic
- Stub only external dependencies (databases, third-party APIs) via state handlers
- Keep pact tests separate from unit tests with their own config and timeout
- Always publish verification results from CI, not locally
- Use `workInProgressPactsSince` to catch breaking changes from consumer feature branches early
- Set a generous test timeout (30s+) — pact verification involves network calls to the Broker
- Name your provider states descriptively — consumers rely on these strings to set up scenarios

## Common Mistakes

- **Not implementing state handlers** — verification fails because the provider can't set up the required data
- **Mocking the provider's own logic** — defeats the purpose; only mock external dependencies
- **Forgetting to publish results** — the Broker can't track verification status without them
- **Hardcoding broker credentials** — use environment variables or a secrets manager
- **Skipping can-i-deploy** — deploying without checking compatibility risks breaking consumers

## Next Steps

If this is a new provider, you need to register it with the Broker first. See [03-provider-initialisation.md](./03-provider-initialisation.md).
