import { beforeAll, describe, expect, it } from "vitest";
import { Category, VALID_CATEGORIES } from "../../services/service-c/src/types";
import { ConsistencyCaseResult, ConsistencyResult, writeConsistencyResults } from "./utils/consistency";
import { classify, loadGoldenSet } from "./utils/evaluate";

const RUNS_PER_CASE = parseInt(process.env.LLMOPS_CONSISTENCY_RUNS || "5", 10);
const MAX_CONFIDENCE_VARIANCE = parseFloat(process.env.LLMOPS_MAX_CONFIDENCE_VARIANCE || "0.3");
const STABILITY_THRESHOLD = parseFloat(process.env.LLMOPS_STABILITY_THRESHOLD || "0.8");

async function runConsistencyEvaluation(): Promise<ConsistencyResult> {
  const obviousCases = loadGoldenSet().filter((c) => c.tags.includes("obvious"));
  const caseResults: ConsistencyCaseResult[] = [];

  for (const tc of obviousCases) {
    const runs = await Promise.all(
      Array.from({ length: RUNS_PER_CASE }, async () => {
        try {
          return await classify(tc.input);
        } catch {
          return { category: "ERROR", confidence: 0, model: "unknown" };
        }
      })
    );

    const categories = runs.map((r) => r.category);
    const confidences = runs.map((r) => r.confidence);

    caseResults.push({
      id: tc.id,
      input: tc.input,
      categories,
      confidences,
      stable: new Set(categories).size === 1,
    });
  }

  const stableCount = caseResults.filter((r) => r.stable).length;

  return {
    timestamp: new Date().toISOString(),
    runsPerCase: RUNS_PER_CASE,
    casesChecked: caseResults.length,
    stable: stableCount,
    unstable: caseResults.length - stableCount,
    stabilityRate: stableCount / caseResults.length,
    results: caseResults,
  };
}

describe("LLMOps — Consistency Tests", () => {
  let result: ConsistencyResult;

  beforeAll(async () => {
    result = await runConsistencyEvaluation();
    writeConsistencyResults(result);
  });

  it("obvious cases produce stable categories across multiple runs", () => {
    expect(result.stabilityRate).toBeGreaterThanOrEqual(STABILITY_THRESHOLD);
  });

  it("confidence variance stays within bounds", () => {
    const highVariance = result.results.filter((r) => {
      const mean = r.confidences.reduce((a, b) => a + b, 0) / r.confidences.length;
      const stdDev = Math.sqrt(r.confidences.reduce((sum, v) => sum + (v - mean) ** 2, 0) / r.confidences.length);
      return stdDev > MAX_CONFIDENCE_VARIANCE;
    });

    expect(highVariance).toHaveLength(0);
  });

  it("no hallucinated categories across any run", () => {
    const hallucinations = result.results.filter((r) =>
      r.categories.some((c) => c !== "ERROR" && !VALID_CATEGORIES.includes(c as Category))
    );

    expect(hallucinations).toHaveLength(0);
  });
});
