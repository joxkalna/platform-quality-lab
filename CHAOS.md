# Phase 4: Failure Injection — Experiment Log

Each experiment documents what we broke, what we observed, and what guardrail it implies for Phase 5.

---

## Step 1: Pod Kill

**Script:** `scripts/chaos/pod-kill.sh <service>`

**What we did:**
Deleted a running pod from a 2-replica deployment.

**What we observed:**
- The surviving replica continued serving traffic immediately — zero downtime
- K8s detected the missing replica and scheduled a replacement within seconds
- Full replica count (2/2) restored automatically

**Key K8s behaviour:**
- The Deployment controller constantly reconciles desired vs actual replica count
- With 2+ replicas, a single pod death is a non-event for availability
- `--wait=false` on delete simulates a sudden crash (no graceful shutdown)

**What this implies for Phase 5 (CI guardrails):**
- All deployments must have `replicas >= 2` — enforce via manifest validation in CI
- Post-deploy smoke test: kill a pod, assert service stays reachable
- Assert replica count restores within a timeout (e.g. 60s)

---

## Step 2: Resource Pressure

**Script:** `scripts/chaos/resource-pressure.sh <service> <cpu|mem|all>`

**Approach:** Sidecar injection (no production code changes)
- A `stress-ng` container is injected into the pod via `kubectl patch`
- The sidecar shares the pod's resource cgroup — it competes with the app for the same CPU/memory limits
- Sidecar is removed after the experiment

**Why sidecar, not debug endpoints:**
We initially added `/debug/stress-cpu` and `/debug/stress-mem` endpoints to the service code, gated behind an env var. We reverted this because:
- Real orgs would never merge debug stress endpoints into production code
- Even gated behind env vars, it's code that doesn't belong in the service
- The sidecar approach is how real chaos teams operate — inject externally, observe, clean up

**Other approaches in real orgs:**
| Approach | How it works | When to use |
|---|---|---|
| Sidecar injection (what we used) | Patch deployment to add stress container | Learning, small teams, no tooling budget |
| Ephemeral debug container | `kubectl debug` attaches temp container to running pod | Quick ad-hoc investigation |
| Chaos tooling (Litmus, Chaos Mesh) | K8s operators that inject stress externally | Production chaos engineering at scale |
| Load testing (k6, wrk) | Hit real endpoints with traffic until resources spike | Most realistic — app hits limits naturally |

### CPU Throttling

**What we did:**
Injected stress-ng sidecar burning 2 CPU cores for 15 seconds. Pod limit is 200m CPU.

**What we observed:**
- K8s throttled the pod's CPU — the app responded slower but stayed alive
- Zero restarts on the app container
- After stress-ng finished, performance returned to normal

**Key K8s behaviour:**
- CPU limits are "soft" — K8s throttles (slows down), it doesn't kill
- The app stays alive but latency increases — users experience slowness, not errors
- This is why CPU limits matter: without them, one runaway pod can starve the whole node

**What this implies for Phase 5 (CI guardrails):**
- All deployments must have CPU limits set — enforce via manifest validation
- Monitor for CPU throttling in production (metrics-server / Prometheus)
- Consider: if your app can't tolerate throttling, your CPU limit might be too low

### OOMKill (Memory)

**What we did:**
Injected stress-ng sidecar allocating 256MB. Pod limit is 128Mi memory.

**What we observed:**
- K8s killed the pod when memory exceeded the 128Mi limit (OOMKilled)
- The deployment controller detected the dead pod and scheduled a replacement
- Service recovered automatically

**Key K8s behaviour:**
- Memory limits are "hard" — exceed them and the pod is killed immediately
- Unlike CPU (throttle), memory has no graceful degradation — it's binary (alive or dead)
- OOMKill is the #1 cause of unexpected pod restarts in production
- K8s restarts the container with exponential backoff (CrashLoopBackOff if it keeps dying)

**What this implies for Phase 5 (CI guardrails):**
- All deployments must have memory limits set — enforce via manifest validation
- Memory requests should be close to actual usage (our baseline: 11-15Mi, limit: 128Mi — lots of headroom)
- CI gate: post-deploy, assert zero OOMKills in pod events
- Consider: if OOMKills happen in production, either the limit is too low or the app has a memory leak

---

## Realistic Testing in Real Orgs

