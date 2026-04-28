# Shared tsconfig Base — Exploration

## Problem

Every service and test directory repeats the same TypeScript settings (`strict`, `skipLibCheck`, `esModuleInterop`, `target`). A shared base config would DRY this up — change once, propagate everywhere.

## Constraint

Services are Dockerized. Each Dockerfile copies only its own directory into the container. A shared `tsconfig.base.json` at the repo root is outside the Docker build context — `extends: "../../tsconfig.base.json"` resolves locally but fails inside Docker.

## Options

### Option 1 — Workspace package (Turborepo/Nx pattern)

Publish the base config as an internal workspace package:

```
packages/tsconfig/
  base.json
  package.json  → { "name": "@platform-lab/tsconfig" }
```

Each service installs it as a dependency and extends via `node_modules`:

```json
{ "extends": "@platform-lab/tsconfig/base.json" }
```

Docker builds install dependencies first (`npm ci`), so the base config arrives via `node_modules`. No path coupling.

**Pros:** Standard monorepo pattern, Dockerfiles stay self-contained, works at any scale.
**Cons:** Requires workspace tooling (npm workspaces or similar), adds a package to maintain.

### Option 2 — Copy at build time

CI or a Makefile copies the base config into each service directory before Docker build:

```yaml
- run: cp tsconfig.base.json services/service-a/
- run: docker build services/service-a
```

Dockerfile just does `COPY tsconfig.base.json ./` — it's already there.

**Pros:** Simple, no workspace tooling, Dockerfiles stay self-contained.
**Cons:** Extra CI step, local builds need a script or pre-build hook, copied file can drift if someone edits the copy instead of the source.

### Option 3 — Self-contained (current state)

Each service keeps its own full tsconfig. The duplication is 4 lines (`target`, `strict`, `esModuleInterop`, `skipLibCheck`). When settings change, update each file.

**Pros:** Zero coupling, Dockerfiles are hermetic, no build context tricks, no tooling overhead.
**Cons:** Duplication (4 lines × 3 services = 12 lines). Risk of drift if someone updates one but not others.

## Decision

**Keep Option 3 (self-contained) for now.** The duplication is minimal (4 lines per service), the services rarely change their TypeScript settings, and Docker isolation is more valuable than DRY for 12 lines.

Revisit when:
- A 4th or 5th service is added (duplication becomes maintenance burden)
- npm workspaces are adopted for other reasons (Option 1 becomes free)
- A setting change is missed in one service and causes a production bug (drift becomes real)

## What we tried

On the `phase6/k6` branch, we attempted Option 1 without workspace tooling — a root `tsconfig.base.json` with `extends: "../../tsconfig.base.json"` in each service. This broke Docker builds because the path doesn't resolve inside the container. Fixing it required either changing the build context to the repo root (coupling all builds together) or mirroring the directory structure inside Docker (fragile path assumptions).

Both fixes introduced more failure points than the duplication they removed. Reverted.
