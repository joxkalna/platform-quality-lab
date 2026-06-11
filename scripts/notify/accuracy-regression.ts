/**
 * LLMOps accuracy regression notification.
 * Decision: "Accuracy regressed beyond threshold — investigate before merge."
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { postToSlack, header, section, context, pipelineUrl, branch } from "./slack";

interface Evaluation {
  model: string;
  accuracy: number;
  perCategory: Record<string, { accuracy: number }>;
  failures: { actual: string }[];
}

interface Baseline {
  baseline: {
    accuracy: number;
    perCategory: Record<string, number>;
    maxRejections: number;
  };
}

const evaluationFile = resolve(__dirname, "..", "..", "tests", "llmops", "results", "evaluation.json");
const baselineFile = resolve(__dirname, "..", "..", "tests", "llmops", "baseline.json");

if (!existsSync(evaluationFile) || !existsSync(baselineFile)) {
  console.log("⚠️ Missing evaluation or baseline — skipping notification.");
  process.exit(0);
}

const evaluation: Evaluation = JSON.parse(readFileSync(evaluationFile, "utf-8"));
const baseline: Baseline = JSON.parse(readFileSync(baselineFile, "utf-8"));

const THRESHOLD = 10;

const baselineAccuracy = baseline.baseline.accuracy;
const accuracyDiff = ((evaluation.accuracy - baselineAccuracy) / baselineAccuracy) * 100;
const accuracyExceeded = accuracyDiff < -THRESHOLD;

const rejectionCount = evaluation.failures.filter((f) => f.actual === "ERROR").length;
const rejectionsExceeded = rejectionCount > baseline.baseline.maxRejections;

const categoryBreaches: string[] = [];
for (const [category, baselineCatAccuracy] of Object.entries(baseline.baseline.perCategory)) {
  const current = evaluation.perCategory[category];
  if (!current) continue;
  const catDiff = ((current.accuracy - baselineCatAccuracy) / baselineCatAccuracy) * 100;
  if (catDiff < -THRESHOLD) {
    categoryBreaches.push(`${category} ${catDiff.toFixed(0)}% (threshold ±${THRESHOLD}%)`);
  }
}

if (!accuracyExceeded && !rejectionsExceeded && categoryBreaches.length === 0) {
  console.log("✅ No regression — skipping Slack notification.");
  process.exit(0);
}

const breaches: string[] = [];
if (accuracyExceeded) {
  breaches.push(`overall accuracy ${accuracyDiff.toFixed(0)}% (threshold ±${THRESHOLD}%)`);
}
if (rejectionsExceeded) {
  breaches.push(`rejections ${rejectionCount} (baseline ${baseline.baseline.maxRejections})`);
}
breaches.push(...categoryBreaches.map((b) => `per-category ${b}`));

const url = pipelineUrl();
const footer = [branch(), url ? `<${url}|View LLMOps results>` : ""].filter(Boolean).join(" · ");

postToSlack(
  [
    header("⚠️ LLMOps Accuracy Regression Detected"),
    section(`Model: ${evaluation.model}`),
    section(breaches.map((b) => `• ${b}`).join("\n")),
    section("_Investigate before merge_"),
    ...(footer ? [context(`➡️ ${footer}`)] : []),
  ],
  `⚠️ LLMOps regression: ${breaches[0]}`
).catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
