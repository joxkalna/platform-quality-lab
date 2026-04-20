# CI Dependencies & Infrastructure Audit

## Why This Doc Exists

As the project grows through phases, CI dependencies accumulate — images, tools, runtime requirements. Without tracking them, you end up with a pipeline that pulls 10 things at runtime and nobody remembers why. This doc is the audit trail.

## Current CI Dependencies

### Images (pulled/loaded at runtime)

| Image | Used by | Size | Why |
|---|---|---|---|
| `node:24-alpine` | Service Dockerfiles (build stage), latency-injection slow-server | ~190MB | Base image for services + chaos slow-server pod |
| `service-a:latest` | K8s deployment | ~60MB | Built in CI, loaded into Kind |
| `service-b:latest` | K8s deployment | ~60MB | Built in CI, loaded into Kind |
| `alexeiled/stress-ng:latest` | resource-pressure.sh (sidecar) | ~15MB | CPU/memory stress injection |

### Tools (installed in CI runner)

| Tool | Version | Used by | Install method |
|---|---|---|---|
| Node.js | 24 | Everything | `actions/setup-node` |
| Kind | v0.27.0 | Cluster creation | curl binary |
| kubectl | (bundled with Kind) | All K8s operations | Comes with Kind |
| kubeconform | 0.6.7 | Manifest schema validation | `action-setup-kube-tools` |
| BATS | latest | Infrastructure tests | `apt-get` |
| jq | latest | Chaos reporting | `apt-get` |

### Runtime Dependencies (npm)

| Package | Version | Used by | Notes |
|---|---|---|---|
| vitest | ^4.1.4 | Integration tests, pact tests | Test runner |
| axios | 1.15.0 (pinned) | Integration tests | Pinned — lower versions had malicious actor |
| @pact-foundation/pact | ^16.3.0 | Consumer pact tests | |
| @pact-foundation/pact-cli | ^18.0.0 | Pact publish, can-i-deploy | |
| js-yaml | ^4.1.1 | Manifest validation | |
| tsx | ^4.21.0 | Running TypeScript scripts | |
| eslint | ^9.39.4 | Linting | |

## Projected Dependencies by Phase

### Phase 6 (AI Service)

| Dependency | Type | Why |
|---|---|---|
| Ollama or LLM API endpoint | Service dependency | Service C wraps an LLM |
| `zod` | npm package | Config validation for LLM parameters |
| OpenTelemetry SDK | npm package | Instrumentation for traces/metrics |
| OTel Collector image | Docker image | Receives telemetry from Service C |

### Phase 7 (AI Quality Guardrails)

| Dependency | Type | Why |
|---|---|---|
| Golden set fixtures | Test data (JSON) | Curated input/output pairs for accuracy testing |
| Chart.js | npm package (or CDN) | Accuracy dashboard |
| Grafana Cloud (optional) | External service | Live metrics dashboard |

## The Image Problem in CI

Every `docker pull` in CI is a network call that adds time and can fail. Every `kind load` copies the image to all Kind nodes (3 in our config). As images accumulate, this becomes the slowest part of the pipeline.

### Current approach (what we do)

Pull images at runtime, load into Kind. Simple, no infrastructure needed.

```yaml
- run: |
    docker pull alexeiled/stress-ng:latest
    docker pull node:24-alpine
    kind load docker-image alexeiled/stress-ng:latest --name platform-lab
    kind load docker-image node:24-alpine --name platform-lab
```

**Pros:** Zero setup, works anywhere.
**Cons:** Network dependency on every run, slow with many images, Docker Hub rate limits (100 pulls/6h for anonymous, 200 for free accounts).

### Production approach: Pre-built test image

Build one image with all test/chaos dependencies, push to your registry. CI pulls one image instead of many.

```dockerfile
# images/chaos-tools/Dockerfile
FROM node:24-alpine
RUN apk add --no-cache curl jq
COPY --from=alexeiled/stress-ng:latest /stress-ng /usr/local/bin/stress-ng
```

```yaml
# CI pulls one image
- run: |
    docker pull ghcr.io/myorg/chaos-tools:latest
    kind load docker-image ghcr.io/myorg/chaos-tools:latest --name platform-lab
```

**Pros:** One pull, predictable, no Docker Hub rate limits (your own registry).
**Cons:** Need to maintain the image, rebuild when dependencies change.

### Other approaches

| Approach | How | When to use |
|---|---|---|
| **GitHub Actions cache** | Cache Docker layers between runs with `actions/cache` | When pulls are slow but you can't set up a registry |
| **Custom CI runner** | Pre-bake images into the runner AMI/image | Large orgs with dedicated CI infrastructure |
| **Docker Compose** | Define all images in `docker-compose.yml`, `docker compose pull` once | When tests run in Docker, not K8s |
| **Kind with registry** | Run a local registry inside Kind, push images there | Complex setups where `kind load` is too slow |

### When to switch

| Signal | Action |
|---|---|
| Pipeline takes >10 min | Profile where time goes — if it's image pulls, consider pre-built image |
| Docker Hub rate limit errors | Switch to GitHub Container Registry (ghcr.io) for third-party images |
| 5+ images loaded into Kind | Pre-built image becomes worth the maintenance cost |
| Multiple repos need the same chaos tools | Extract to a shared image, publish to registry |

We're at 4 images now. Phase 6 will add 1-2 more (OTel collector, possibly Ollama). That's the point where a pre-built image starts making sense.

## Audit Checklist

Review this when starting a new phase or when the pipeline gets slow.

- [ ] Are all images listed above still needed?
- [ ] Are any images pinned to `latest` that should be version-pinned?
- [ ] Are there Docker Hub rate limit issues?
- [ ] Is the total `kind load` time acceptable?
- [ ] Are all npm packages at secure versions? (check `npm audit`)
- [ ] Are any tools installed via `apt-get` that could be cached?

## Version Pinning Strategy

| Category | Strategy | Why |
|---|---|---|
| Service base images | `node:24-alpine` (major pin) | Alpine updates are safe, major Node changes need testing |
| CI tools | Exact version (`kind v0.27.0`, `kubeconform 0.6.7`) | Reproducible builds |
| npm packages | `^` range (except axios) | Semver-compatible updates are fine |
| axios | `1.15.0` (exact pin) | Lower versions had malicious actor — never use `^` |
| Chaos images | `latest` for now | Pin when moving to pre-built image |
