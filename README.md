# Platform Quality Lab

A hands-on learning project for SDET/platform quality engineering — build microservices, deploy on Kubernetes, break things intentionally, and encode learnings into CI guardrails.

## Quick Start

```bash
npm install
cd services/service-a && npm install && cd ../..
cd services/service-b && npm install && cd ../..

npm run dev    # start both services
npm run stop   # stop both services
```

### Kubernetes (Kind)

```bash
./scripts/deploy-local.sh                    # full deploy (cluster, build, deploy, verify)
kind delete cluster --name platform-lab      # tear down
```

### Testing

```bash
npm run test:pact           # consumer contract tests
npm run test:pact:verify    # provider verification
npm run test:integration    # service endpoint tests
npm run test:infra          # K8s infrastructure tests (needs Kind cluster)
npm run validate:manifests  # K8s manifest policy validation
npm run lint                # ESLint + custom resilience rules
```

### Chaos Experiments

Requires a running Kind cluster (`./scripts/deploy-local.sh`).

```bash
./scripts/chaos/pod-kill.sh service-a            # pod resilience
./scripts/chaos/resource-pressure.sh service-a all  # CPU throttling + OOMKill
./scripts/chaos/dependency-failure.sh            # downstream failure
./scripts/chaos/latency-injection.sh             # timeout behaviour
```

## Architecture

```
services/
├── service-a/    Express (port 3000) → calls Service B
├── service-b/    Express (port 3001) → returns data
└── service-c/    Express (port 3002) → LLM text classification (Phase 6)
```

Each service follows the same structure: `app.ts` (pure Express app) + `server.ts` (entrypoint). Tests import `app.ts` directly — no server started.

## Endpoints

| Service   | Endpoint    | Description                        |
|-----------|-------------|------------------------------------|
| Service A | `GET /health` | Health check                     |
| Service A | `GET /ready`  | Readiness (checks Service B)     |
| Service A | `GET /data`   | Calls Service B, returns result  |
| Service B | `GET /health` | Health check                     |
| Service B | `GET /info`   | Returns service data             |
| Service C | `GET /health` | Health check                     |
| Service C | `GET /ready`  | Readiness (checks LLM)          |
| Service C | `POST /classify` | Text → category + confidence  |

## CI Pipeline

```
install → lint ──────────┐
        → typecheck ─────┤
        → validate-k8s ──┤
        → pact ───────────┴→ deploy-and-test
                               ├── BATS infra tests
                               ├── Vitest integration tests
                               ├── Chaos experiments
                               └── Teardown (always)
```

## Progress

- [x] Phase 1: Scaffold — services, Dockerfiles, K8s manifests, Kind config
- [x] Phase 2: Local Kind cluster + deploy + service-to-service comms
- [x] Phase 3: CI pipeline (lint, typecheck, K8s validation, integration tests)
- [x] Phase 4: Failure injection (pod kill, resource pressure, dependency failure, latency)
- [x] Phase 5: CI guardrails (Pact contracts, manifest validation, chaos gates, ESLint rules)
- [ ] Phase 6: AI service (Service C + Pact evolution + k6 load testing)
- [ ] Phase 7: AI quality guardrails (golden sets, accuracy thresholds, consistency tests)

## Documentation

| Doc | What it covers |
|-----|---------------|
| [TESTING.md](TESTING.md) | Testing strategy, test layers, scaling patterns |
| [CHAOS.md](CHAOS.md) | Chaos experiment log, learnings, guardrail implications |
| [docs/chaos-environments.md](docs/chaos-environments.md) | Local → staging → production chaos mapping |
| [docs/manifest-validation.md](docs/manifest-validation.md) | K8s policy validation rules, packaging strategy |
| [docs/code-quality-gates.md](docs/code-quality-gates.md) | Custom ESLint rules, shared coding standards path |
| [docs/ci-dependencies.md](docs/ci-dependencies.md) | CI dependency audit, image strategy |
| [docs/pact/](docs/pact/) | Contract testing — big picture, guides, CI/CD patterns |
