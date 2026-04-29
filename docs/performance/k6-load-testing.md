# k6 Load Testing — Plan & Implementation Guide

Phase 6 load testing for platform-quality-lab. k6 tests the infrastructure's ability to handle traffic — can the pods, services, DNS, and K8s networking serve requests at the expected rate?

This document covers the full plan, broken into incremental MRs that build on each other.

---

## What k6 Tests vs What Chaos Tests

k6 and chaos experiments answer different questions:

| | k6 (load testing) | Chaos (failure injection) |
|---|---|---|
| **Question** | Can the infrastructure handle this traffic? | What happens when things break? |
| **Method** | Increase traffic, measure throughput/latency/errors | Inject a specific failure, observe behaviour |
| **Finds** | Bottlenecks, latency regressions, infrastructure limits | Recovery behaviour, timeout correctness, graceful degradation |
| **Scope** | Services A and B (HTTP endpoints, service-to-service) | All services including C (resource pressure, dependency failure, timeouts) |

### Why Service C is excluded from load testing

Service C runs Ollama with llama3.2:1b in Kind — a tiny model on constrained resources (200m CPU, 128Mi memory). Load testing it would just prove that a tiny LLM on tight limits is slow, which we already know.

The interesting questions about Service C under pressure — OOMKills, timeout behaviour, concurrent request queuing — are already answered by chaos experiments (resource pressure, dependency failure, latency injection).

Service C load testing becomes valuable when there's a real LLM backend worth profiling (GPU, autoscaling, cost/performance curves, prompt caching). That's not this project.

k6 still has a `/classify` request function for smoke tests (verify the endpoint works), but load and stress profiles focus on Services A and B.

### Infrastructure isolation — what k6 reveals

Testing each service independently isolates where bottlenecks live:

| Scenario | What it isolates |
|----------|------------------|
| Service B alone (`/health`, `/info`) | Raw throughput of the simplest service — baseline for the infrastructure |
| Service A alone (`/health`) | Same, but with the Express proxy layer |
| Service A → B chain (`/data`) | Service-to-service hop — K8s DNS resolution, networking, proxy overhead |

If Service A → B is slow but Service B alone is fast, the problem is in the networking/DNS layer, not the service code. That's infrastructure insight you can't get from chaos.

---

## Why k6

- Native TypeScript support (k6 v1.x runs `.ts` files directly)
- External JSON load profiles — swap profiles without changing test code
- `handleSummary` hook for custom output (JSON, HTML, JUnit)
- Built-in `check` assertions with tagged metrics
- Built-in `group()` for logically grouping requests and getting aggregated metrics
- Built-in scenarios with executors (constant rate, ramping, shared iterations)
- Runs locally and in CI with the same scripts
- Well-documented, large community, used widely in production orgs

## Architecture

```
tests/load/
├── src/
│   ├── config/                    # Load profiles (JSON)
│   │   ├── local-test.json        # Single iteration, debug
│   │   ├── smoke-test.json        # Low rate, validate scripts work
│   │   ├── regression-test.json   # Branch feedback (~3.5 min)
│   │   ├── load-test.json         # Sustained load at expected levels
│   │   └── stress-test.json       # Push beyond limits, find breaking points
│   ├── requests/                  # Single HTTP calls with check assertions
│   │   ├── service-a-api.ts       # /health, /ready, /data
│   │   └── service-b-api.ts       # /health, /info
│   ├── flows/                     # Reusable groups of requests (k6 group() for aggregated metrics)
│   │   ├── health-checks.ts       # Hit /health on all services
│   │   └── data-flow.ts           # Service A → B chain
│   ├── scenarios/                 # User journeys — exported as k6 scenario functions
│   │   ├── health-check-scn.ts    # Isolated baseline — health endpoints only
│   │   ├── data-flow-scn.ts       # Isolated — A → B data flow only
│   │   └── full-journey-scn.ts    # Chained — health checks then data flow
│   ├── utils/
│   │   ├── logger.ts              # Debug/info logger (controlled by __ENV.DEBUG)
│   │   ├── request-params.ts      # Shared request params (headers, tags, timeout)
│   │   ├── handle-summary.ts      # handleSummary — JSON + text output
│   │   └── k6-libs.d.ts           # Type declarations for remote URL imports
│   ├── index.ts                   # k6 entrypoint — setup, scenario exports, handleSummary
│   └── types.ts                   # Shared types (TestConfig, Endpoint)
├── scripts/
│   └── compare-summary.ts         # Regression analysis (compare current vs baseline)
├── results/                       # k6 output (gitignored, uploaded as CI artifact)
├── tsconfig.json                  # TypeScript config (noEmit, allowImportingTsExtensions)
└── package.json                   # @types/k6 only — no build dependencies
```

