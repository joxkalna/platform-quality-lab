/**
 * LLMOps accuracy drift detection notification.
 * Compares latest run against 7-day rolling average.
 * Used on main after trend extraction — non-blocking, Slack alert only.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { postToSlack, header, section, context, pipelineUrl, branch } from "../notify/slack";

const DRIFT_THRESHOLD_PERCENT = 10;

type TrendEntry = {
  date: string;
  branch: string;
  model: string;
  accuracy: number;
  rejections: { count: number };
};

const trendFile = resolve(__dirname, "..", "..", "docs", "dashboard", "llmops-trend.json");

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

const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const recentEntries = trend
  .slice(0, -1)
  .filter((e) => new Date(e.date) >= sevenDaysAgo);

if (recentEntries.length === 0) {
  console.log("⚠️ No entries in 7-day window — skipping.");
  process.exit(0);
}

const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

const avgAccuracy = avg(recentEntries.map((e) => e.accuracy));
const avgRejections = avg(recentEntries.map((e) => e.rejections.count));

const drifts: { metric: string; current: number; average: number; pctChange: number }[] = [];

if (avgAccuracy > 0) {
  const pctChange = ((latest.accuracy - avgAccuracy) / avgAccuracy) * 100;
  if (pctChange < -DRIFT_THRESHOLD_PERCENT) {
    drifts.push({
      metric: "accuracy",
      current: latest.accuracy,
      average: avgAccuracy,
      pctChange,
    });
  }
}

if (latest.rejections.count > avgRejections && latest.rejections.count > 0) {
  drifts.push({
    metric: "rejections",
    current: latest.rejections.count,
    average: avgRejections,
    pctChange: avgRejections > 0
      ? ((latest.rejections.count - avgRejections) / avgRejections) * 100
      : 100,
  });
}

if (drifts.length === 0) {
  console.log("✅ No drift detected — accuracy within 7-day average.");
  process.exit(0);
}

const lines = drifts.map((d) => {
  if (d.metric === "accuracy") {
    return `• accuracy: ${(d.current * 100).toFixed(1)}% → ${d.pctChange.toFixed(0)}% vs 7-day avg (${(d.average * 100).toFixed(1)}%)`;
  }
  return `• rejections: ${d.current} → +${d.pctChange.toFixed(0)}% vs 7-day avg (${d.average.toFixed(1)})`;
});

const url = pipelineUrl();
const footer = [branch(), url ? `<${url}|View run>` : ""].filter(Boolean).join(" · ");

postToSlack(
  [
    header("📉 LLMOps Accuracy Drift Detected"),
    section(`Model: ${latest.model}`),
    section(lines.join("\n")),
    section(
      `_${DRIFT_THRESHOLD_PERCENT}% drop threshold over 7-day rolling average (${recentEntries.length} data points)_`
    ),
    ...(footer ? [context(`➡️ ${footer}`)] : []),
  ],
  `📉 LLMOps drift: ${drifts[0].metric} ${drifts[0].pctChange.toFixed(0)}%`
).catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
