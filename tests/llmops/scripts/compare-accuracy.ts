/**
 * Regression analysis — compares current LLMOps evaluation against committed baseline.
 *
 * 10% regression threshold matches k6 and Lighthouse patterns in this repo.
 */

import * as fs from "fs";
import * as path from "path";

interface Evaluation {
  model: string;
  totalCases: number;
  passed: number;
  accuracy: number;
  perCategory: Record<string, { total: number; passed: number; accuracy: number }>;
  failures: { actual: string }[];
}

interface Baseline {
  baseline: {
    accuracy: number;
    perCategory: Record<string, number>;
    maxRejections: number;
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

const evaluationFile = path.resolve(__dirname, "..", "results", "evaluation.json");
const baselineFile = path.resolve(__dirname, "..", "baseline.json");

if (!fs.existsSync(evaluationFile)) {
  console.log("⚠️ No evaluation.json found — skipping comparison.");
  process.exit(0);
}

if (!fs.existsSync(baselineFile)) {
  console.log("⚠️ No baseline.json found — skipping comparison. Run evaluation and commit a baseline first.");
  process.exit(0);
}

const evaluation: Evaluation = JSON.parse(fs.readFileSync(evaluationFile, "utf-8"));
const baseline: Baseline = JSON.parse(fs.readFileSync(baselineFile, "utf-8"));

const formatDiff = (diff: number) => `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`;

const results: ComparisonResult[] = [];

// Overall accuracy: drop >10% vs baseline is bad
const baselineAccuracy = baseline.baseline.accuracy;
const accuracyDiff = ((evaluation.accuracy - baselineAccuracy) / baselineAccuracy) * 100;
results.push({
  metric: "overall accuracy",
  baselineValue: `${(baselineAccuracy * 100).toFixed(1)}%`,
  currentValue: `${(evaluation.accuracy * 100).toFixed(1)}%`,
  diffPercent: accuracyDiff,
  exceeded: accuracyDiff < -THRESHOLD,
});

// Rejections (ERROR responses)
const rejectionCount = evaluation.failures.filter((f) => f.actual === "ERROR").length;
const maxRejections = baseline.baseline.maxRejections;
results.push({
  metric: "rejections (ERROR)",
  baselineValue: `${maxRejections}`,
  currentValue: `${rejectionCount}`,
  diffPercent: rejectionCount > maxRejections ? 100 : 0,
  exceeded: rejectionCount > maxRejections,
});

// Per-category accuracy drops
for (const [category, baselineCatAccuracy] of Object.entries(baseline.baseline.perCategory)) {
  const current = evaluation.perCategory[category];
  if (!current || current.total === 0) continue;

  const catDiff = ((current.accuracy - baselineCatAccuracy) / baselineCatAccuracy) * 100;
  results.push({
    metric: `${category} accuracy`,
    baselineValue: `${(baselineCatAccuracy * 100).toFixed(1)}%`,
    currentValue: `${(current.accuracy * 100).toFixed(1)}%`,
    diffPercent: catDiff,
    exceeded: catDiff < -THRESHOLD,
  });
}

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
