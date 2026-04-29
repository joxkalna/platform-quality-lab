# Project Reference — Phases 1–5

Historical implementation details, architecture decisions, and learnings from Phases 1–5. The project rules file keeps only current decisions and pointers.

---

## Phase 2 Resource Baseline
- Idle CPU: 1-13m per pod (limit: 200m)
- Idle memory: 11-15Mi per pod (limit: 128Mi)
- Significant headroom — Phase 4 pushed toward limits to trigger throttling/OOMKills

---

## Phase 4 Chaos Experiments

All chaos scripts live in `scripts/chaos/`. They require a running Kind cluster with services deployed.

- **Pod Kill** (`pod-kill.sh`) — deletes a pod, asserts service stays reachable via surviving replica, waits for K8s to restore full replica count
- **Resource Pressure** (`resource-pressure.sh`) — injects a stress-ng sidecar into the pod (no production code changes), tests CPU throttling and OOMKill behaviour
- **Dependency Failure** (`dependency-failure.sh`) — scales downstream to 0, asserts upstream degrades gracefully (502 not hang), readiness removes it from load balancer, recovery is automatic
- **Latency Injection** (`latency-injection.sh`) — deploys a slow server, points upstream at it, verifies timeout behaviour (under/over threshold)

See `docs/testing/chaos-log.md` for full experiment log, learnings, and Phase 5 guardrail implications.

---

## Phase 5 Guardrails

### Contract Testing (Pact)
- Consumer-driven contract tests between Service A → B and A → C
- PactFlow Broker for persistent history
- `can-i-deploy` gate in CI per environment (dev → qa → prod)

### Manifest Validation
- CI gate that parses K8s YAML and asserts: replicas ≥ 2, resource limits set, readiness ≠ liveness for services with dependencies
- Custom rules in `scripts/manifest-validation/rules/`

### Chaos Reporting
- Structured JSON reports with diagnostics from chaos scripts
- Crash-safe trap, GitHub Actions summary rendering

### Chaos CI Gates
- All 4 experiments run in CI on main, fail pipeline if services don't survive
- Cleanup traps, artifact upload

### Code Quality Gates
- Custom ESLint rules: `fetch-requires-timeout`, `fetch-requires-error-handling`
- Understands utility functions that throw (won't false-positive on wrapped calls)

---

## Pact Contract Testing — Full Architecture

### Architecture
- **Service A** is the consumer — calls Service B's `/info` and Service C's `/classify`
- **Service B** is the provider — serves `/info`, verified against consumer pacts
- **Service C** is the provider — serves `/classify`, verified against consumer pacts
- **PactFlow** is the persistent Broker — stores pacts, verification results, deployment history
- Consumer tests generate pact files locally, publish to PactFlow in CI only
- Provider verification runs against PactFlow, publishes results in CI
- `can-i-deploy` and `record-deployment` are embedded inside each deploy stage
- `record-deployment` only runs on main — never from feature branches
- Feature branches: test + publish + verify only

### Broker
- PactFlow (SaaS) for persistent history (30-day free trial, paid after)
- After trial: switch to self-hosted (Docker Compose, K8s, or any cloud with Postgres)
- Credentials: `.env` locally, GitHub Secrets in CI (`PACT_BROKER_BASE_URL`, `PACT_BROKER_TOKEN`)
- Token auth (PactFlow) — not username/password

### Environments
- `dev` — first deploy target on main
- `qa` — second deploy target on main
- `prod` — final deploy target on main
- Feature branches do NOT record deployments to any environment
- Registered on PactFlow via `./scripts/deploy-pact-broker.sh` (one-time)

### Key Decisions
- PactFlow over self-hosted — persistent history, zero infrastructure
- Publish only in CI — `publish.sh` blocks locally
- `failIfNoPactsFound: false` — provider passes before any consumer publishes
- `enablePending: true` — new pacts don't break provider until verified
- Monorepo `can-i-deploy` uses `--to-environment` per service per environment
- Webhooks not needed in monorepo — add when splitting repos
- Service B exports `app` with guarded `listen()` for verification tests
- Separate vitest configs for consumer and provider (30s timeout, no coverage)

### What Went Wrong (Learning Log)
- `learning-break-pact` branch ran `record-deployment` from a feature branch, polluting PactFlow
- When reverted, provider verification still pulled old deployed pact via `deployedOrReleased` selector
- Fix required `[skip pact]` to merge, then `if: false` to disable pact entirely
- Broker state had to be cleaned up before re-enabling
- `record-deployment` was run from terminal as one-time bootstrap — wrong in principle but needed
- `initialise-provider.sh` was incorrectly modified for PactFlow — reverted (script is reusable)
- `[skip pact]` in commit messages doesn't work on PR merges — replaced with `PACT_ENABLED` variable

---

## Infrastructure Decisions

- `imagePullPolicy: Never` — Kind uses pre-loaded images, not a registry
- metrics-server installed with `--kubelet-insecure-tls` (required for Kind, safe — only skips TLS between fake nodes inside Docker)
- metrics-server manifest bundled at `k8s/vendor/metrics-server.yaml` — no network dependency at deploy time
- VPN blocks GitHub downloads inside Kind nodes — workaround: bundle manifests locally, `docker pull` on host then `kind load`
- Deploy order: Service B first, then A (A depends on B for `/data`)
- Service A has separate liveness (`/health`) and readiness (`/ready`) probes — readiness checks Service B with 2s timeout
- Service B uses `/health` for both probes — no downstream dependencies

---

## Package Extraction Plan

All quality tooling in `scripts/` structured for future extraction into a shared npm package.

- **Extraction point:** After Phase 7 (4+ tools: manifest validation, chaos, code quality, AI assertions)
- **Package name:** `@joxkalna/platform-quality-utils`
- **Pattern:** Multi-entry package with `exports` map (`/manifest-validation`, `/chaos`, `/ai-assertions`)
- **Structure:** Extract to `packages/platform-quality-utils/` in this repo
- **Signal to extract:** When copying code from this repo into another project
