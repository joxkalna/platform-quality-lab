/**
 * Extract LLMOps evaluation results and append to llmops-trend.json.
 * Run after golden set evaluation to build historical accuracy data.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface LLMOpsTrendEntry {
  date: string;
  branch: string;
  model: string;
  totalCases: number;
  passed: number;
  accuracy: number;
  perCategory: Record<string, { total: number; passed: number; accuracy: number }>;
  failures: { id: string; input: string; expected: string; actual: string }[];
}

const evaluationFile = resolve(process.cwd(), "tests", "llmops", "results", "evaluation.json");
const trendFile = resolve(process.cwd(), "docs", "dashboard", "llmops-trend.json");

if (!existsSync(evaluationFile)) {
  console.log("⚠️ No evaluation.json — skipping LLMOps trend extraction.");
  process.exit(0);
}

const evaluation = JSON.parse(readFileSync(evaluationFile, "utf-8"));

const entry: LLMOpsTrendEntry = {
  date: new Date().toISOString().split("T")[0],
  branch: process.env.GITHUB_REF_NAME || "local",
  model: evaluation.model,
  totalCases: evaluation.totalCases,
  passed: evaluation.passed,
  accuracy: evaluation.accuracy,
  perCategory: evaluation.perCategory,
  failures: evaluation.failures.map((f: { id: string; input: string; expected: string; actual: string }) => ({
    id: f.id,
    input: f.input,
    expected: f.expected,
    actual: f.actual,
  })),
};

const trend: LLMOpsTrendEntry[] = existsSync(trendFile)
  ? JSON.parse(readFileSync(trendFile, "utf-8"))
  : [];

trend.push(entry);

writeFileSync(trendFile, JSON.stringify(trend, null, 2));
console.log(`✅ LLMOps trend updated: ${trend.length} entries (accuracy: ${(entry.accuracy * 100).toFixed(1)}%, model: ${entry.model})`);
