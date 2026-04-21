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

Using the official [`@pact-foundation/pact`](https://github.com/pact-foundation/pact-js) library:

```typescript
import { Verifier } from '@pact-foundation/pact'

const verifier = new Verifier({
  provider: '<provider-name>',
  providerBaseUrl: 'http://localhost:8000',
  pactBrokerUrl: process.env.PACT_BROKER_URL,
  pactBrokerUsername: process.env.PACT_BROKER_USERNAME,
  pactBrokerPassword: process.env.PACT_BROKER_PASSWORD,
  publishVerificationResult: process.env.CI === 'true',
  providerVersion: '<git-short-sha>',
  providerVersionBranch: '<git-branch>',
  consumerVersionSelectors: [
    { mainBranch: true },
    { deployedOrReleased: true },
  ],
  enablePending: true,
  includeWipPactsSince: '2022-08-01',
  logLevel: 'warn',
})

await verifier.verifyProvider()
```

Key configuration:
- `provider` — must match the name registered in the Broker
- `providerBaseUrl` — where your local server is running
- `providerVersion` — always use the git short SHA
- `providerVersionBranch` — the current branch name
- `publishVerificationResult` — only publish from CI, never locally
- `consumerVersionSelectors` — which consumer pacts to verify (main branch + deployed/released versions)
- `enablePending` — new pacts don't break the provider build until verified once
- `includeWipPactsSince` — includes unverified pacts from consumer feature branches (WIP pacts)

See the [official Pact JS provider docs](https://docs.pact.io/implementation_guides/javascript/docs/provider) for the full API.

### 3. Implement State Handlers

Consumers define provider states (e.g. "a user exists with id 123"). The provider must set up the corresponding data. State handlers are passed as part of the Verifier options:

```typescript
const verifier = new Verifier({
  // ...other options from above
  stateHandlers: {
    'a user exists with id 123': () => {
      // set up test data or stub dependencies
      return Promise.resolve()
    },
    'no users exist': () => {
      // clear data or configure empty responses
      return Promise.resolve()
    },
  },
})
```

State handlers are where you stub external dependencies or seed test data so the provider can return the expected response. See the [official state handler docs](https://docs.pact.io/implementation_guides/javascript/docs/provider#api-with-provider-states) for more details.

## Test Configuration

### Separate Pact Config from Unit Tests

Keep pact tests in their own config with a dedicated test pattern:

```javascript
// jest.pact.config.js
module.exports = {
  testMatch: ['**/*.pact.spec.ts'],
  testTimeout: 30000,
}
```

Or with Vitest:

```typescript
// vitest.pact.config.mts
export default {
  test: {
    include: ['**/*.pact.spec.ts'],
    testTimeout: 30000,
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
  process.env.GIT_BRANCH = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  process.env.GIT_SHORT_SHA = execSync('git rev-parse --short HEAD').toString().trim()
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
        --version $GIT_SHORT_SHA
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
  --version $GIT_SHORT_SHA \
  --environment <environment> \
  --broker-base-url $PACT_BROKER_URL \
  --broker-username $PACT_BROKER_USERNAME \
  --broker-password $PACT_BROKER_PASSWORD
```

## Stubbing External Dependencies

Providers often depend on external services (3rd party APIs, databases, other microservices). During Pact verification, these dependencies must be stubbed — the provider's real logic runs, but external calls return controlled responses.

The principle: **mock the dependency, not the provider.** The provider's code (validation, transformation, response building) runs for real. Only the external call is faked.

### Three Stubbing Approaches

| Approach | How it works | When to use |
|---|---|---|
| `vi.mock()` module replacement | Replace the dependency module with a mock at import time | Simple dependencies — one function call to stub |
| Fetch interceptor | Intercept `fetch` calls and return fake responses based on URL | Services that call external APIs via HTTP |
| Stub HTTP servers | Spin up real HTTP servers (e.g. Fastify, Express) that mimic the external API | Complex dependencies — GraphQL APIs, OAuth servers, services with multiple endpoints |

#### Pattern 1: Module mock (`vi.mock`)

Replace the function that calls the external service:

```typescript
const { externalCallMock } = vi.hoisted(() => ({
  externalCallMock: vi.fn(),
}))

vi.mock('../../externalClient', () => ({
  callExternalService: externalCallMock,
}))

// In state handler:
stateHandlers: {
  'service is running': () => {
    externalCallMock.mockResolvedValue({ result: 'stubbed data' })
    return Promise.resolve()
  },
}
```

Simplest approach. Works when the dependency is a single function call. Used in this project for Service B (no external dependencies to stub).

#### Pattern 2: Fetch interceptor

Intercept HTTP calls at the `fetch` level:

```typescript
const originalFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString()

  if (url.includes('/api/generate')) {
    return new Response(JSON.stringify(stubbedResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return originalFetch(input, init)  // pass through non-stubbed calls
}
```

More realistic than `vi.mock()` — the provider's real HTTP client code runs (headers, timeouts, error handling). Only the network call is intercepted. Used in this project for Service C (stubs the LLM API).

#### Pattern 3: Stub HTTP servers

Spin up real HTTP servers that mimic external dependencies:

```typescript
import fastify from 'fastify'

class ExternalAPIServer {
  private server = fastify()
  private handlers: Map<string, object> = new Map()

  use(path: string, response: object) {
    this.handlers.set(path, response)
  }

  async start(port: number) {
    this.server.post('/api/*', (req, reply) => {
      const handler = this.handlers.get(req.url)
      if (handler) return reply.send(handler)
      return reply.code(404).send()
    })
    await this.server.listen({ port })
  }

  async stop() {
    await this.server.close()
  }
}
```

Most realistic — the provider makes real HTTP calls to a real server. Tests the full network stack including DNS resolution, connection handling, and response parsing. Used in production for complex dependencies like GraphQL APIs or OAuth servers that require specific protocols (HTTPS, custom headers).

### The StubbedIntegrations Pattern

Wrap all stubs in a class that manages setup and teardown:

```typescript
export class StubbedIntegrations {
  start() {
    // Set up all stubs
    return this
  }

  reset() {
    // Clear all stubs
    return this
  }
}
```

State handlers call `stubs.start()` to set up the scenario, and `beforeEach` or `afterAll` calls `stubs.reset()` to clean up. This keeps the verifier spec clean — it doesn't know the stubbing details, just that the integrations are stubbed.

### State Handlers with Dynamic Data

Consumer pacts can pass parameters to state handlers via `params`:

```typescript
// Consumer pact:
.given('service-c is running with model loaded', { model: 'llama3.2:1b', category: 'critical' })

// Provider state handler:
stateHandlers: {
  'service-c is running with model loaded': (params) => {
    stubs.withClassifyResponse(buildResponse(params.category)).start()
    return Promise.resolve()
  },
}
```

This allows the same state handler to set up different scenarios based on what the consumer needs. More flexible than one state handler per scenario.

## Multiple Providers and Consumers in One Repo

In a monorepo with multiple services, a single repo can contain several providers and consumers. A service can also be both — it acts as a provider (verified by external consumers) and a consumer (of another service in the same repo).

### How it works

Each service boundary gets its own pact:

```
Service A (consumer) → Service B (provider)     → pact: service-a-service-b.json
Service A (consumer) → Service C (provider)     → pact: service-a-service-c.json
```

Service A is a consumer of two providers (B and C). Each pact is independent — they're verified separately.

### Structure in a monorepo

Each provider has its own verifier spec, its own stubs, and its own state handlers:

```
tests/pact/
├── consumer/
│   └── service-a.pact.spec.ts        # A → B and A → C consumer tests
├── provider/
│   ├── service-b.verify.spec.ts      # B verified against A's pact
│   └── service-c.verify.spec.ts      # C verified against A's pact
└── stubs/
    └── integrations/
        └── ollama.ts                  # Stubs for C's LLM dependency
```

### A service that is both consumer and provider

This is common. In this project, Service A is both:
- A **provider** — serves `/data` and `/classify` to external clients
- A **consumer** — calls Service B (`/info`) and Service C (`/classify`)

```
External client (consumer) → Service A (provider + consumer) → Service B (provider)
                                                              → Service C (provider)
```

Service A has:
- **Consumer tests** that define what it expects from Service B and Service C
- **Stubs** for Service B and Service C during provider verification (if Service A is ever verified as a provider)

The consumer tests and provider verifiers are completely independent — they run in separate test suites, use separate configs, and verify different contracts.

The key insight: when a service is being verified as a provider, its downstream dependencies must be stubbed. The service's real logic runs, but downstream calls return controlled data. This is the same StubbedIntegrations pattern described above.

### CI with multiple providers and consumers

In CI, each consumer publishes its pacts independently, and each provider verifies independently:

```yaml
  # Consumer jobs
pact_test:
  parallel:
    matrix:
      - PACTICIPANT_NAME: "service-a"
        PACTS_PATH: "tests/pacts"

# Provider verification
verify_pacts:
  variables:
    PACTICIPANTS: "service-b;service-c"

# Can-i-deploy — checks all participants
can_i_deploy:
  variables:
    PACTICIPANTS: "service-a;service-b;service-c"
```

Each provider verifier automatically picks up all consumer pacts from the Broker — you don't need to list consumers explicitly. The Broker knows the dependency graph.

### When this gets complex

| Scenario | Complexity | How to manage |
|---|---|---|
| 2-3 services, clear dependencies | Low | One consumer spec per consumer, one verifier per provider |
| Service is both consumer and provider | Medium | Separate test suites, separate stubs for each role |
| Many services with cross-dependencies | High | Per-service test directories, shared stub libraries, CI parallel matrix |
| Cross-repo consumers | High | Webhooks trigger provider verification when consumer publishes |

For this project (3 services, one repo), the current structure is right — one consumer spec for Service A (covers both B and C), separate verifiers for B and C, stubs only for C (B has no external dependencies).

### Scaling beyond this project

This project demonstrates the simple case — one consumer, two providers, one repo. In a larger system:

- **Multiple consumers per provider** — Service B might be consumed by Service A, a mobile app, and a batch job. Each consumer writes its own pact. The provider verifier picks up all of them from the Broker automatically — no config change needed per new consumer.
- **Cross-repo consumers** — when consumers are in different repos, a Broker webhook triggers the provider's pipeline when a new pact is published. The provider verifies without knowing which consumer triggered it. See [06-repo-separation.md](./06-repo-separation.md).
- **Per-service test directories** — when the monorepo grows beyond 3-4 services, move pact tests into each service's directory instead of a shared `tests/pact/`. Each service owns its consumer tests and provider verifier.
- **Shared stub libraries** — when multiple providers stub the same dependency (e.g. an auth service), extract the stub into a shared test utility. Same pattern as `@myorg/platform-quality-utils` — extract when you find yourself duplicating.

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