### 3-Layer Separation

The framework uses a 3-layer separation to keep tests maintainable as the number of services and endpoints grows:

| Layer | Directory | What it does | Example |
|-------|-----------|-------------|---------|
| Requests | `requests/` | Single HTTP call + `check` assertion | `GET /health` → assert status 200 |
| Flows | `flows/` | Reusable groups of requests, shared across scenarios | "check all health endpoints" = hit A + B health |
| Scenarios | `scenarios/` | User journeys — the functions k6 executes | "health check all → fetch data → verify" |

**Why this separation:**

k6's built-in concepts are **scenarios** (executors, VUs, thresholds — defined in JSON config) and **groups** (`group()` function for aggregated metrics). k6 doesn't prescribe how to organise your code beyond that.

The 3-layer separation is our own code organisation choice, not a k6 concept:

- **Requests** — one function per HTTP call. Each function calls `http.get`/`http.post`, runs `check()` assertions, and tags metrics. This is the atomic unit. Reusable across any flow or scenario.
- **Flows** — extracted functions that compose multiple requests into a reusable step. When two scenarios share the same sequence of requests (e.g. "hit all health endpoints"), the shared logic lives here instead of being duplicated. Uses k6's `group()` to get aggregated metrics per flow. This layer exists purely to avoid duplication — if every scenario is unique, you don't need it.
- **Scenarios** — the functions k6 actually executes. Each scenario composes flows (or calls requests directly for simple cases). The JSON config maps scenario names to these functions via `exec`.

The key insight: requests are reused across flows, flows are reused across scenarios. Without this separation, adding a new scenario that shares steps with an existing one means copy-pasting request code. With it, you compose from existing pieces.

With only 2 services under load test, the flows layer may feel thin initially. It earns its place when scenarios grow (e.g. a future scenario that checks health, fetches data, then checks health again — reusing the health-check flow).

Load profiles (thresholds, VU counts, durations) live in external JSON configs — completely separate from the test code.

## Reusable k6 Patterns

This section documents reusable patterns for k6 load testing and how they map to this project. The goal is to use real patterns — not toy examples — while adapting for the constraints of a Kind cluster and GitHub Actions.

### Take directly

| Pattern | What it is | Why it works here |
|---------|-----------|------------------|
| Native k6 TypeScript | k6 v1.x runs `.ts` files directly, no build step | Simpler than webpack, fewer moving parts, same type safety via `@types/k6` |
| External JSON load profiles | Thresholds, VU counts, durations in JSON — separate from test code | Swap profiles without changing code |
| Logger utility | `__ENV.DEBUG` flag controls debug/info output | Clean, no dependencies, works in k6 runtime |
| Request params helper | Shared function for headers, transaction tags, timeout defaults | Avoids duplication across request functions |
| handleSummary | JSON + text output from k6's summary hook | Standard output format, CI-friendly |
| Regression analysis script | TypeScript script comparing two `summary.json` files, exits non-zero on threshold breach | Production pattern for CI gates |
| Transaction tagging | Every request tagged with a transaction name for per-endpoint metrics | Enables per-scenario and per-endpoint thresholds in JSON config |
| `group()` in flows | Wraps related requests for aggregated `group_duration` metrics | Business-level latency visibility alongside per-request detail |

### Adapt for this project

| Production pattern | This project's adaptation | Why |
|-------------------|--------------------------|-----|
| Metrics streaming output | GitHub Actions artifacts + step summary | No metrics platform — use zero-infrastructure approach |
| Metrics agent sidecar in CI | Not needed | Metrics stay in summary.json, not streamed |
| Slack bot SDK with dashboard graphs | Simple webhook POST | No monitoring platform to link to — plain text alerts |
| CI platform API artifact download | `actions/download-artifact` | Different CI platform, simpler API |
| "Transactions" layer naming | "Flows" layer | Avoids confusion with k6's own `group()` concept |
| CSV test data with `SharedArray` | Not needed initially | Services return static data — no parameterisation needed. Add when `/classify` gets varied inputs |
| Environment-specific `.env` files | Single `.env` with `BASE_URL` | One environment (Kind cluster), not dev/qa/preprod |

### Skip entirely

