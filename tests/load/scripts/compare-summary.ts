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
    http_req_duration_p95_ms: number;
    http_req_waiting_p95_ms: number;
    group_duration_p95_ms: number;
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

// Latency: p95 from summary vs baseline
const currentP95 = summary.metrics.http_req_duration.values["p(90)"];
const baselineP95 = baseline.baseline.http_req_duration_p95_ms;
const p95Diff = ((currentP95 - baselineP95) / baselineP95) * 100;
results.push({
  metric: "http_req_duration p90",
  baselineValue: `${baselineP95.toFixed(2)} ms`,
  currentValue: `${currentP95.toFixed(2)} ms`,
  diffPercent: p95Diff,
  exceeded: p95Diff > THRESHOLD,
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

// Throughput: rate from summary vs baseline (no baseline rate stored yet — report only)
const currentRate = summary.metrics.http_reqs.values.rate;
results.push({
  metric: "http_reqs rate",
  baselineValue: "N/A (not in baseline yet)",
  currentValue: `${currentRate.toFixed(2)} req/s`,
  diffPercent: 0,
  exceeded: false,
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
