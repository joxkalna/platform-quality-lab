/**
 * Append Lighthouse results to dashboard trend data.
 *
 * Reads summary.json, classifies metrics (good/needs-improvement/poor),
 * appends to docs/dashboard/lighthouse-trend.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LighthouseResults } from "../../tests/lighthouse/utils/runner";

const summaryFile = resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "lighthouse",
  "results",
  "summary.json"
);
const trendFile = resolve(
  __dirname,
  "..",
  "..",
  "docs",
  "dashboard",
  "lighthouse-trend.json"
);

if (!existsSync(summaryFile)) {
  console.log("⚠️ No Lighthouse summary — skipping trend extraction.");
  process.exit(0);
}

const results: LighthouseResults = JSON.parse(
  readFileSync(summaryFile, "utf-8")
);

type Status = "good" | "needs-improvement" | "poor";

function classifyLcp(ms: number): Status {
  if (ms <= 2500) return "good";
  if (ms <= 4000) return "needs-improvement";
  return "poor";
}

function classifyCls(value: number): Status {
  if (value <= 0.1) return "good";
  if (value <= 0.25) return "needs-improvement";
  return "poor";
}

function classifyTbt(ms: number): Status {
  if (ms <= 300) return "good";
  if (ms <= 600) return "needs-improvement";
  return "poor";
}


const classifyInpMs = results.interactions["result-displayed"]?.inp ?? 0;

const entry = {
  date: new Date().toISOString().split("T")[0],
  branch: process.env.GITHUB_REF_NAME || "local",
  lcp_ms: Math.round(results.navigation.lcp),
  lcp_status: classifyLcp(results.navigation.lcp),
  cls: Number(results.navigation.cls.toFixed(3)),
  cls_status: classifyCls(results.navigation.cls),
  tbt_ms: Math.round(results.navigation.tbt),
  tbt_status: classifyTbt(results.navigation.tbt),
  fcp_ms: Math.round(results.navigation.fcp),
  classify_inp_ms: Math.round(classifyInpMs),
};

const trend = existsSync(trendFile)
  ? JSON.parse(readFileSync(trendFile, "utf-8"))
  : [];

trend.push(entry);

writeFileSync(trendFile, JSON.stringify(trend, null, 2));
console.log(`✅ Lighthouse trend appended (${entry.date}, LCP: ${entry.lcp_ms}ms, CLS: ${entry.cls})`);