| Production pattern | Why it doesn't apply |
|-------------------|---------------------|
| Monitoring platform dashboard graph configs | No metrics platform — deferred to post Phase 7 |
| Internal shared packages (coding standards, Slack bots) | Project-specific, not reusable across orgs |
| CI platform-specific artifact scraping scripts | GitHub Actions has native artifact support |
| Multi-environment test execution (dev/qa/preprod) | Single Kind cluster — one environment |

### Compute test pattern (added to MR 2)

A common approach is to run the same test profile against **two targets in parallel** — the branch deployment and the main/baseline deployment — then compare results directly. This is more rigorous than comparing against a stored baseline because both runs execute under identical CI conditions (same machine, same network, same time).

In this project's Kind cluster, we can't run two deployments simultaneously. Instead, the adaptation is:

1. On main: run load test, store `summary.json` as artifact + update committed baseline
2. On feature branches: run load test, download main's latest artifact, compare
3. If no previous artifact exists (first run), skip comparison with a warning

This gives branch-vs-main comparison without needing parallel deployments. The committed baseline (`tests/load/baseline.json`) serves as the permanent record — artifacts are the live comparison.

### JUnit output

k6 frameworks commonly output JUnit XML for CI test reporting. k6 supports this via the `k6-junit` package in `handleSummary`. GitHub Actions can display JUnit results with third-party actions. Worth adding in MR 1 — low effort, high visibility.

---

## Build Tooling: Native TypeScript

k6 v1.x runs TypeScript files directly — no build step needed. This replaces the webpack + babel approach that was the standard before native TS support matured.

**What this means:**
- `k6 run src/index.ts` just works
- No webpack config, no babel config, no build step
- `package.json` only needs `@types/k6` for IDE autocomplete
- Local imports require explicit `.ts` extensions (`import { info } from "./logger.ts"`)
- `tsconfig.json` needs `allowImportingTsExtensions: true` and `noEmit: true`
- Remote URL imports (e.g. `https://jslib.k6.io/...`) need a `.d.ts` file for type declarations

**Trade-off vs webpack:**
- Native TS can't bundle npm packages (e.g. `k6-junit` for JUnit output) — only k6 built-in modules and remote URL imports work
- If JUnit/HTML reports are needed later, either use remote URL versions or add webpack back
- For this project, JSON + text output from `handleSummary` is sufficient

## Load Profiles

All profiles live in `tests/load/src/config/`. See the JSON files directly for current values.

| Profile | File | Duration | Purpose |
|---------|------|----------|---------|
| Local | `local-test.json` | 1 iteration | Debug — verify scripts work |
| Smoke | `smoke-test.json` | 30s | Correctness gate — endpoints alive? |
| Regression | `regression-test.json` | ~3.5 min | Branch feedback — detect regressions |
| Load | `load-test.json` | 5 min | Main baseline — sustained traffic |
| Stress | `stress-test.json` | 6 min | Breaking points — manual only |

## Regression Analysis

TypeScript script that compares two `summary.json` files and fails if any metric exceeds a threshold.

**Metrics compared:**
- `http_reqs.rate` — throughput (req/s). Drop > 10% = regression
- `http_req_duration.p(90)` — latency. Increase > 10% = regression
- `http_req_failed.rate` — error rate. Increase > 10% = regression

**How it works:**
1. k6 `handleSummary` writes `summary.json` after each run
2. CI uploads `summary.json` as a GitHub Actions artifact
3. On main branch, the analysis script downloads the previous run's artifact and compares
4. If any metric exceeds the threshold, the script exits non-zero → pipeline fails

**First run bootstrap:** No previous artifact exists on the first run. The script detects this and skips comparison with a warning.

## Slack Notifications

Personal Slack workspace with Incoming Webhooks. Same pattern as production.

**Setup:**
1. Create free Slack workspace
2. Create a Slack app with Incoming Webhooks enabled
3. Add webhook to a `#load-test-alerts` channel
4. Store webhook URL as `SLACK_WEBHOOK_URL` in GitHub Secrets

