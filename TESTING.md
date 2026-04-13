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

## Testing AI/LLM Services (Phase 6–7)

Phases 6 and 7 introduce an AI-powered service into the platform. The service itself is intentionally simple — the point is learning how to test non-deterministic AI outputs with the same rigour as deterministic services.

### The Problem: Non-Deterministic Output

Traditional services return the same output for the same input. AI services don't. The same prompt can produce different wording, different structure, different confidence levels across runs. You can't `expect(response.data).toEqual(exactValue)` — you need a different assertion vocabulary.

### Assertion Patterns for AI Outputs

These patterns apply regardless of what the AI service does — classification, summarisation, extraction, generation.

#### 1. Schema / Shape Assertions

The most basic and most reliable. Assert that the response has the right structure, regardless of content.

```typescript
// The AI response must always have these fields
expect(response.data).toHaveProperty("result");
expect(response.data).toHaveProperty("confidence");
expect(typeof response.data.result).toBe("string");
expect(response.data.result.length).toBeGreaterThan(0);
```

This catches: broken prompts, model API changes, serialisation bugs, empty responses. It doesn't catch: wrong answers.

#### 2. Range / Bound Assertions

AI outputs often include scores, counts, or numeric values. Assert they fall within acceptable bounds.

```typescript
// Confidence must be a number between 0 and 1
expect(response.data.confidence).toBeGreaterThanOrEqual(0);
expect(response.data.confidence).toBeLessThanOrEqual(1);

// Response shouldn't be absurdly long or suspiciously short
expect(response.data.result.length).toBeGreaterThan(10);
expect(response.data.result.length).toBeLessThan(5000);
```

This catches: hallucinated scores, runaway generation, truncated output.

#### 3. Containment / Keyword Assertions

When you know the output should reference specific things, assert on presence rather than exact match.

```typescript
// If we asked about "networking", the response should mention it
expect(response.data.result.toLowerCase()).toContain("network");

// Should NOT contain things that indicate failure
expect(response.data.result).not.toContain("I cannot");
expect(response.data.result).not.toContain("As an AI");
```

This catches: off-topic responses, refusals, prompt injection leaks.

#### 4. Enum / Classification Assertions

When the AI picks from a known set of options, assert the output is one of them.

```typescript
const validCategories = ["critical", "warning", "info", "ok"];
expect(validCategories).toContain(response.data.severity);

// Every item in a list should be from the allowed set
for (const item of response.data.tags) {
  expect(validTags).toContain(item);
}
```

This catches: hallucinated categories, typos in structured output, model ignoring constraints.

#### 5. Consistency Assertions (Multi-Run)

Run the same input N times and assert that results are consistent enough.

```typescript
const results = await Promise.all(
  Array.from({ length: 5 }, () => callAiService(sameInput))
);

// All runs should pick the same category for an obvious input
const categories = results.map((r) => r.data.category);
const uniqueCategories = new Set(categories);
expect(uniqueCategories.size).toBe(1);

// Confidence should be stable (low variance)
const scores = results.map((r) => r.data.confidence);
const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
const variance =
  scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
expect(variance).toBeLessThan(0.05);
```

This catches: flaky prompts, temperature too high, model instability.

#### 6. Golden Set / Benchmark Assertions

The most important pattern for AI correctness. Build a curated dataset where you **know** the right answer, run the AI against it, and assert on aggregate accuracy.

```typescript
interface GoldenCase {
  input: string;
  expectedOutput: string; // or expectedCategory, expectedScore, etc.
}

const goldenSet: GoldenCase[] = loadFixtures("golden-set.json");

const results = await Promise.all(
  goldenSet.map(async (tc) => {
    const response = await callAiService(tc.input);
    return response.data.result === tc.expectedOutput;
  })
);

const accuracy = results.filter(Boolean).length / results.length;

// Overall accuracy must stay above threshold
expect(accuracy).toBeGreaterThanOrEqual(0.85);
```

This catches: prompt regressions, model downgrades, guideline changes that break accuracy. This is the closest thing to a "unit test" for AI — it tells you whether the system is getting the right answers often enough.

#### 7. Regression Snapshot Assertions

Store a baseline result and assert that future runs don't deviate beyond a threshold. Useful for catching prompt regressions without maintaining a full golden set.

```typescript
const baseline = loadBaseline("sentiment-baseline.json"); // { accuracy: 0.92, p50Confidence: 0.87 }
const current = await runBenchmark();

// Accuracy must not drop more than 5% from baseline
expect(current.accuracy).toBeGreaterThanOrEqual(baseline.accuracy - 0.05);

// Median confidence must not collapse
expect(current.p50Confidence).toBeGreaterThanOrEqual(baseline.p50Confidence - 0.1);
```

This catches: silent regressions when prompts, models, or guidelines change.

### What to Test at Each Layer

| Layer | What you assert | Tooling |
|-------|----------------|--------|
| Unit (no AI call) | Prompt template builds correctly, response parser handles edge cases, confidence math is correct | Vitest, mocked responses |
| Integration (real AI call) | Schema/shape, range/bounds, containment, enum constraints | Vitest + axios, real endpoint |
| Benchmark (golden set) | Aggregate accuracy above threshold, per-category accuracy, regression detection | Vitest or standalone script, fixtures |
| Consistency (multi-run) | Same input → stable output, low variance in scores | Vitest, repeated calls |

### Golden Set Management

The golden set is the foundation of AI quality testing. It needs to be:

