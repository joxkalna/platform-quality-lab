import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { ClassificationResult } from "../../../services/service-c/src/types";
import type { GoldenCase, CaseResult, EvaluationResult, CategoryStats } from "./types";

export type { GoldenCase, CaseResult, EvaluationResult, CategoryStats };

// --- Config ---

const SERVICE_C_URL = process.env.SERVICE_C_URL || "http://localhost:3002";
const RESULTS_DIR = path.resolve(__dirname, "..", "results");
const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures");

// --- Core ---

export function loadGoldenSet(): GoldenCase[] {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, "golden-set.json"), "utf-8"));
}

export async function classify(text: string): Promise<ClassificationResult> {
  const res = await fetch(`${SERVICE_C_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`/classify returned ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<ClassificationResult>;
}

export async function evaluateGoldenSet(cases: GoldenCase[]): Promise<EvaluationResult> {
  const results: CaseResult[] = [];
  let model = "unknown";

  for (const tc of cases) {
    try {
      const res = await classify(tc.input);
      model = res.model;
      results.push({
        id: tc.id,
        input: tc.input,
        expected: tc.expectedCategory,
        acceptable: tc.acceptableCategories,
        actual: res.category,
        confidence: res.confidence,
        pass: tc.acceptableCategories.includes(res.category),
        tags: tc.tags,
      });
    } catch {
      results.push({
        id: tc.id,
        input: tc.input,
        expected: tc.expectedCategory,
        acceptable: tc.acceptableCategories,
        actual: "ERROR",
        confidence: 0,
        pass: false,
        tags: tc.tags,
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const accuracy = passed / results.length;

  const categories = ["critical", "warning", "info", "ok"];
  const perCategory: Record<string, CategoryStats> = {};
  for (const cat of categories) {
    const catCases = results.filter((r) => r.expected === cat);
    const catPassed = catCases.filter((r) => r.pass).length;
    perCategory[cat] = {
      total: catCases.length,
      passed: catPassed,
      accuracy: catCases.length > 0 ? catPassed / catCases.length : 0,
    };
  }

  return {
    timestamp: new Date().toISOString(),
    model,
    totalCases: results.length,
    passed,
    accuracy,
    perCategory,
    failures: results.filter((r) => !r.pass),
  };
}

export function writeResults(result: EvaluationResult): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(RESULTS_DIR, "evaluation.json"), JSON.stringify(result, null, 2));
}
