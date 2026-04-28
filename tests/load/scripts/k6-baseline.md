## What’s most interesting in *this* k6 output

### 1. **checks – correctness first (gate metric)**

    ✓ checks.........................: 100.00% ✓ 92 ✗ 0

**Why it matters**

*   This tells us **functional correctness under load**
*   In perf testing, correctness is *non‑negotiable*
*   A system that’s “fast but wrong” is useless

**How to use it**

*   Treat this as a **hard gate**
*   Any baseline comparison later should **always assume checks == 100%**

This test passes the “is the system behaving correctly at all?” question.

***

### 2. **http\_req\_failed – reliability under load**

    ✓ http_req_failed................: 0.00% ✓ 0 ✗ 38

(Yes, the ✓/✗ formatting is confusing — what matters is `0.00%`.)

**Why it matters**

*   This is pure **error rate**
*   Even tiny percentages become catastrophic at real traffic volumes

**Baseline rule of thumb**

*   **Smoke baseline**: 0%
*   **Load baseline**: ≤ 0.1%
*   **Stress tests**: small failure rates may be acceptable, but must stabilise

For a smoke test, this is exactly what we want.

***

### 3. **http\_req\_duration (p90 / p95) – THE core latency signal**

    http_req_duration..............:
    avg=7.2ms
    p(90)=11.88ms
    p(95)=15ms
    max=16.99ms

This is the **single most important performance metric** in your output.

**Why p90 / p95 > avg**

*   Averages lie
*   Users experience tail latency
*   p95 is typically your **SLO-facing number**

**What this tells us**

*   p95 ≈ **15ms**
*   Very tight distribution (max < 17ms)
*   No obvious queuing or contention

This is an smoke baseline.

**If you track only one number from this run, track this.**

***

###  4. **http\_req\_waiting – server-side time**

    http_req_waiting...............:
    avg=7.05ms
    p(95)=14.67ms

This is effectively:

> **Time spent waiting for the application to respond**

(the “backend time”, excluding network overhead)

**Why it matters**

*   This isolates **application + downstream latency**
*   If this grows while sending/receiving stays flat → backend regression

Here it almost exactly matches `http_req_duration`, which is what we want in a local / Kind setup.

***

### 5. **group\_duration – end-to-end business step**

    group_duration.................:
    avg=15.86ms
    p(95)=26.4ms

This is **hugely valuable**, and many teams ignore it.

**Why it matters**

*   `group_duration` measures **logical user actions**
*   It’s closer to *real user experience* than single HTTP calls
*   Perfect for SLIs like “checkout takes < 300ms”

This is your **business-level baseline**, not just technical latency.

***

### ⚠️ 6. **iteration\_duration – scenario cost**

    iteration_duration.............:
    avg=20.15ms
    p(95)=31.52ms

**Why it matters**

*   This tells you how “expensive” one VU iteration is
*   Critical for capacity planning later

Right now it’s low, but this metric explodes first under contention.

***

### 7. What is *not* very interesting here (for now)

These are **secondary diagnostics**, not headline metrics for a smoke test:

*   `data_received`, `data_sent`
*   `http_req_sending`, `http_req_receiving`
*   `http_req_connecting`, `http_req_blocked`
*   `vus`, `vus_max` (already discussed)

We'll care about those **only when something goes wrong**.

***

## 🔑 Summary: If you had 5 KPIs from this run

For a **smoke baseline**, potentially pick:

1.  `checks == 100%`
2.  `http_req_failed == 0%`
3.  `http_req_duration p95 ≈ 15ms`
4.  `http_req_waiting p95 ≈ 14.7ms`
5.  `group_duration p95 ≈ 26ms`


## How to extract a **baseline** (properly)

A baseline is **not** just “some numbers from one run”.

### Step 1: Decide what kind of baseline this is

This run is clearly a:

> **Smoke performance baseline**

*   Low traffic
*   Short duration
*   Goal: detect regressions, not capacity

Be explicit. Name it that way.

***

### Step 2: Extract a baseline *contract*

Create a **baseline definition**, not just numbers:

```yaml
baseline:
  type: smoke
  environment: kind-local
  duration: 30s
  load:
    scenarios: 3
    max_vus: 15
  slo:
    checks: 100%
    http_req_failed: 0%
    http_req_duration_p95_ms: 15
    group_duration_p95_ms: 30
```

This becomes our **reference truth**.

***

### Step 3: Store baseline results

You already upload artifacts — excellent.

Now make sure you keep:

*   `summary.json` or custom JSON output
*   commit SHA
*   environment metadata

Example (ideal):

    baselines/
     └─ smoke/
         └─ 2026-04-28/
             ├─ summary.json
             ├─ config.json
             └─ commit.txt

***

### Step 4: Compare future runs *against the baseline*

This is where k6 becomes powerful.

Typical comparison rules:

*   p95 regression > **+20%** → fail
*   error rate > **0%** → fail
*   group\_duration p95 > **baseline × 1.2** → warn/fail

You can enforce this using:

*   k6 thresholds
*   post-run comparison scripts
*   CI gates

***

### Step 5: Treat baseline as **living**

Baselines are not eternal.

You should:

*   Re‑baseline intentionally when architecture changes
*   Version baselines like APIs
*   Never silently “accept” slower performance

***

## One important insight (this is key)

> **This run is not about load.  
> It’s about *early performance regression detection*.**

And it succeeds at that.

numbers are:

*   stable
*   tight
*   low variance
*   easy to compare

That’s the foundation we *must* have before doing heavier load tests.
