/**
 * Extract key metrics from k6 summary.json and append to trend.json.
 * Run after each load/regression test to build historical data.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface TrendEntry {
  date: string;
  branch: string;
  p90_ms: number;
  p95_ms: number;
  req_rate: number;
  error_rate: number;
}

const summaryFile = resolve(process.cwd(), "tests", "load", "results", "summary.json");
const trendFile = resolve(process.cwd(), "docs", "dashboard", "trend.json");

if (!existsSync(summaryFile)) {
  console.log("⚠️ No summary.json — skipping trend extraction.");
  process.exit(0);
}

const summary = JSON.parse(readFileSync(summaryFile, "utf-8"));

const entry: TrendEntry = {
  date: new Date().toISOString().split("T")[0],
  branch: process.env.GITHUB_REF_NAME || "local",
  p90_ms: summary.metrics.http_req_duration.values["p(90)"],
  p95_ms: summary.metrics.http_req_duration.values["p(95)"],
  req_rate: summary.metrics.http_reqs.values.rate,
  error_rate: summary.metrics.http_req_failed.values.rate * 100,
};

const trend: TrendEntry[] = existsSync(trendFile)
  ? JSON.parse(readFileSync(trendFile, "utf-8"))
  : [];

trend.push(entry);

writeFileSync(trendFile, JSON.stringify(trend, null, 2));
console.log(`✅ Trend updated: ${trend.length} entries (p90: ${entry.p90_ms.toFixed(2)}ms, rate: ${entry.req_rate.toFixed(1)} req/s)`);
