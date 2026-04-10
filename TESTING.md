# Testing Strategy

## Integration Test Layers

Kubernetes microservices projects have two layers of integration testing:

### Layer 1: Infrastructure Integration Tests (BATS)

Validates that the deployment and platform work correctly — pods running, services reachable, probes passing.

```bash
@test "service-a: rollout completes successfully" {
  run kubectl rollout status deployment/service-a --timeout=60s
  [ "$status" -eq 0 ]
}

@test "service-a can reach service-b via K8s DNS" {
  run kubectl exec deploy/service-a -- wget -qO- http://service-b:3001/info
  [ "$status" -eq 0 ]
  [[ "$output" =~ "service-b" ]]
}
```

**When:** Every project, regardless of business logic. Needs a running cluster.

**Tooling:** [BATS](https://github.com/bats-core/bats-core) (Bash Automated Testing System) — the industry standard for shell/infrastructure testing. Used by Helm, Bitnami, and platform teams.

### Layer 2: Business Integration Tests

Validates that services behave correctly together — real HTTP calls, real responses, real assertions.

```typescript
const response = await axios.get(`${baseUrl}/health`);
expect(response.status).toBe(200);
expect(response.data).toMatchObject({ status: "ok" });
```

**When:** When services have endpoints worth asserting against.

**Tooling:** Vitest + axios (pinned to `1.15.0` — lower versions had a malicious actor) + config-driven base URLs.

## The Pattern: Vitest + Axios + HTTP

Integration tests follow a common production pattern:

1. Live in a separate test directory — not inside the service source
2. Use a config module to resolve base URLs from env vars
3. Hit real running endpoints via axios
4. Assert on HTTP status codes and response shapes
5. Run via `vitest run` with a dedicated config

### What's implemented

```
tests/integration/
├── setup.ts               # Global setup — auto-detects environment, port-forwards if Kind
├── config.ts              # Resolves base URLs from env vars
├── service-a.test.ts      # GET /health + GET /data (service-to-service)
├── service-b.test.ts      # GET /health + GET /info
├── tsconfig.json
└── vitest.config.mts
```

The `setup.ts` global setup makes tests self-contained — no manual steps required:

1. **Env vars set?** → Uses those URLs directly (for CI or custom targets)
2. **Local services running?** → Tests run immediately
3. **Kind cluster detected?** → Auto port-forwards, waits for services, cleans up after
4. **Nothing available?** → Fails with clear message

```bash
# Just run — setup.ts handles the rest
npm run test:integration
```

### Why this works for infrastructure testing too

The services in this project are intentionally trivial — the point is testing the platform. But the Vitest + axios + HTTP pattern still applies because:

- `/health` endpoints validate that pods are running and probes work
- `/data` (Service A → Service B) validates service-to-service comms via K8s DNS
- Response shape assertions catch deployment misconfigurations (wrong env vars, broken images, missing services)

Same tooling, same pattern — whether you're testing a complex API or a dummy Express app.

## What This Project Uses

| Layer | Tool | Status | What it covers |
|-------|------|--------|----------------|
| Infrastructure (K8s) | BATS | ✅ Active | Rollout status, replica counts, pod health, zero restarts, DNS, service-to-service comms |
| Service endpoints | Vitest + axios | ✅ Active | HTTP assertions on `/health`, `/data`, `/info` |
| Business | Vitest + axios | ⏳ Not yet | No business logic to test yet |

### Test structure

```
tests/
├── infrastructure/            # BATS — needs a running K8s cluster
│   ├── test_helper.bash       # Shared helpers (rollout, replicas, exec)
│   ├── deploy.bats            # Rollout, replicas, pod state, resource limits, restarts
│   └── connectivity.bats      # DNS resolution, health endpoints, service-to-service
└── integration/               # Vitest + axios — needs services running (local or cluster)
    ├── config.ts              # Base URLs from env vars
    ├── service-a.test.ts      # GET /health + GET /data
    ├── service-b.test.ts      # GET /health + GET /info
    ├── tsconfig.json
    └── vitest.config.mts
```

### Commands

```bash
# Infrastructure tests (needs Kind cluster — fails clearly if none)
npm run test:infra

# Service integration tests (auto-detects local or Kind — no manual setup)
npm run test:integration
```

### Dependencies

| Package | Version | Notes |
|---------|---------|-------|
| bats-core | latest | Infrastructure test runner (`brew install bats-core`) |
| vitest | latest | Service integration test runner |
| axios | `1.15.0` (pinned) | HTTP client — lower versions had a malicious actor, do not use `^` range |

## Scaling the Test Structure

Right now the project is small — a flat `tests/integration/` directory is enough. As services grow, the test structure scales with it.

### Stage 1: Flat directory (current)

```
tests/integration/
├── config.ts
├── service-a.test.ts
├── service-b.test.ts
└── vitest.config.mts
```

### Stage 2: Fixtures and utils

When tests need shared test data or helper functions (auth, wait/retry, session setup), extract them:

```
tests/integration/
├── fixtures/
│   └── fixtures.ts          # Reusable request payloads, expected responses
├── utils/
│   ├── auth.ts              # Token generation, session helpers
│   └── wait.ts              # Polling/retry helpers for async operations
├── config.ts
├── service-a.test.ts
└── service-b.test.ts
```

Fixtures keep test data out of test files. Utils keep helper logic reusable across test suites.

### Stage 3: Per-service test packages

When the number of services grows, each service gets its own test package with its own config, fixtures, and dependencies:

```
packages/tests/
├── service-a-integration-tests/
│   ├── src/
│   │   ├── config.ts
│   │   ├── fixtures/fixtures.ts
│   │   ├── utils/
│   │   └── service-a.test.ts
│   ├── vitest.config.mts
│   └── package.json
├── service-b-integration-tests/
│   └── ...
└── integration-test-helpers/     # Shared test utilities (see below)
    └── ...
```

### Stage 4: Shared test utilities as an internal package

When multiple test packages need the same helpers (config loading, auth clients, HTTP wrappers), extract them into a shared internal package:

```
packages/shared/
├── test-utils/
│   ├── src/
│   │   ├── config.ts        # Generic config loader (env vars, SSM, stack outputs)
│   │   ├── auth-client.ts   # Shared auth token helpers
│   │   └── http.ts          # Axios wrapper with defaults (timeouts, retries)
│   └── package.json         # Internal package, referenced by test packages
```

Test packages then import from the shared package:

```typescript
import { loadConfig } from "@myorg/test-utils/config";
import { getAuthToken } from "@myorg/test-utils/auth-client";
```

This avoids duplicating config/auth/HTTP logic across every test package. In a monorepo (Lerna, Nx, npm workspaces), these resolve as local dependencies.

### When to move between stages

| Signal | Action |
|---|---|
| Tests have inline request payloads or expected data | Extract to `fixtures/` |
| Multiple tests duplicate helper logic (auth, polling) | Extract to `utils/` |
| More than 2-3 services with integration tests | Split into per-service test packages |
| Test packages duplicate the same utils | Extract to a shared `test-utils` package |

## CI Pipeline

GitHub Actions runs the full pipeline on every push:

```
install → lint ──────────┐
        → typecheck ─────┤
        → validate-k8s ──┴→ deploy-and-test
                              ├── Create Kind cluster
                              ├── Build + load images
                              ├── Deploy manifests
                              ├── BATS infra tests
                              ├── Vitest integration tests
                              └── Teardown (always)
```

Static checks run in parallel and must pass before the deploy job starts.

### Why one job, not ordered steps

Deploy + both test suites run in a single job because the Kind cluster can't persist across GitHub Actions jobs (each job gets a fresh runner). But within that job, the test suites are **not dependent on each other**.

Each suite is self-contained:
- **BATS** checks the cluster exists before running — if there's no cluster, it fails with a clear message, not a cryptic kubectl error
- **Vitest** auto-detects the environment in `setup.ts` — port-forwards to Kind if needed, waits for services to be reachable, cleans up after

They happen to run in sequence (BATS then Vitest) because they're steps in the same job, but neither depends on the other's output. You could run them in any order, or run either one in isolation. The only shared dependency is the cluster itself — which is infrastructure, not test state.

## Terraform Pipeline Testing (Reference)

Terraform pipeline libraries commonly use a **dummy downstream project** pattern to test CI templates:

```
tf-pipeline-library/           # Shared CI templates, scripts, Docker image
tf-pipeline-test/              # Dummy Terraform — exercises the pipeline
```

1. Engineer changes the pipeline library
2. CI triggers the dummy test project as a downstream pipeline
3. Test project runs real plan/apply/destroy using the updated templates
4. If all scenarios pass, the change is safe to merge

The Terraform itself is trivial — the point is exercising the pipeline, not deploying real infrastructure. Same principle as this project: dummy services, real platform testing.

| Terraform pipeline testing | platform-quality-lab |
|---|---|
| Dummy Terraform files | Dummy Express services |
| Plan → Apply → Destroy | Build → Deploy → Verify → Teardown |
| Downstream pipeline trigger | Kind cluster in CI job |
