# Platform Quality Lab — Project Rules

## Project Purpose
This is a learning project for SDET/platform quality engineering skills, mapped to an AI infrastructure-style role. The goal is to build a microservices system, deploy it on Kubernetes, break it intentionally, and encode learnings into CI guardrails.

## Project Mindset
Treat this project as if it's a real service running in a large organisation. Use production-grade tooling, patterns, and practices — even if the services themselves are simple. The services are intentionally trivial because the focus is on the platform, pipeline, and quality engineering around them — not the business logic. Never dismiss a tool or pattern as "overkill" — if it's used in real orgs, it belongs here.

## Tech Stack
- Language: TypeScript / Node.js (Express)
- Container: Docker (multi-stage builds, non-root user)
- Orchestration: Kind (Kubernetes in Docker) for local clusters
- CI: GitHub Actions

## Architecture
- **Service A** (port 3000): Receives requests, calls Service B at `/info` via `SERVICE_B_URL` env var
- **Service B** (port 3001): Returns data, simulates a downstream dependency
- Both have `/health` endpoints for K8s probes
- K8s manifests live in `k8s/` with readiness/liveness probes and resource limits

## Phased Plan
- **Phase 1** ✅ Scaffold — monorepo, both services, Dockerfiles, K8s manifests, Kind config
- **Phase 2** ✅ Local cluster + deploy — Kind cluster, metrics-server, build/load images, deploy, verify service-to-service comms
- **Phase 3** ✅ CI pipeline — GitHub Actions (lint, config validation, contract checks, integration tests)
- **Phase 4** ✅ Failure injection — pod kills, resource pressure, dependency failure, latency injection
- **Phase 5** Guardrails — CI gates, chaos reporting with diagnostics, manifest validation, contract testing, code quality
  - ✅ Contract testing (Pact) — consumer/provider tests, PactFlow Broker, can-i-deploy gate in CI
  - Manifest validation, chaos CI gates, code quality gates — remaining
- **Phase 6** AI service — add a new service wrapping an LLM API, deploy to Kind, wire into service mesh
- **Phase 7** AI quality guardrails — non-deterministic assertion patterns, golden set benchmarks, accuracy thresholds as CI gates, consistency tests

## Coding Style
- Clean, production-style code — use real tools and patterns as large orgs would
- Keep services simple Express apps — the services are simple on purpose, the infrastructure around them is not
- K8s manifests should always include: resource limits, readiness probes, liveness probes
- Dockerfiles: multi-stage, alpine base, non-root user
- No privileged containers

## Dev Commands
- `npm run dev` — starts both services + opens browser to test
- `npm run stop` — kills both services
- `./scripts/deploy-local.sh` — full local Kind deploy (create cluster, build, load, deploy, verify)
- `kind delete cluster --name platform-lab` — tear down local cluster

## Chaos / Failure Injection Commands
Prerequisites: Docker running + Kind cluster deployed (`./scripts/deploy-local.sh`)
- `./scripts/chaos/pod-kill.sh <service>` — kill a pod, verify service stays up and K8s self-heals
- `./scripts/chaos/resource-pressure.sh <service> <cpu|mem|all>` — inject CPU/memory stress via sidecar, observe throttling and OOMKills
- `./scripts/chaos/dependency-failure.sh [upstream] [downstream]` — kill downstream, verify upstream degrades gracefully
- `./scripts/chaos/latency-injection.sh` — inject latency into downstream, verify upstream timeout behaviour

