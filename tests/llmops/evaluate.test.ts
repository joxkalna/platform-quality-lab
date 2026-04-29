import { describe, it, expect } from "vitest";
import { loadGoldenSet, evaluateGoldenSet, writeResults, EvaluationResult } from "./evaluate";

const ACCURACY_THRESHOLD = parseFloat(process.env.LLMOPS_ACCURACY_THRESHOLD || "0.6");
const VALID_CATEGORIES = ["critical", "warning", "info", "ok"];

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

  it("all responses have valid structure", () => {
    for (const f of evaluation.failures) {
      if (f.actual === "ERROR") continue;
      expect(VALID_CATEGORIES).toContain(f.actual);
    }
  });
});
