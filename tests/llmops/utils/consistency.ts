import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { classify, loadGoldenSet } from "./evaluate";
import type { GoldenCase } from "./types";

export interface ConsistencyCaseResult {
  id: string;
  input: string;
  categories: string[];
  confidences: number[];
  categoryAgreement: number;
  confidenceVariance: number;
  stable: boolean;
}

export interface ConsistencyResult {
  timestamp: string;
  runsPerCase: number;
  casesChecked: number;
  stable: number;
  unstable: number;
  stabilityRate: number;
  results: ConsistencyCaseResult[];
}

const RESULTS_DIR = path.resolve(__dirname, "..", "results");

export function loadObviousCases(): GoldenCase[] {
  return loadGoldenSet().filter((c) => c.tags.includes("obvious"));
}

async function runCase(tc: GoldenCase, runsPerCase: number): Promise<ConsistencyCaseResult> {
  const runs = await Promise.all(
    Array.from({ length: runsPerCase }, () => classify(tc.input))
  );

  const categories = runs.map((r) => r.category);
  const confidences = runs.map((r) => r.confidence);

  return {
    id: tc.id,
    input: tc.input,
    categories,
    confidences,
    categoryAgreement: categoryAgreement(categories),
    confidenceVariance: standardDeviation(confidences),
    stable: categoryAgreement(categories) === 1,
  };
}

function summarise(results: ConsistencyCaseResult[], runsPerCase: number): ConsistencyResult {
  const stableCount = results.filter((r) => r.stable).length;

  return {
    timestamp: new Date().toISOString(),
    runsPerCase,
    casesChecked: results.length,
    stable: stableCount,
    unstable: results.length - stableCount,
    stabilityRate: stableCount / results.length,
    results,
  };
}

export async function evaluateConsistency(
  cases: GoldenCase[],
  runsPerCase: number
): Promise<ConsistencyResult> {
  const results: ConsistencyCaseResult[] = [];
  for (const tc of cases) {
    results.push(await runCase(tc, runsPerCase));
  }
  return summarise(results, runsPerCase);
}

export function writeConsistencyResults(result: ConsistencyResult): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(RESULTS_DIR, "consistency.json"), JSON.stringify(result, null, 2));
}

function categoryAgreement(categories: string[]): number {
  const counts = new Map<string, number>();
  for (const c of categories) counts.set(c, (counts.get(c) || 0) + 1);
  const maxCount = Math.max(...counts.values());
  return maxCount / categories.length;
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}
