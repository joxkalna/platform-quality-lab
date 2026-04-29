/**
 * Performance regression notification.
 * Decision: "Latency regressed beyond threshold — investigate before merge."
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { postToSlack, header, section, context, pipelineUrl, branch } from "./slack";

interface Summary {
  metrics: {
    http_reqs: { values: { rate: number } };
    http_req_duration: { values: { "p(90)": number } };
    http_req_failed: { values: { rate: number } };
  };
}

interface Baseline {
  baseline: {
    http_req_duration_p90_ms: number;
    http_reqs_rate: number;
  };
}

const summaryFile = resolve(__dirname, "..", "..", "tests", "load", "results", "summary.json");
const baselineFile = resolve(__dirname, "..", "..", "tests", "load", "baseline.json");

if (!existsSync(summaryFile) || !existsSync(baselineFile)) {
  console.log("⚠️ Missing summary or baseline — skipping notification.");
  process.exit(0);
}

const summary: Summary = JSON.parse(readFileSync(summaryFile, "utf-8"));
const baseline: Baseline = JSON.parse(readFileSync(baselineFile, "utf-8"));

const THRESHOLD = 10;

const p90Current = summary.metrics.http_req_duration.values["p(90)"];
const p90Baseline = baseline.baseline.http_req_duration_p90_ms;
const p90Diff = ((p90Current - p90Baseline) / p90Baseline) * 100;
const p90Exceeded = p90Diff > THRESHOLD;

const errorRate = summary.metrics.http_req_failed.values.rate * 100;
const errorsExceeded = errorRate > 0;

const rateNow = summary.metrics.http_reqs.values.rate;
const rateBaseline = baseline.baseline.http_reqs_rate;
const rateDiff = ((rateNow - rateBaseline) / rateBaseline) * 100;
const rateExceeded = rateDiff < -THRESHOLD;

if (!p90Exceeded && !errorsExceeded && !rateExceeded) {
  console.log("✅ No regression — skipping Slack notification.");
  process.exit(0);
}

const breaches: string[] = [];
if (p90Exceeded) breaches.push(`p90 latency +${p90Diff.toFixed(0)}% (threshold ±${THRESHOLD}%)`);
if (errorsExceeded) breaches.push(`error rate ${errorRate.toFixed(1)}% (baseline 0%)`);
if (rateExceeded) breaches.push(`throughput ${rateDiff.toFixed(0)}% (threshold ±${THRESHOLD}%)`);

const url = pipelineUrl();
const footer = [branch(), url ? `<${url}|View k6 results>` : ""].filter(Boolean).join(" · ");

postToSlack([
  header("⚠️ Performance Regression Detected"),
  section(breaches.map((b) => `• ${b}`).join("\n")),
  section("_Investigate before merge_"),
  ...(footer ? [context(`➡️ ${footer}`)] : []),
], `⚠️ Performance regression: ${breaches[0]}`).catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
