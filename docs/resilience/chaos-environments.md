# Chaos Environments — Where Experiments Actually Run

## The Core Rule

**Never run destructive chaos experiments against production pods serving real traffic.**

The scripts in `scripts/chaos/` — pod-kill, resource-pressure, dependency-failure, latency-injection — are designed for controlled environments. They mutate live deployments (`kubectl delete`, `kubectl patch`, `kubectl scale`). In production, deployments are owned by GitOps operators (ArgoCD/Flux), and manual mutations either get reverted immediately or create dangerous drift.

This doc explains where chaos experiments run at each maturity level, and how the scripts we've built map to real-world tooling.

## Three Tiers of Chaos Testing

### Tier 1: Local / CI (what we have)

**Environment:** Kind cluster (ephemeral, no real traffic, no real data)

**Who does this:** Every team, from day one.

**What it proves:**
- Services survive pod death (replicas work)
- Resource limits trigger expected K8s behaviour (throttling, OOMKill)
- Upstream degrades gracefully when downstream dies
- Timeouts fire correctly under latency

**How it runs:**
```
build → deploy:kind → chaos experiments → pass/fail gate → teardown
```

**Blast radius:** Total — we own the entire cluster, nothing else is affected.

**Limitations:**
- No real traffic patterns (single requests, not concurrent load)
- No real node topology (Kind nodes are Docker containers on one machine)
- No network policies, service mesh, or ingress — experiments skip the real network stack
- Resource behaviour differs from real nodes (Kind shares the host's resources)

**Our scripts map here directly.** This is where chaos-ci-gates (Phase 5) will run.

### Tier 2: Staging / Pre-Production (where most orgs live)

**Environment:** A dedicated cluster that mirrors production — same manifests, same images, same network policies, same service mesh. Serves no real user traffic.

**Who does this:** Any org with a staging environment. This is the realistic target for SDET/platform quality work.

**What it proves:** Everything from Tier 1, plus:
- Services survive under realistic load (synthetic traffic via k6/Locust)
- Monitoring and alerting detect the failure (Datadog, Prometheus, PagerDuty)
- Recovery time meets SLA targets
- Cascading failures are contained (circuit breakers, retries, bulkheads)

**How it runs:**
```
build → test → deploy:staging → synthetic traffic → chaos:staging → observe metrics → promote:prod
```

The chaos step is a **promotion gate** — if services don't survive in staging, the build doesn't reach production.

**Blast radius:** Contained to staging. Real infrastructure, but no real users.

**What changes from Tier 1:**

| Aspect | Tier 1 (Kind) | Tier 2 (Staging) |
|---|---|---|
| Cluster | Ephemeral Kind | Persistent staging cluster |
| Traffic | Single curl/wget requests | Synthetic load generators (k6, Locust) |
| Observability | kubectl + script output | Dashboards, metrics, alerts |
| Network | Flat, no policies | Service mesh, network policies, ingress |
| Recovery check | "Did kubectl say it's ready?" | "Did error rate return to baseline? Did alerts resolve?" |

**Our scripts work here with minimal changes.** The kubectl commands are the same — only the cluster context changes. The real addition is observability: instead of just checking "did the pod come back?", you check "did Prometheus detect the spike? Did the alert fire? Did the dashboard show the recovery?"

### Tier 3: Production Chaos (Netflix/Amazon-scale)

**Environment:** Production, serving real users.

**Who does this:** Large orgs with mature observability, automated rollback, and a culture of resilience testing. This is not where you start.

**What it proves:** Everything from Tier 2, plus:
- Monitoring detects real failures fast enough (not just synthetic ones)
- On-call runbooks work when the alert fires
- Automated rollback triggers correctly
- Multi-region failover works as designed

**How it runs:**
- **Game days** — scheduled, announced, with an incident commander watching dashboards
- **Continuous chaos** — automated experiments running on a schedule (Chaos Monkey), with automatic abort if steady state breaks
- **Canary chaos** — inject failure into a small percentage of traffic, observe, expand or abort

**Key difference from Tier 1–2:** Production chaos is **observational, not destructive.** You already proved the system survives in staging. In production, you're testing whether your *monitoring, alerting, and response processes* detect and handle the problem fast enough.

**Blast radius controls:**
- Target one AZ, not all
- Affect 5% of pods, not 100%
- Set automatic abort conditions: "if error rate > 1%, stop the experiment"
- Time-boxed: experiment runs for 5 minutes max

**Tooling at this level:**

| Tool | What it does |
|---|---|
| [AWS Fault Injection Service (FIS)](https://aws.amazon.com/fis/) | Managed chaos for AWS resources — EKS pod actions, EC2 instance stops, network disruption. Built-in stop conditions and CloudWatch integration |
| [Chaos Mesh](https://chaos-mesh.org/) | K8s-native chaos operator — pod kill, network delay, IO stress. Runs as CRDs in the cluster with RBAC controls |
| [Litmus](https://litmuschaos.io/) | K8s chaos engineering platform — experiment library, observability integration, GitOps-friendly |
| [Gremlin](https://www.gremlin.com/) | SaaS chaos platform — blast radius controls, safety checks, team collaboration |
| Istio/Linkerd fault injection | Service mesh-level — inject latency or abort responses between services without touching pods |

## How Our Scripts Map to Real Tooling

| Our script | What it does | Staging equivalent | Production equivalent |
|---|---|---|---|
| `pod-kill.sh` | `kubectl delete pod` | Same command, staging cluster | AWS FIS `aws:eks:pod-delete` with blast radius + stop conditions |
| `resource-pressure.sh` | Sidecar stress-ng injection | Same approach, staging cluster | FIS `aws:eks:pod-cpu-stress` / `pod-memory-stress`, or Chaos Mesh `StressChaos` |
| `dependency-failure.sh` | `kubectl scale --replicas=0` | Same command, staging cluster | Network policy blocking traffic, or Istio `VirtualService` with `fault.abort` |
| `latency-injection.sh` | Standalone slow server + env var patch | Same approach, staging cluster | Istio `fault.delay`, Chaos Mesh `NetworkChaos`, or FIS network actions |

The progression: **manual kubectl → CI-automated kubectl → managed chaos platform with safety controls.**

## The Steady-State Hypothesis

Production chaos introduces a concept that doesn't exist in Tier 1–2: the **steady-state hypothesis**.

Before running an experiment, you define what "normal" looks like:
- p99 latency < 200ms
- Error rate < 0.1%
- All health checks passing
- No alerts firing

The experiment runs. If steady state breaks beyond a defined tolerance, the experiment **automatically aborts** and the system is restored. This is the fundamental safety mechanism that makes production chaos possible.

In our Kind experiments, we don't need this — there's nothing to protect. In staging, it's nice to have. In production, it's mandatory.

## What This Means for This Project

The chaos scripts we've built are **staging-grade tools**. They work unchanged in any K8s cluster — Kind, staging, or even production (though you wouldn't). The learning progression is:

1. **Phase 4 (done):** Build the experiments, understand the mechanics
2. **Phase 5 (now):** Add structured reporting, wire into CI as gates against Kind
3. **Future:** Same scripts, different target cluster. Add observability checks (did metrics spike? did alerts fire?) alongside the kubectl checks we already have

The gap between "works in Kind" and "works in staging" is small — it's mostly adding observability assertions. The gap between "works in staging" and "works in production" is large — it requires blast radius controls, automatic abort, and a fundamentally different mindset (observational vs destructive).

**For SDET/platform quality roles:** Tier 2 (staging chaos as a CI gate) is the baseline — every SET should own this. Tier 3 depends on the org and the criticality of the service:

- **Large enterprises with dedicated SRE teams** — SRE typically owns production chaos. SET owns staging chaos and the CI gates. The skills overlap but the on-call and blast radius ownership sits with SRE.
- **Scaleups with critical services** — SET owns chaos end-to-end, including production. When your service handles payments, health data, or real-time systems, proving resilience in staging isn't enough. The SET builds the experiment framework, defines steady-state hypotheses, wires abort conditions, and runs game days. SRE provides the platform primitives (FIS access, Chaos Mesh operator, metrics endpoints), but the validation ownership is SET.
- **Smaller teams** — the same person often wears both hats. The distinction doesn't matter; the skills do.

The takeaway: don't assume production chaos is "someone else's job". If the service is critical enough, owning the full chaos pipeline — local through production — is exactly what a senior SET does.
