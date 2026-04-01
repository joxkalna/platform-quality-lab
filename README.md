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
├── kind-config.yaml         # Kind cluster: 1 control-plane + 2 workers
└── .github/workflows/       # CI — coming in Phase 3
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

## Endpoints

| Service   | Endpoint  | Description                        |
|-----------|-----------|------------------------------------|
| Service A | `/health` | Health check                       |
| Service A | `/data`   | Calls Service B and returns result |
| Service B | `/health` | Health check                       |
| Service B | `/info`   | Returns service data               |

## Progress

- [x] Phase 1: Scaffold — services, Dockerfiles, K8s manifests, Kind config
- [ ] Phase 2: Local Kind cluster + deploy + verify service-to-service comms
- [ ] Phase 3: CI pipeline (lint, config validation, contract checks, integration tests)
- [ ] Phase 4: Failure injection (pod kills, resource pressure, latency)
- [ ] Phase 5: Encode learnings into CI guardrails