**When notifications fire:**
- Load test threshold violations (regression detected)
- Stress test results summary (always — for visibility)
- Optional: smoke test failures (shouldn't happen, so worth alerting)
- Extensible to chaos experiment failures

**Message format:**
```
⚠️ Performance Regression Detected
Project: platform-quality-lab
Branch: main
Pipeline: #123

❌ http_req_duration p90: 450ms → 620ms (+37.8%)
✅ http_reqs rate: 12.5 req/s → 12.1 req/s (-3.2%)
✅ http_req_failed: 0.5% → 0.8% (+60.0%)

📊 Summary: https://github.com/.../actions/runs/...
```

Simple webhook POST — no Slack SDK, no bot framework.

## Dashboard & Long-Term Tracking

All implemented:
- `summary.json` uploaded as CI artifact after each run
- Committed baseline (`tests/load/baseline.json`) with ratchet pattern
- Slack webhook alerts on threshold violations (`scripts/notify/`)
- Trend extraction scripts (`tests/load/scripts/extract-trend.ts`, `scripts/chaos/extract-trend.ts`)
- Static HTML dashboard on GitHub Pages (`docs/dashboard/index.html`) with Chart.js
- Artifact-as-database pattern: download previous → append → re-upload
- Dashboard deployed on main only via `deploy-pages@v4`

---

## MR Breakdown

### MR 1 — Framework scaffold + smoke test ✅

Full 3-layer structure (requests → flows → scenarios), native k6 TypeScript, smoke test in CI. Established smoke baseline: p95 ~15ms, group_duration p95 ~26ms, 0% errors, 100% checks.

### MR 2 — Load + stress profiles + regression analysis ✅

Load/stress/regression profiles, `compare-summary.ts` (10% threshold gate), committed baseline (`baseline.json`), branch-vs-main artifact comparison, GitHub Actions step summary.

### MR 3 — Slack notifications + dashboard ✅

Slack webhook alerts (perf regression, chaos failure, smoke failure), reusable `scripts/notify/slack.ts`, trend extraction (perf + chaos), static HTML dashboard on GitHub Pages, artifact-as-database pattern.

---

## CI Pipeline Integration

After all 3 MRs, the pipeline looks like:

```
install → lint ──────────┐
        → typecheck ─────┤
        → validate-k8s ──┤
        → pact ───────────┴→ deploy-and-test
                               ├── BATS infra tests
                               ├── Vitest integration tests
                               ├── k6 smoke test (every push, gates)
                               ├── k6 regression test (branches, ~3.5 min, non-blocking)
                               ├── k6 load test (main, 5 min, non-blocking)
                               ├── k6 regression analysis (every push, non-blocking)
                               ├── Slack alert (on regression, MR3)
                               ├── Chaos experiments (main only, gates)
                               └── Teardown (always)
```

### Test Types and When They Run

| Profile | File | Duration | When | Blocks pipeline? | Purpose |
|---------|------|----------|------|-----------------|----------|
| Smoke | `smoke-test.json` | 30s | Every push | **Yes** | Correctness — are endpoints alive and responding correctly? |
| Regression | `regression-test.json` | ~3.5 min | Feature branches | No | Early feedback — detect performance regressions before merge |
| Load | `load-test.json` | 5 min | Main only | No | Historical data — full baseline comparison, trend over time |
| Stress | `stress-test.json` | 6 min | Manual only | No | Exploratory — find breaking points, not a CI gate |
| Local | `local-test.json` | 1 iteration | Local dev | N/A | Development — verify scripts work |

### Why This Split

- **Smoke gates the pipeline** because a broken endpoint should block deployment
- **Regression/load don't gate** because CI environments have variance — a 12% latency spike might be infrastructure noise, not a real regression. Non-blocking means you see the signal without false-positive pipeline failures
- **Regression is shorter than load** because branches get pushed frequently — 3.5 min is acceptable overhead, 5 min is not
- **Load runs on main only** because it produces the authoritative trend data. Main is the stable reference point
- **Stress is manual** because you *want* it to fail — gating on it makes no sense

### Regression Analysis

After every regression/load test, `compare-summary.ts` compares the run against `baseline.json`:

| Metric | Regression if... | Direction |
|--------|------------------|-----------|
| `http_req_duration p90` | Increases > 10% | Higher = slower = bad |
| `http_req_failed rate` | Any errors (baseline is 0%) | Any errors = bad |
| `http_reqs rate` | Drops > 10% | Lower = less throughput = bad |

The script exits non-zero on regression but `continue-on-error: true` means the pipeline continues. When MR3 adds Slack, regressions trigger an alert.

### Usage

```bash
# Local development
npm run test:load:local              # single iteration, debug
npm run test:load:smoke              # 30s smoke test
npm run test:load:regression         # 3.5 min regression test
npm run test:load:load               # 5 min full load test
npm run test:load:stress             # 6 min stress test (find breaking points)
npm run test:load:analyze            # compare results/summary.json vs baseline.json
```

### Updating the Baseline

The baseline (`tests/load/baseline.json`) is a committed file — the ratchet pattern:

1. Run a load test (locally or download CI artifact)
2. Review the numbers
3. Update `baseline.json` with the new values
4. Commit with a message explaining why (e.g. "update baseline: optimised DNS caching")

Never silently accept slower performance. If the baseline needs loosening, document why.

### Port Forwarding in CI

k6 runs on the CI host, not inside the Kind cluster. Services are only reachable inside the cluster by default. Options:

1. **kubectl port-forward** — forward each service port to localhost. Simple, but needs background processes + cleanup
2. **NodePort services** — expose services on the Kind node's ports. Requires manifest changes or patches
3. **Docker network** — Kind cluster runs in Docker, CI host can reach the Docker network gateway

The integration tests already solve this in `setup.ts` with port-forwarding. k6 will use the same approach — port-forward in a setup step, run k6 against localhost, clean up in teardown.

### k6 Installation in CI

k6 is a single binary. Install in the CI job:

```yaml
- name: Install k6
  run: |
    curl -sL https://github.com/grafana/k6/releases/download/v1.0.0/k6-v1.0.0-linux-amd64.tar.gz | tar xz
    sudo mv k6-v1.0.0-linux-amd64/k6 /usr/local/bin/k6
```

Pin the version — same principle as Kind and kubeconform.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Native TS over webpack | k6 v1.x runs `.ts` directly. No build step, no bundler config, no babel. Simpler, fewer moving parts |
| Functional style (arrow functions, no classes) | Matches k6's own API. One consistent style across the framework. k6 runtime is not class-friendly |
| Three scenario types (isolated + chained) | Isolated for baselines and bottleneck isolation, chained for realistic traffic patterns. Both are valuable |
| Separate `tests/load/` directory | Load tests are a different concern from unit/integration tests |
| Own `package.json` in `tests/load/` | Only `@types/k6` needed — no build dependencies |
| JSON load profiles | Swap profiles without changing test code — same test, different intensity |
| Smoke in CI, load on main only | Smoke is fast (30s), load is slow (5min). Every push gets smoke, main gets full load |
| Stress as manual trigger | Too slow and resource-intensive for every merge. Run on-demand or nightly |
| 10% regression threshold | Industry standard. Tight enough to catch regressions, loose enough to avoid flaky failures |
| Slack webhook over bot | Webhook is simpler, no OAuth, no bot framework. Sufficient for CI alerts |
| GitHub artifacts for baselines | Zero infrastructure, version-controlled via committed baseline file |
| Service C excluded from load profiles | LLM on constrained Kind resources — chaos experiments already cover failure behaviour. Load testing deferred to real LLM backend |
| Branch-vs-main comparison over stored-only baseline | Both runs under similar CI conditions gives more reliable comparison than a stale committed baseline alone |
| Load test on feature branches too | Early feedback — don't wait for main to discover a regression |
| `group()` in flows layer | Gives aggregated `group_duration` metrics per flow. Transaction tags on requests give per-endpoint detail. Two levels of visibility |
| `fail()` on check failure | Stops the VU iteration immediately. Don't waste time on a broken system |

## Chaos + Load Combined (Future)

The real production scenario: does the system perform under load WHILE a pod dies? This is where k6 and chaos experiments intersect.

**Pattern:**
1. Start k6 load test in background
2. While load is running, execute chaos experiment (pod kill, resource pressure)
3. k6 captures the impact — error rate spike, latency increase, recovery time
4. Assert that the impact is within acceptable bounds

This is deferred to after MR 3 — it requires both k6 and chaos to be stable in CI first. But the architecture supports it: k6 runs as a background process, chaos scripts run in the foreground, k6's `handleSummary` captures the full picture.

This is also where Service C could appear in load testing — not testing the LLM itself, but testing whether Service A's `/classify` proxy degrades gracefully when Service C is under chaos pressure while A and B are under load.

## Local Development

### Prerequisites
- k6 installed (`brew install k6`)
- Node.js (for `@types/k6` IDE support)
- Services running locally (`npm run dev`) or Kind cluster deployed

### Commands
```bash
npm run test:load:local            # single iteration, debug logging
npm run test:load:smoke            # smoke test against local services
npm run test:load:regression       # 3.5 min regression test
npm run test:load:load             # 5 min full load test
npm run test:load:stress           # stress test (find breaking points)
npm run test:load:analyze          # compare summary.json against baseline
```
