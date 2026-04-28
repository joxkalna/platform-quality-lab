# Observability – Platform Quality Lab

This document defines the **observability requirements** for Platform Quality Lab.

Observability is a **first‑class platform concern** and a prerequisite for:
- Performance testing
- Chaos experimentation
- Production readiness decisions

Performance tests without observability data are considered incomplete.

---

## Purpose

Observability enables the platform to:
- Understand system behaviour under load
- Diagnose failures introduced by chaos
- Correlate performance regressions to root causes
- Make performance tests actionable, not speculative

The goal is not dashboards — it is **explainability**.

---

## Observability Principles

This project follows the **three pillars of observability**:

1. Metrics
2. Logs
3. Traces

All services must emit all three.

Observability exists to answer:
> *“Why did this happen?”*

Not only:
> *“Did something fail?”*

---

## Metrics Requirements

Each service must expose:
- Request count
- Error count (4xx / 5xx)
- Latency distributions (p95 / p99)
- Resource usage (CPU, memory)

Metrics must be:
- Time‑series based
- Collectable during load tests
- Comparable across runs

Metrics are the **primary signal** used by k6 for assertions.

---

## Logging Requirements

Logs must be:
- Structured (JSON, not free‑text)
- Enriched with context (service, request, correlation IDs)
- Configurable by level at runtime

Logs exist to:
- Explain failures seen in metrics
- Support drill‑down from traces

Unstructured logs are considered insufficient for platform diagnosis.

---

## Distributed Tracing Requirements

All services must:
- Propagate trace context across boundaries
- Publish spans for each request
- Record latency for internal operations

Traces are required to:
- Understand fan‑out latency (Service A → B → C)
- Diagnose slow or failed dependencies
- Correlate chaos events with performance impact

---

## Relationship to Performance Testing

Performance tests rely on observability to:
- Interpret trade‑offs (latency vs errors)
- Identify bottlenecks
- Validate timeout and retry behaviour
- Confirm graceful degradation

A k6 test that fails without supporting observability data
is treated as **diagnostically incomplete**.

---

## Relationship to Chaos Engineering

Chaos experiments are expected to:
- Increase error rates
- Introduce latency
- Trigger retries and failures

Observability is mandatory to:
- Prove the system detected and reacted correctly
- Diagnose unintended cascading failures
- Validate recovery behaviour

---

## Observability as a Gate

A service is **not considered production‑ready** unless:
- Metrics, logs, and traces are emitted
- Signals remain available during load and chaos
- Failures can be explained using observability data

This mirrors real SRE production‑readiness expectations.

---

## What This Document Does Not Define

This document does not define:
- Specific tooling
- Thresholds or SLOs
- Dashboard visuals

Those are intentionally left implementation‑specific.
``
