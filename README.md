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
│   └── service-b.yaml      # Deployment + Service (2 replicas, probes, resource limits)
├── tests/
│   ├── infrastructure/     # BATS — K8s deploy verification (pods, DNS, connectivity)
│   └── integration/        # Vitest + axios — service endpoint tests (HTTP assertions)
├── scripts/
│   └── deploy-local.sh     # Full local Kind deploy (create, build, load, deploy)
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

```bash
# Full deploy (create cluster, build images, deploy, verify)
./scripts/deploy-local.sh

# Tear down
kind delete cluster --name platform-lab
```

### Testing

```bash
# Service integration tests (auto-detects local services or Kind cluster)
npm run test:integration

# K8s infrastructure tests (needs Kind cluster)
npm run test:infra
```

See [TESTING.md](TESTING.md) for full testing strategy.

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
- [ ] Phase 5: Encode learnings into CI guardrails
