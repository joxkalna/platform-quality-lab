/**
 * Lighthouse drift detection notification.
 * Compares latest run against 7-day rolling average.
 * Used by synthetic monitoring (cron), not CI gate.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  postToSlack,
  header,
  section,
  context,
  pipelineUrl,
  branch,
} from "../notify/slack";

const DRIFT_THRESHOLD_PERCENT = 25;

interface TrendEntry {
  date: string;
  branch: string;
  lcp_ms: number;
  cls: number;
  tbt_ms: number;
  fcp_ms: number;
  classify_inp_ms: number;
}

const trendFile = resolve(
  __dirname,
  "..",
  "..",
  "docs",
  "dashboard",
  "lighthouse-trend.json"
);

if (!existsSync(trendFile)) {
  console.log("⚠️ No trend data — skipping drift detection.");
  process.exit(0);
}

const trend: TrendEntry[] = JSON.parse(readFileSync(trendFile, "utf-8"));

if (trend.length < 3) {
  console.log("⚠️ Not enough data points for drift detection (need ≥3).");
  process.exit(0);
}

const latest = trend[trend.length - 1];

// 7-day rolling average (exclude latest)
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const recentEntries = trend
  .slice(0, -1)
  .filter((e) => new Date(e.date) >= sevenDaysAgo);

if (recentEntries.length === 0) {
  console.log("⚠️ No entries in 7-day window — skipping.");
  process.exit(0);
}

const avg = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;

const avgLcp = avg(recentEntries.map((e) => e.lcp_ms));
const avgCls = avg(recentEntries.map((e) => e.cls));
const avgTbt = avg(recentEntries.map((e) => e.tbt_ms));
const avgInp = avg(recentEntries.map((e) => e.classify_inp_ms));

interface Drift {
  metric: string;
  current: number;
  average: number;
  pctChange: number;
}

const drifts: Drift[] = [];

function checkDrift(metric: string, current: number, average: number) {
  if (average === 0) return;
  const pctChange = ((current - average) / average) * 100;
  if (pctChange > DRIFT_THRESHOLD_PERCENT) {
    drifts.push({ metric, current, average, pctChange });
  }
}

checkDrift("LCP", latest.lcp_ms, avgLcp);
checkDrift("TBT", latest.tbt_ms, avgTbt);
checkDrift("Classify INP", latest.classify_inp_ms, avgInp);

// CLS uses absolute difference (it's already a ratio)
if (latest.cls - avgCls > 0.05) {
  drifts.push({
    metric: "CLS",
    current: latest.cls,
    average: avgCls,
    pctChange: ((latest.cls - avgCls) / (avgCls || 0.001)) * 100,
  });
}

if (drifts.length === 0) {
  console.log("✅ No drift detected — all metrics within 7-day average.");
  // Signal to CI that no drift was detected
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, "DRIFT_DETECTED=false\n", {
      flag: "a",
    });
  }
  process.exit(0);
}

// Signal drift detected
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, "DRIFT_DETECTED=true\n", {
    flag: "a",
  });
}

const lines = drifts.map(
  (d) =>
    `• ${d.metric}: ${Math.round(d.current)}ms → +${d.pctChange.toFixed(0)}% vs 7-day avg (${Math.round(d.average)}ms)`
);

const url = pipelineUrl();
const footer = [branch(), url ? `<${url}|View run>` : ""]
  .filter(Boolean)
  .join(" · ");

postToSlack(
  [
    header("📈 Lighthouse Drift Detected"),
    section(lines.join("\n")),
    section(
      `_${DRIFT_THRESHOLD_PERCENT}% threshold over 7-day rolling average (${recentEntries.length} data points)_`
    ),
    ...(footer ? [context(`➡️ ${footer}`)] : []),
  ],
  `📈 Lighthouse drift: ${drifts[0].metric} +${drifts[0].pctChange.toFixed(0)}%`
).catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
