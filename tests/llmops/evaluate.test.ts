import { describe, it, expect, beforeAll } from "vitest";
import { loadGoldenSet, classify, writeResults, EvaluationResult } from "./utils/evaluate";
import { VALID_CATEGORIES, Category } from "../../services/service-c/src/types";
import type { GoldenCase, CaseResult, CategoryStats } from "./utils/types";

const ACCURACY_THRESHOLD = parseFloat(process.env.LLMOPS_ACCURACY_THRESHOLD || "0.6");

async function runGoldenSetEvaluation(): Promise<EvaluationResult> {
  const goldenSet = loadGoldenSet();
  const results: CaseResult[] = [];
  let model = "unknown";

  for (const tc of goldenSet) {
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
  const perCategory: Record<string, CategoryStats> = {};

  for (const cat of ["critical", "warning", "info", "ok"]) {
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
    accuracy: passed / results.length,
    perCategory,
    failures: results.filter((r) => !r.pass),
  };
}

describe("LLMOps — Golden Set Evaluation", () => {
  let evaluation: EvaluationResult;

  beforeAll(async () => {
    evaluation = await runGoldenSetEvaluation();
    writeResults(evaluation);
  });

  it("classifies all golden set cases above accuracy threshold", () => {
    expect(evaluation.accuracy).toBeGreaterThanOrEqual(ACCURACY_THRESHOLD);
  });

  it("no responses contain hallucinated categories", () => {
    const hallucinations = evaluation.failures.filter(
      (f) => f.actual !== "ERROR" && !VALID_CATEGORIES.includes(f.actual as Category)
    );
    expect(hallucinations).toHaveLength(0);
  });
});