## Key Decisions
- 2 replicas per service in K8s — enables testing rolling restarts and availability
- Resource limits intentionally tight (50m/64Mi req, 200m/128Mi limit) — to trigger pressure in Phase 4
- Service A has separate liveness (`/health`) and readiness (`/ready`) probes — readiness checks Service B dependency with 2s timeout
- Service B uses `/health` for both probes — it has no downstream dependencies
- All outbound HTTP calls must have timeouts — learned from Phase 4 Step 3 (fetch without timeout hangs instead of failing)
- Service B URL injected via env var in K8s manifest, resolved via K8s DNS
- `imagePullPolicy: Never` in manifests — Kind uses pre-loaded images, not a registry
- metrics-server installed with `--kubelet-insecure-tls` flag (required for Kind, no real TLS between nodes)
- Deploy order: Service B first, then A — A depends on B for `/data` endpoint
- VPN blocks GitHub downloads and image pulls inside Kind nodes — workaround: bundle manifests locally (`k8s/vendor/`), `docker pull` on host then `kind load` into cluster
- metrics-server manifest bundled at `k8s/vendor/metrics-server.yaml` with `--kubelet-insecure-tls` baked in — no network dependency at deploy time
- `--kubelet-insecure-tls` is safe in Kind — it only skips TLS between fake nodes inside Docker's internal network, never touches the real network. Required because Kind nodes don't have real TLS certs
- `imagePullPolicy: Never` is safe in Kind — images are pre-loaded via `kind load`, no registry involved. In a real cluster (EKS/GKE) you'd use a container registry instead

## Phase 4 Chaos Experiments
All chaos scripts live in `scripts/chaos/`. They require a running Kind cluster with services deployed.
- **Pod Kill** (`pod-kill.sh`) — deletes a pod, asserts service stays reachable via surviving replica, waits for K8s to restore full replica count
- **Resource Pressure** (`resource-pressure.sh`) — injects a stress-ng sidecar into the pod (no production code changes), tests CPU throttling and OOMKill behaviour
- **Dependency Failure** (`dependency-failure.sh`) — scales downstream to 0, asserts upstream degrades gracefully (502 not hang), readiness removes it from load balancer, recovery is automatic
- **Latency Injection** (`latency-injection.sh`) — deploys a slow server, points upstream at it, verifies timeout behaviour (under/over threshold)

See [CHAOS.md](CHAOS.md) for full experiment log, learnings, and Phase 5 guardrail implications.

## Pact Contract Testing

### Architecture
- **Service A** is the consumer — calls Service B's `/info` endpoint
- **Service B** is the provider — serves `/info`, verified against consumer pacts
- **PactFlow** is the persistent Broker — stores pacts, verification results, deployment history
- Consumer tests generate pact files locally, publish to PactFlow in CI only
- Provider verification runs against PactFlow, publishes results in CI
- `can-i-deploy` gates deployment after verification passes

### Broker
- PactFlow (SaaS) for persistent history across pipeline runs (30-day free trial, paid after)
- After trial: switch to self-hosted (Docker Compose, K8s, or any cloud with Postgres) — same scripts, change URL + auth method (token → username/password)
- Alternatives: Docker Compose (self-hosted), K8s manifests (reference in `k8s/`), any cloud with Postgres
- Credentials stored in `.env` locally, GitHub Secrets in CI (`PACT_BROKER_BASE_URL`, `PACT_BROKER_TOKEN`)
- Token auth (PactFlow) — not username/password

### Environments
- `dev` — branch builds (feature branches, PRs)
- `prod` — main branch deployments
- Registered on PactFlow via `./scripts/deploy-pact-broker.sh` (one-time)

### Commands
- `npm run test:pact` — run consumer tests locally (generates pact files, does NOT publish)
- `npm run test:pact:verify` — run provider verification locally (verifies against PactFlow)
- `./scripts/deploy-pact-broker.sh` — register environments on PactFlow (one-time)
- `./scripts/pact/initialise-provider.sh <name>` — register a provider on PactFlow (one-time per provider)
- `./scripts/pact/publish.sh` — CI only: publish pacts to PactFlow
- `./scripts/pact/can-i-deploy.sh` — CI only: check compatibility + record deployment

