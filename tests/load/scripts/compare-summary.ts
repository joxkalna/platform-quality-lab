/**
 * Regression analysis — compares current k6 summary against committed baseline.
 *
 * Metrics and thresholds based on industry-standard performance testing practices:
 * - https://grafana.com/docs/k6/latest/testing-guides/automated-performance-testing/
 * - https://grafana.com/blog/2024/01/30/how-to-set-up-performance-thresholds-in-k6/
 * - https://sre.google/sre-book/monitoring-distributed-systems/ (The Four Golden Signals)
 *
 * 10% regression threshold is a common starting point for CI gates:
 * - Tight enough to catch meaningful regressions
 * - Loose enough to tolerate infrastructure variance (especially in containerised environments)
 */

import * as fs from "fs";
import * as path from "path";

interface Summary {
  metrics: {
    http_reqs: {
      values: {
        rate: number;
      };
    };
    http_req_duration: {
      values: {
        "p(90)": number;
      };
    };
    http_req_failed: {
      values: {
        rate: number;
      };
    };
  };
}

interface Baseline {
  baseline: {
    http_req_duration_p90_ms: number;
    http_req_duration_p95_ms: number;
    http_req_waiting_p95_ms: number;
    group_duration_p95_ms: number;
    iteration_duration_p95_ms: number;
    http_reqs_rate: number;
  };
}

interface ComparisonResult {
  metric: string;
  baselineValue: string;
  currentValue: string;
  diffPercent: number;
  exceeded: boolean;
}

const THRESHOLD = 10;

const summaryFile = path.resolve(__dirname, "..", "results", "summary.json");
const baselineFile = path.resolve(__dirname, "..", "baseline.json");

if (!fs.existsSync(summaryFile)) {
  console.log("⚠️ No summary.json found — skipping comparison.");
  process.exit(0);
}

if (!fs.existsSync(baselineFile)) {
  console.log("⚠️ No baseline.json found — skipping comparison. Run a load test and commit a baseline first.");
  process.exit(0);
}

const summary: Summary = JSON.parse(fs.readFileSync(summaryFile, "utf-8"));
const baseline: Baseline = JSON.parse(fs.readFileSync(baselineFile, "utf-8"));

const formatDiff = (diff: number) => `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`;

const results: ComparisonResult[] = [];

// Latency: p90 from summary vs baseline
const currentP90 = summary.metrics.http_req_duration.values["p(90)"];
const baselineP90 = baseline.baseline.http_req_duration_p90_ms;
const p90Diff = ((currentP90 - baselineP90) / baselineP90) * 100;
results.push({
  metric: "http_req_duration p90",
  baselineValue: `${baselineP90.toFixed(2)} ms`,
  currentValue: `${currentP90.toFixed(2)} ms`,
  diffPercent: p90Diff,
  exceeded: p90Diff > THRESHOLD,
});

// Error rate
const currentErrorRate = summary.metrics.http_req_failed.values.rate * 100;
const baselineErrorRate = 0; // baseline assumes 0% errors
const errorDiff = currentErrorRate > 0 ? 100 : 0;
results.push({
  metric: "http_req_failed error rate",
  baselineValue: `${baselineErrorRate.toFixed(2)}%`,
  currentValue: `${currentErrorRate.toFixed(2)}%`,
  diffPercent: errorDiff,
  exceeded: currentErrorRate > 0,
});

// Throughput: rate drop is bad (negative change)
const currentRate = summary.metrics.http_reqs.values.rate;
const baselineRate = baseline.baseline.http_reqs_rate;
const rateDiff = ((currentRate - baselineRate) / baselineRate) * 100;
results.push({
  metric: "http_reqs rate",
  baselineValue: `${baselineRate.toFixed(2)} req/s`,
  currentValue: `${currentRate.toFixed(2)} req/s`,
  diffPercent: rateDiff,
  exceeded: rateDiff < -THRESHOLD,
});

for (const r of results) {
  const flag = r.exceeded ? "⚠️" : "✅";
  console.log(`\n${flag} ${r.metric}`);
  console.log(`  Baseline: ${r.baselineValue}`);
  console.log(`  Current:  ${r.currentValue}`);
  console.log(`  Difference: ${formatDiff(r.diffPercent)}`);
}

const exceeded = results.filter((r) => r.exceeded);
console.log("\n--- Result ---");
if (exceeded.length > 0) {
  console.log(`❌ FAIL: ${exceeded.length} metric(s) exceeded ${THRESHOLD}% threshold:`);
  for (const r of exceeded) {
    console.log(`  - ${r.metric}: ${formatDiff(r.diffPercent)}`);
  }
  process.exit(1);
} else {
  console.log(`✅ PASS: All metrics within ${THRESHOLD}% threshold.`);
}
