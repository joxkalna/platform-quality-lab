import { describe, it, expect, beforeAll } from "vitest";
import { loadObviousCases, evaluateConsistency, writeConsistencyResults, ConsistencyResult } from "./utils/consistency";
import { VALID_CATEGORIES, Category } from "../../services/service-c/src/types";

const RUNS_PER_CASE = parseInt(process.env.LLMOPS_CONSISTENCY_RUNS || "5", 10);
const MAX_CONFIDENCE_VARIANCE = parseFloat(process.env.LLMOPS_MAX_CONFIDENCE_VARIANCE || "0.3");
const STABILITY_THRESHOLD = parseFloat(process.env.LLMOPS_STABILITY_THRESHOLD || "0.8");

describe("LLMOps — Consistency Tests", () => {
  let result: ConsistencyResult;

  beforeAll(async () => {
    const cases = loadObviousCases();
    result = await evaluateConsistency(cases, RUNS_PER_CASE);
    writeConsistencyResults(result);
  });

  it("obvious cases produce stable categories across multiple runs", () => {
    expect(result.stabilityRate).toBeGreaterThanOrEqual(STABILITY_THRESHOLD);
  });

  it("confidence variance stays within bounds", () => {
    const highVariance = result.results.filter((r) => r.confidenceVariance > MAX_CONFIDENCE_VARIANCE);
    expect(highVariance).toHaveLength(0);
  });

  it("no hallucinated categories across any run", () => {
    const hallucinations = result.results.filter((r) =>
      r.categories.some((c) => c !== "ERROR" && !VALID_CATEGORIES.includes(c as Category))
    );
    expect(hallucinations).toHaveLength(0);
  });
});
