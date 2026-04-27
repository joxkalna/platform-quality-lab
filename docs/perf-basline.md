# Performance Baseline & Minimum Expectations

This document defines the **minimum performance expectations** for this project's services and acts as a **baseline for performance testing results and regressions**.

It complements `perf-min.md` (when to test) by making performance testing **objective and actionable** — clear pass/fail criteria, not subjective interpretation.

This baseline is **service‑specific by design**. `perf-min.md` defines *when* and *why* to test; this document defines *what good looks like* here.

---

## Scope

These expectations apply to:
- k6 load testing under baseline traffic against the Kind cluster
- CI smoke/load test runs (GitHub Actions)
- Regression comparison against previous runs or committed baselines

They do **not** replace exploratory or investigative performance testing (e.g. stress tests to find breaking points).

---

## Infrastructure Context

All services run in Kind (Kubernetes in Docker) with intentionally tight resource limits:

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 50m | 200m |
| Memory | 64Mi | 128Mi |
| Replicas | 2 | 2 |

These limits are tight by design — Phase 4 chaos experiments push toward them. Performance baselines must account for this constrained environment. Thresholds that pass in Kind may be tighter than what a real cloud cluster with autoscaling would need.

---

## Baseline Load Definition

The baseline load represents **expected steady-state traffic** for this project's services in the Kind cluster.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Request rate (health checks) | 5 req/s | Sustained rate for simple endpoints |
| Request rate (data flow A → B) | 3 req/s | Lower rate — involves K8s DNS hop |
| Traffic profile | Ramp up → steady → ramp down | Realistic deployment pattern |
| Duration (load test) | 5 min (1m ramp + 3m steady + 1m cool-down) | Long enough to expose instability, short enough for CI |
| Duration (smoke test) | 30s | Validates scripts work, not performance |

This baseline should be reviewed when:
- Resource limits change in K8s manifests
- New services are added to the load profile
- Kind cluster configuration changes (nodes, networking)

---

## Minimum Performance Criteria — Per Endpoint

Performance tests **must meet all criteria below** under baseline load.

### Service B — Direct (no downstream dependency)

| Endpoint | Metric | Threshold | Rationale |
|----------|--------|-----------|-----------|
| `GET /health` | p95 | < 200ms | No logic, no I/O — pure Express response |
| `GET /health` | p99 | < 500ms | Allows for K8s networking jitter |
| `GET /info` | p95 | < 200ms | Returns static JSON, same as health |
| `GET /info` | p99 | < 500ms | Same allowance for jitter |

### Service A — With downstream dependency

| Endpoint | Metric | Threshold | Rationale |
|----------|--------|-----------|-----------|
| `GET /health` | p95 | < 200ms | No downstream call — same as Service B |
| `GET /ready` | p95 | < 500ms | Calls Service B `/health` with 2s timeout |
| `GET /data` | p95 | < 500ms | Calls Service B `/info` — includes K8s DNS resolution + network hop |
| `GET /data` | p99 | < 1000ms | Allows for DNS caching misses, pod scheduling |

### Service C — Smoke only (not in load profiles)

| Endpoint | Metric | Threshold | Rationale |
|----------|--------|-----------|-----------|
| `GET /health` | p95 | < 200ms | No LLM call |
| `POST /classify` | p95 | < 10000ms | LLM inference on constrained resources — smoke only, not gating |

Service C thresholds are intentionally loose. The point of including `/classify` in smoke tests is to verify the endpoint works, not to gate on LLM performance in Kind.

### Global Thresholds (all endpoints combined)

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Error rate (`http_req_failed`) | < 5% | Standard reliability floor |
| Check pass rate (`checks`) | > 95% | Assertions on response body/status |
| p95 response time (global) | < 2000ms | Catch-all — individual endpoints have tighter thresholds |

---

## Regression Expectations

Performance tests compare against:
- The **committed baseline** (`tests/load/baseline.json`) — ratchet pattern, updated manually when performance improves
- The **previous CI run** on main — GitHub Actions artifact comparison

A result is considered a **regression** if:
- Any per-endpoint threshold is breached (absolute gate)
- Any metric degrades > **10%** compared to the previous baseline (relative gate)
- New instability is introduced — even if averages remain acceptable (e.g. p99 spikes while p50 is flat)

### Regression threshold: 10%

| Metric | Regression if... |
|--------|-----------------|
| `http_reqs.rate` (throughput) | Drops > 10% |
| `http_req_duration.p(90)` (latency) | Increases > 10% |
| `http_req_failed.rate` (errors) | Increases > 10% |

10% is the industry standard for performance gates — tight enough to catch real regressions, loose enough to avoid flaky failures from infrastructure variance in Kind.

### What happens on regression

Regressions must result in one of:
- Fix before merge
- Explicit sign-off with documented reason (e.g. "added a new downstream call, latency increase is expected")
- Infrastructure change (resource limits, replica count)

---

## Test Quality Requirements

A performance test is considered valid only if it:
- Runs against a deployed Kind cluster with all services healthy
- Uses the correct load profile for its type (smoke, load, stress)
- Runs for sufficient duration (smoke: 30s, load: 5min, stress: 6min)
- Produces `summary.json` with measurable outcomes

Tests without assertions or comparison are considered **exploratory**, not gating.

---

## Baseline Evolution

These thresholds are initial values based on:
- Phase 2 resource baseline (idle: 1-13m CPU, 11-15Mi memory per pod)
- Service architecture (Express pass-throughs, no business logic)
- Kind cluster constraints (200m CPU limit, 128Mi memory limit, 2 replicas)

They will evolve as:
- MR 1 produces first real measurements (may need to loosen or tighten)
- Stress tests reveal actual breaking points
- Services gain complexity (Phase 7 LLMOps, Phase 8 Bruno)

When updating thresholds, commit the change with a message explaining why — the git history becomes the performance decision log.
