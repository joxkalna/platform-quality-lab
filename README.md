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
│   └── vendor/
│       └── metrics-server.yaml  # Bundled metrics-server (avoids GitHub download at deploy)
├── tests/
│   ├── infrastructure/     # BATS — K8s deploy verification (pods, DNS, connectivity)
│   └── integration/        # Vitest + axios — service endpoint tests (HTTP assertions)
├── scripts/
│   ├── deploy-local.sh     # Full local Kind deploy (create, build, load, deploy)
│   └── chaos/              # Failure injection scripts (Phase 4)
│       └── pod-kill.sh     # Kill a pod, verify resilience + self-healing
├── kind-config.yaml         # Kind cluster: 1 control-plane + 2 workers
└── .github/workflows/
    └── ci.yml              # CI pipeline (lint, typecheck, K8s validate, deploy, test)
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

### Testing

```bash
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
        → validate-k8s ──┴→ deploy-and-test
                              ├── Create Kind cluster
                              ├── Build + load images
                              ├── Deploy manifests
                              ├── BATS infra tests
                              ├── Vitest integration tests
                              └── Teardown (always)
```

Static checks (lint, typecheck, K8s validation) run in parallel. Deploy + test runs as a single job because the Kind cluster can't persist across GitHub Actions jobs.

## Progress

- [x] Phase 1: Scaffold — services, Dockerfiles, K8s manifests, Kind config
- [x] Phase 2: Local Kind cluster + deploy + verify service-to-service comms
- [x] Phase 3: CI pipeline (lint, config validation, integration tests)
- [ ] Phase 4: Failure injection (pod kills, resource pressure, latency)
  - [x] Step 1: Pod kill — resilience to pod deletion
  - [x] Step 2: Resource pressure — CPU throttling + OOMKill (sidecar approach)
  - [ ] Step 3: Dependency failure — kill Service B, observe Service A
  - [ ] Step 4: Latency injection — slow downstream, observe upstream
- [ ] Phase 5: Encode learnings into CI guardrails
- [ ] Phase 6: AI service — add an LLM-powered service to the platform
- [ ] Phase 7: AI quality guardrails — non-deterministic assertions, golden sets, accuracy gates

LEFT AT:

Next session — pick up from:

Step 3: Dependency failure (kill Service B, observe Service A)
Step 4: Latency injection (slow Service B, observe Service A)
Step 5: Observation script

Then Phase 5: wire the guardrails into CI. All captured in CHAOS.md.
