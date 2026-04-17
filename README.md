# Platform Quality Lab

A hands-on learning project for SDET/platform quality engineering — build microservices, deploy on Kubernetes, break things intentionally, and encode learnings into CI guardrails.

## What's Here

```
platform-quality-lab/
├── services/
│   ├── service-a/          # Express app (port 3000) → calls Service B
│   └── service-b/          # Express app (port 3001) → returns data
├── k8s/
│   ├── service-a.yaml      # Deployment + Service (2 replicas, probes, resource limits)
│   ├── service-b.yaml      # Deployment + Service (2 replicas, probes, resource limits)
│   ├── pact-broker.yaml    # Reference: Pact Broker K8s manifest (not used — see PactFlow)
│   ├── postgres.yaml       # Reference: Postgres K8s manifest (not used — see PactFlow)
│   └── vendor/
│       └── metrics-server.yaml  # Bundled metrics-server (avoids GitHub download at deploy)
├── tests/
│   ├── infrastructure/     # BATS — K8s deploy verification (pods, DNS, connectivity)
│   ├── integration/        # Vitest + axios — service endpoint tests (HTTP assertions)
│   └── pact/               # Pact contract tests
│       ├── consumer/       # Service A's consumer pact test
│       ├── provider/       # Service B's provider verification test
│       └── set-env-vars.ts # Git SHA/branch + .env loader for tests
├── scripts/
│   ├── deploy-local.sh     # Full local Kind deploy (create, build, load, deploy)
│   ├── deploy-pact-broker.sh  # Register environments on PactFlow
│   ├── pact/
│   │   ├── initialise-provider.sh  # One-time: register provider on PactFlow
│   │   ├── publish.sh              # CI only: publish pacts to PactFlow
│   │   └── can-i-deploy.sh         # CI only: gate deployment + record
│   └── chaos/              # Failure injection scripts (Phase 4)
│       ├── pod-kill.sh     # Kill a pod, verify resilience + self-healing
│       ├── resource-pressure.sh  # CPU/memory stress via sidecar
│       ├── dependency-failure.sh  # Kill downstream, observe upstream
│       └── latency-injection.sh  # Slow downstream, test timeouts
├── docs/pact/              # Pact documentation (big picture, guides, adoption plan)
├── kind-config.yaml        # Kind cluster: 1 control-plane + 2 workers
└── .github/workflows/
    └── ci.yml              # CI pipeline (lint, typecheck, K8s validate, pact, deploy, test)
```

## Quick Start

```bash
npm install
cd services/service-a && npm install && cd ../..
cd services/service-b && npm install && cd ../..

# Run both services + open browser
npm run dev

# Stop
npm run stop
```

### Kubernetes (Kind)

Everything runs inside Docker containers via Kind — nothing touches your host beyond Docker itself. When you delete the cluster, it's all gone.

```bash
# Full deploy (create cluster, build images, deploy, verify)
./scripts/deploy-local.sh

# Tear down
kind delete cluster --name platform-lab
```

