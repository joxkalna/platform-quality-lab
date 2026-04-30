import { describe, it, expect } from "vitest";
import { loadGoldenSet, evaluateGoldenSet, writeResults, EvaluationResult } from "./utils/evaluate";
import { VALID_CATEGORIES, Category } from "../../services/service-c/src/types";

const ACCURACY_THRESHOLD = parseFloat(process.env.LLMOPS_ACCURACY_THRESHOLD || "0.6");

describe("LLMOps — Golden Set Evaluation", () => {
  let evaluation: EvaluationResult;

  it("classifies all golden set cases above accuracy threshold", async () => {
    const goldenSet = loadGoldenSet();
    evaluation = await evaluateGoldenSet(goldenSet);
    writeResults(evaluation);

    expect(
      evaluation.accuracy,
      `Accuracy ${(evaluation.accuracy * 100).toFixed(1)}% below threshold ${(ACCURACY_THRESHOLD * 100).toFixed(1)}%`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLD);
  });

  it("no responses contain hallucinated categories", () => {
    const hallucinations = evaluation.failures.filter(
      f => !VALID_CATEGORIES.includes(f.actual as Category)
    );
    expect(hallucinations).toHaveLength(0);
  });
});
