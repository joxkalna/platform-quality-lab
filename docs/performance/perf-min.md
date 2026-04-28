# Performance Testing Guide

This document describes **when performance testing is required**, **what should be tested**, and **how to reason about performance risk** for this project's services.

It is intended to help make early, informed decisions — before code is merged, not after incidents.

---

## Purpose

Performance testing ensures that:
- Services can handle **expected and peak load** within the Kind cluster
- Service-to-service communication does not degrade under concurrency
- Infrastructure changes (resource limits, replica counts, networking) don't introduce **latency regressions**
- New services or endpoints don't silently degrade existing performance

Performance testing is not just about response times — it also covers **throughput, error rates, stability under sustained load, and infrastructure isolation** (is the bottleneck in the service, the DNS, or the networking?).

---

## When Is Performance Testing Required?

Performance testing **should be considered mandatory** if a change includes any of the following:

### Service changes
- New endpoints (e.g. adding `/classify` to Service A in Phase 6)
- Changes to downstream calls (new service dependency, timeout changes)
- Changes affecting request frequency, concurrency, or payload size
- Framework upgrades (Express, Node.js) that could affect throughput

### Infrastructure changes
- K8s resource limit changes (CPU, memory requests/limits)
- Replica count changes
- K8s manifest changes affecting networking (service type, port config)
- Kind cluster configuration changes (nodes, networking)

### Phase milestones
- After each phase that adds a new service or endpoint
- Before declaring a phase complete — performance baseline should be established
- When chaos experiments reveal performance-related findings

If none of the above apply, the existing CI smoke test provides continuous validation. Full load testing is not required for every commit.

---

## Types of Performance Testing

Not every change needs every type. Choose based on risk.

### Smoke Test (every push)
Validates scripts work and endpoints are reachable. Not a performance gate — a correctness gate.
- Low rate (2 req/10s), short duration (30s)
- Runs in CI on every push, after integration tests
- Failure = endpoint is broken, not slow

### Load Test (main branch)
Validates behaviour under **expected steady-state traffic**.
- Ramp up → sustained → cool-down (5 min total)
- Measures: response times, throughput, error rates, stability
- Compared against committed baseline — regression > 10% = failure
- Runs on main branch only

### Stress Test (on-demand)
Validates behaviour **beyond expected limits** — finds breaking points.
- Ramps to high concurrency (30 req/s on tight resource limits)
- Higher error tolerance (20%) and latency threshold (5s)
- Not a CI gate — run manually or on schedule
- Answers: at what point do pods throttle, error rates spike, or K8s networking degrades?

### Endurance / Soak Test (future)
Validates stability over **sustained traffic** — finds memory leaks, gradual degradation.
- Not implemented yet — services are stateless Express pass-throughs with no state accumulation
- Becomes relevant when Service C has caching, connection pooling, or model loading

---

## What Should Be Tested

### Prioritise
- Service-to-service flows (`/data` — A calls B via K8s DNS)
- Health and readiness endpoints (K8s probes depend on these)
- New endpoints when added (e.g. `/classify` proxy in Phase 6)
- Infrastructure isolation — test services independently to identify where bottlenecks live

### Avoid
- Load testing Service C's LLM inference in Kind — constrained resources make results meaningless. Chaos experiments cover failure behaviour
- Synthetic patterns that don't reflect real usage (e.g. 1000 req/s against a 2-replica Kind cluster)
- Testing without assertions — exploratory runs are useful but don't replace gating tests

---

## Infrastructure Isolation — What Load Testing Reveals

Testing each service independently isolates where bottlenecks live:

| Scenario | What it isolates |
|----------|-----------------|
| Service B alone (`/health`, `/info`) | Raw throughput — baseline for the infrastructure |
| Service A alone (`/health`) | Same, but with the Express proxy layer |
| Service A → B chain (`/data`) | K8s DNS resolution + networking + proxy overhead |

If A → B is slow but B alone is fast, the problem is in the networking/DNS layer, not the service code. This is infrastructure insight that chaos experiments can't provide.

---

## Where Performance Testing Fits in Delivery

```
Every push:     smoke test (30s) — validates endpoints work
Main branch:    load test (5min) + regression analysis — gates on performance
On-demand:      stress test (6min) — finds breaking points
Future:         chaos + load combined — performance under failure
```

Results are:
- Visible in GitHub Actions step summary (markdown comparison table)
- Stored as GitHub Actions artifacts (`summary.json`)
- Compared against committed baseline (`tests/load/baseline.json`)
- Alerted via Slack webhook on regression (MR 3)

---

## Expected Outcomes

Every performance test should result in at least one of:
- Confirmation that the system meets baseline expectations (see `perf-baseline.md`)
- Identification of a regression with clear metrics (which endpoint, how much, compared to what)
- Discovery of infrastructure limits (stress test breaking points)
- A decision: fix, accept with sign-off, or change infrastructure

Running tests without generating a decision or learning is considered incomplete.

---

## Quick Decision Checklist

Use this before merging:

```text
Do I need to run load tests?
  □ New endpoint or service added
  □ Downstream dependency changed (URL, timeout, new service)
  □ K8s resource limits or replica count changed
  □ Framework or runtime version upgraded
  □ Phase milestone — establishing new baseline

Is the CI smoke test sufficient?
  □ Code-only change with no new endpoints
  □ Documentation or config changes
  □ Test changes that don't affect service behaviour

Do I need a stress test?
  □ Resource limits changed — need to find new breaking point
  □ Investigating a performance incident
  □ Pre-phase-completion — establishing ceiling
```