**Kind-specific workarounds** (safe, sandboxed to Docker's internal network):
- `imagePullPolicy: Never` — images are pre-loaded via `kind load`, no registry involved. In a real cluster (EKS/GKE) you'd use a container registry.
- `--kubelet-insecure-tls` on metrics-server — skips TLS between fake Kind nodes. Required because Kind nodes don't have real TLS certs. Only affects traffic inside Docker, never your real network.
- Third-party manifests bundled in `k8s/vendor/` — avoids downloading from GitHub at deploy time (blocked by VPN).

### Contract Testing (Pact)

Contract tests verify Service A and Service B agree on their API contract. Pacts are published to a persistent [PactFlow](https://pactflow.io) Broker that tracks contract history across pipeline runs.

```bash
# Run consumer pact tests locally (generates pact files, does NOT publish)
npm run test:pact

# Run provider verification locally (verifies against PactFlow)
npm run test:pact:verify
```

**One-time setup** (run once per provider, ever):
```bash
# Register environments on PactFlow
./scripts/deploy-pact-broker.sh

# Initialise service-b as a provider (creates version + records deployment baseline)
./scripts/pact/initialise-provider.sh service-b
```

**CI pipeline handles:** publish → verify → can-i-deploy → record-deployment.

**Important:** Never publish pacts or record deployments locally. The `publish.sh` script blocks outside CI. Only `initialise-provider.sh` runs locally — it's a one-time setup to give the Broker a baseline. After that, the pipeline owns the full workflow.

**Broker options** — PactFlow is used here for persistent history. Alternatives:
- **PactFlow** (SaaS) — zero infrastructure, free trial, paid after
- **Docker Compose** — self-hosted, persistent locally via Docker volume, ephemeral in CI
- **K8s deployment** — reference manifests in `k8s/pact-broker.yaml` + `k8s/postgres.yaml`
- **Cloud-hosted** — run the open-source Pact Broker on any cloud (GCP, AWS, etc.) with a Postgres database

PactFlow's free trial is 30 days. After that, switch to any of the self-hosted options above — the scripts and tests are identical, only the Broker URL and auth method change (token → username/password). See [docs/pact/04-broker-ops.md](docs/pact/04-broker-ops.md) for CLI installation and credential setup.

See [docs/pact/](docs/pact/) for full documentation — big picture, consumer/provider guides, broker ops, CI/CD patterns, repo separation, adoption strategy, and step-by-step adoption plan.

### Testing

```bash
# Consumer pact tests (generates pact files locally)
npm run test:pact

# Provider verification (verifies against PactFlow Broker)
npm run test:pact:verify

# Service integration tests (auto-detects local services or Kind cluster)
npm run test:integration

# K8s infrastructure tests (needs Kind cluster)
npm run test:infra
```

See [TESTING.md](TESTING.md) for full testing strategy.

### Chaos / Failure Injection (Phase 4)

Prerequisites: Docker running + Kind cluster deployed (`./scripts/deploy-local.sh`)

```bash
# Pod kill — delete a pod, verify service stays up and K8s self-heals
./scripts/chaos/pod-kill.sh service-a
./scripts/chaos/pod-kill.sh service-b

# Resource pressure — CPU throttling + OOMKill via sidecar
./scripts/chaos/resource-pressure.sh service-a cpu
./scripts/chaos/resource-pressure.sh service-a mem
./scripts/chaos/resource-pressure.sh service-a all

# Dependency failure — kill downstream, observe upstream
./scripts/chaos/dependency-failure.sh

# Latency injection — slow downstream, test upstream timeout
./scripts/chaos/latency-injection.sh
```

## Endpoints

| Service   | Endpoint  | Description                        |
|-----------|-----------|------------------------------------|
| Service A | `/health` | Health check                       |
| Service A | `/data`   | Calls Service B and returns result |
| Service B | `/health` | Health check                       |
| Service B | `/info`   | Returns service data               |

## CI Pipeline

```
install → lint ──────────┐
        → typecheck ─────┤
        → validate-k8s ──┤
        → pact ───────────┴→ deploy-and-test
            ├── Consumer test         ├── Create Kind cluster
            ├── Publish to PactFlow   ├── Build + load images
            ├── Provider verify       ├── Deploy manifests
            └── Can-i-deploy +        ├── BATS infra tests
               record-deployment      ├── Vitest integration tests
                                      └── Teardown (always)
```

Static checks (lint, typecheck, K8s validation) and Pact contract tests run in parallel. Deploy + test runs after all checks pass.

## Progress

- [x] Phase 1: Scaffold — services, Dockerfiles, K8s manifests, Kind config
- [x] Phase 2: Local Kind cluster + deploy + verify service-to-service comms
- [x] Phase 3: CI pipeline (lint, config validation, integration tests)
- [x] Phase 4: Failure injection (pod kills, resource pressure, latency)
  - [x] Step 1: Pod kill — resilience to pod deletion
  - [x] Step 2: Resource pressure — CPU throttling + OOMKill (sidecar approach)
  - [x] Step 3: Dependency failure — kill Service B, observe Service A
  - [x] Step 4: Latency injection — slow downstream, observe upstream
- [ ] Phase 5: Encode learnings into CI guardrails
  - [x] Contract testing (Pact) — consumer/provider tests, PactFlow Broker, can-i-deploy gate
  - [ ] Manifest validation — CI gate for replicas, resource limits, probe config
  - [ ] Chaos CI gates — run chaos scripts in CI, fail pipeline if services don't survive
  - [ ] Code quality gates — lint rules for HTTP timeouts, error handling
- [ ] Phase 6: AI service — add an LLM-powered service to the platform
- [ ] Phase 7: AI quality guardrails — non-deterministic assertions, golden sets, accuracy gates