- **Curated by humans** — not generated by the AI itself
- **Representative** — covers common cases, edge cases, and known failure modes
- **Versioned** — lives in the repo alongside the code
- **Small enough to run in CI** — 20–50 cases for fast feedback, larger sets for nightly runs
- **Updated when requirements change** — if the expected output changes, the golden set must change too

```
tests/ai/
├── fixtures/
│   ├── golden-set.json          # Curated input/expected-output pairs
│   └── edge-cases.json          # Known tricky inputs
├── ai-service.test.ts           # Schema, range, containment assertions
├── benchmark.test.ts            # Golden set accuracy threshold
├── consistency.test.ts          # Multi-run stability checks
└── vitest.config.mts
```

### CI Strategy for AI Tests

AI tests are slower and more expensive than regular tests (real model calls cost money and take seconds). Structure CI accordingly:

| Trigger | What runs | Why |
|---------|----------|-----|
| Every push | Schema + range + containment tests (mocked or single call) | Fast, cheap, catches structural breaks |
| PR merge | Small golden set (20–50 cases) | Catches accuracy regressions before main |
| Nightly / on-demand | Full benchmark (hundreds of cases) + consistency tests | Comprehensive accuracy tracking, too slow/expensive for every push |

### Accuracy Thresholds as Quality Gates

The benchmark becomes a CI gate when you set a threshold:

```yaml
# In CI pipeline
- name: Run AI benchmark
  run: npm run test:ai:benchmark
  env:
    ACCURACY_THRESHOLD: 0.85
```

If accuracy drops below the threshold, the pipeline fails. This is the AI equivalent of a test suite going red — something changed that made the system worse.

Choosing the threshold:
- Start with whatever accuracy you measure on the first run — that's your baseline
- Ratchet it up as you improve prompts/models
- Different categories may need different thresholds (easy cases should be near 100%, ambiguous cases might be 70%)
- Track the trend over time, not just pass/fail

### Phase 6–7 Build Plan

Phase 6 introduces the AI service. Phase 7 adds the testing guardrails.

**Phase 6: AI Service**
- Add a new service (e.g. `service-c`) that wraps an LLM API (Ollama, or any model provider)
- Simple use case: takes text input, returns a structured classification or summary
- Deploy to the Kind cluster alongside existing services
- Service A can call it as a downstream dependency (same pattern as Service B)

**Phase 7: AI Quality Guardrails**
- Add `tests/ai/` with the assertion patterns above
- Build a small golden set of curated test cases
- Wire schema/range tests into the existing CI pipeline (every push)
- Add a benchmark job (nightly or on-demand) with accuracy thresholds
- Add consistency tests for flakiness detection
- Store benchmark results as JSON for regression tracking
- Add accuracy dashboard (see below)

Same principle as the rest of this project: the AI service is intentionally simple. The testing infrastructure around it is the point.

### Accuracy Dashboard

Tracking accuracy over time is more useful than just pass/fail in CI. The approach uses two layers: a permanent JSON record in the repo, and an optional live dashboard.

#### Layer 1: JSON results in git (permanent record)

Every benchmark run commits a timestamped JSON file to the repo:

```
tests/ai/
├── results/
│   ├── 2025-07-15T10-30-00.json
│   ├── 2025-07-16T10-30-00.json
│   └── ...
```

Each file contains the run's metrics:

```json
{
  "timestamp": "2025-07-15T10:30:00Z",
  "accuracy": 0.87,
  "p50Confidence": 0.82,
  "p90Confidence": 0.91,
  "totalCases": 50,
  "correct": 43,
  "model": "llama3.2:1b",
  "commitSha": "abc123"
}
```

This is the source of truth. It lives in git, costs nothing, has unlimited retention, and can regenerate any dashboard at any time.

CI commits the result after each benchmark run:

```yaml
- name: Run AI benchmark
  run: npm run test:ai:benchmark

- name: Commit benchmark result
  run: |
    git add tests/ai/results/
    git commit -m "chore: benchmark result $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    git push
```

#### Layer 2: Static HTML dashboard (GitHub Pages)

A single HTML file reads the JSON results and renders charts using Chart.js. Published to GitHub Pages — zero infrastructure.

```
tests/ai/
├── results/              # JSON files committed by CI
└── dashboard/
    └── index.html        # Reads results/*.json, renders accuracy over time
```

The dashboard shows:
- Accuracy trend over time (line chart)
- Confidence percentile trends (p50, p90)
- Per-run details on hover (commit SHA, model, case count)
- Threshold line (visual indicator of the quality gate)

This is enough for a learning project and most small teams.

#### Layer 3: Grafana Cloud (optional upgrade)

[Grafana Cloud free tier](https://grafana.com) gives you 10,000 Prometheus metrics series, 50GB logs, 14-day retention, 3 users. For a handful of benchmark metrics, you'll use <1% of the limit.

The benchmark job pushes metrics to Grafana's Prometheus remote write endpoint after each run. This gives you proper time-series graphs, alerting, and annotations.

The 14-day retention limit doesn't matter — the JSON files in git are the permanent record. If you need to look back 6 months, regenerate the dashboard from the JSON history. Grafana is the live view, git is the archive.

#### Progression

| Stage | What | When |
|-------|------|------|
| JSON in git | Commit result after each benchmark run | Phase 7 — start here |
| Static HTML + GitHub Pages | Chart.js dashboard reading JSON files | Phase 7 — once you have a few runs |
| Grafana Cloud | Live dashboard with alerting | When you want real-time monitoring or alerting |

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
