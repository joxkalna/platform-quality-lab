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
- **Phase 3** CI pipeline — GitHub Actions (lint, config validation, contract checks, integration tests)
- **Phase 4** Failure injection — pod kills, resource pressure, latency injection, observation scripts
- **Phase 5** Guardrails — CI gates per failure, guardrail table, Slack notifications, dashboard

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

## Key Decisions
- 2 replicas per service in K8s — enables testing rolling restarts and availability
- Resource limits intentionally tight (50m/64Mi req, 200m/128Mi limit) — to trigger pressure in Phase 4
- Service B URL injected via env var in K8s manifest, resolved via K8s DNS
- `imagePullPolicy: Never` in manifests — Kind uses pre-loaded images, not a registry
- metrics-server installed with `--kubelet-insecure-tls` flag (required for Kind, no real TLS between nodes)
- Deploy order: Service B first, then A — A depends on B for `/data` endpoint
- VPN blocks image pulls inside Kind nodes — workaround: `docker pull` locally then `kind load`

## Phase 2 Resource Baseline
- Idle CPU: 1-13m per pod (limit: 200m)
- Idle memory: 11-15Mi per pod (limit: 128Mi)
- Significant headroom — Phase 4 will push toward limits to trigger throttling/OOMKills