**Key learning from Phase 4:** Never modify production code to enable chaos testing.

In a real org, chaos experiments are external to the service:
1. **Sidecar injection** — add a stress container to the pod (what we did)
2. **Infrastructure-level tools** — Chaos Mesh, Litmus, AWS Fault Injection Service
3. **Load testing** — the most realistic way to trigger resource pressure (k6, Locust, wrk)
4. **Network policies** — block traffic between services to simulate dependency failures

The service code should never know it's being tested. If you need to change the app to test it, the test is testing the wrong thing.

---

---

## "K8s Handles It, Why Do We Care?"

K8s handles the *recovery*, not the *impact*. Yes, the pod comes back. But during the OOMKill:

- Users got errors or timeouts for in-flight requests when the pod died
- If both replicas OOMKill at the same time (e.g. traffic spike causes both to leak memory), the service is fully down until K8s restarts them
- If the pod keeps OOMKilling, K8s puts it in CrashLoopBackOff — exponential backoff means it could be down for minutes
- Every restart loses in-memory state (caches, connections, sessions) — the pod comes back cold

K8s self-healing is a safety net, not a solution. You don't skip seatbelts because the car has airbags.

### What we actually learned

1. **Our memory limits are set but are they right?** Baseline is 11-15Mi, limit is 128Mi. That's 8x headroom. In production, a memory leak could grow for hours before hitting the limit — by then it's too late to catch it early. Or the limit is so generous that the OOMKill never fires and the node runs out of memory instead (worse).

2. **CPU throttling is silent.** The pod didn't die, didn't restart, no alerts fired. But users experienced slower responses. Without monitoring, you'd never know. This is the most dangerous failure mode — everything looks green but the service is degraded.

3. **Recovery isn't instant.** The pod needs to start, pass readiness probes, warm up. During that window, the surviving replica handles all traffic — if it's already under pressure, it might OOMKill too (cascade failure).

### The guardrail loop

The chaos experiments aren't the end goal — they're how you discover what guardrails you need. The guardrails are the actual value. Once they're in CI, every future deployment is automatically validated against the failures you've already seen.

**Break it → understand why it matters → encode a guardrail → never regress.**

### Phase 5 guardrails implied by Phase 4 (so far)

| Guardrail | What it prevents | How to enforce in CI |
|---|---|---|
| All deployments must have `replicas >= 2` | Single pod death = full outage | Manifest validation: parse YAML, assert replicas ≥ 2 |
| All containers must have memory limits | Unbounded memory usage starves the node | Manifest validation: assert resources.limits.memory exists |
| All containers must have CPU limits | Runaway CPU starves other pods on the node | Manifest validation: assert resources.limits.cpu exists |
| Memory limit must be within sane range of request | Limits too far from requests = waste or surprise OOMKills | Manifest validation: assert limit ≤ 4x request (or whatever ratio you pick) |
| Post-deploy: zero OOMKills in pod events | Catches bad deployments that immediately OOMKill | BATS test: check pod events for OOMKilled after deploy |
| Post-deploy: zero CrashLoopBackOff | Catches pods that can't stay alive | BATS test: assert no pods in CrashLoopBackOff state |
| Post-deploy: pod kill resilience | Proves the service survives a pod death | Run pod-kill.sh as a CI step after deploy |

---

## Where We Left Off

**Completed:**
- [x] Step 1: Pod kill — resilience to pod deletion
- [x] Step 2: Resource pressure — CPU throttling + OOMKill via sidecar injection

**Next up:**
- [ ] Step 3: Dependency failure — kill Service B, observe how Service A degrades
- [ ] Step 4: Latency injection — slow down Service B, observe Service A's behaviour
- [ ] Step 5: Observation script — capture pod state, events, restarts, resource usage after any failure

After all steps are done, move to Phase 5: encode the guardrails table above into CI gates.

---

## Running the Experiments

Prerequisites: Docker running + Kind cluster deployed (`./scripts/deploy-local.sh`)

```bash
# Pod kill
./scripts/chaos/pod-kill.sh service-a
./scripts/chaos/pod-kill.sh service-b

# Resource pressure
./scripts/chaos/resource-pressure.sh service-a cpu
./scripts/chaos/resource-pressure.sh service-a mem
./scripts/chaos/resource-pressure.sh service-a all
```