### Key Decisions
- PactFlow over self-hosted — persistent history, zero infrastructure, `can-i-deploy` works across pipeline runs
- Token auth — PactFlow uses API tokens, not username/password
- Publish only in CI — `publish.sh` blocks locally to prevent dirty/untraceable versions
- Never publish pacts, record deployments, or run can-i-deploy locally — only `initialise-provider.sh` runs locally as a one-time setup. Everything else goes through the pipeline
- `failIfNoPactsFound: false` — provider pipeline passes before any consumer publishes (avoids chicken-and-egg)
- `enablePending: true` — new pacts don't break the provider until verified
- Monorepo `can-i-deploy` checks both services at the same commit version (production multi-repo pattern documented in comments)
- Future improvement: split consumer and provider into separate repos to mirror production multi-repo Pact workflow (see `06-repo-separation.md`)
- Webhooks not needed in monorepo — add when splitting repos (webhook triggers provider verification when consumer publishes a new pact)
- Service B exports `app` with guarded `listen()` — allows `http.createServer(app)` in verification test (matches production thin-server pattern)
- Separate vitest configs for consumer (`vitest.pact-consumer.config.mts`) and provider (`vitest.pact.config.mts`) — 30s timeout, no coverage

### Pact Documentation
Full documentation in `docs/pact/`:
- `00-big-picture.md` — how all pieces fit together
- `01-consumer-guide.md` — writing consumer pact tests
- `02-provider-verification.md` — provider verification patterns
- `03-provider-initialisation.md` — one-time provider setup
- `04-broker-ops.md` — Broker operations, CLI installation, credentials
- `05-ci-cd-patterns.md` — CI/CD pipeline patterns
- `06-repo-separation.md` — monorepo vs multi-repo mapping
- `07-adoption-at-scale.md` — strategies for large org adoption
- `08-adoption-plan.md` — step-by-step plan from zero to working Pact

## Phase 5 Plan
Phase 5 takes the learnings from Phase 4 chaos experiments and encodes them as automated CI guardrails.
Phase 5 is large — split into feature branches:
- `phase5/manifest-validation` ✅ — CI gate that parses K8s YAML and asserts: replicas ≥ 2, resource limits set, readiness ≠ liveness for services with dependencies
- `phase5/chaos-reporting` — structured reports from chaos scripts with diagnostics that point at specific code/config when failures occur (file, line, what's missing)
- `phase5/chaos-ci-gates` — run chaos scripts after deploy in CI, fail the pipeline if services don't survive
- `phase5/code-quality-gates` — lint/review rules for outbound HTTP timeouts, error handling patterns
- `phase5/contract-testing` ✅ — Pact consumer-driven contract tests between Service A and B, PactFlow Broker, can-i-deploy CI gate
- `phase5/notifications-dashboard` — Slack/webhook alerts on guardrail failures + visibility dashboard

## Package Extraction Plan
All quality tooling in `scripts/` is structured for future extraction into a shared npm package published to GitHub Packages.
- **Not yet** — only one tool (manifest validation) exists. Packaging a single module is premature
- **After Phase 5** — 2–3 tools (manifest validation, chaos reporting, code quality). Shape is becoming clear but still evolving
- **After Phase 7** — 4+ tools (add AI assertions, golden sets). This is the extraction point
- **Package name:** `@joxkalna/platform-quality-utils` (scoped to GitHub username, private on GitHub Packages)
- **Pattern:** Multi-entry package with `exports` map — consumers cherry-pick what they need (`/manifest-validation`, `/chaos`, `/ai-assertions`)
- **Structure:** Extract to `packages/platform-quality-utils/` in this repo. Orchestrators in `scripts/` import from the package. Other projects in `development/` install via npm
- **Signal to extract:** When you find yourself copying code from this repo into another project
- See `docs/manifest-validation.md` → "Publishing Plan — GitHub Packages" for full details

## Phase 2 Resource Baseline
- Idle CPU: 1-13m per pod (limit: 200m)
- Idle memory: 11-15Mi per pod (limit: 128Mi)
- Significant headroom — Phase 4 will push toward limits to trigger throttling/OOMKills
