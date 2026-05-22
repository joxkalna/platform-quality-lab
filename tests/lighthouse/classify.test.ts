import { describe, it, expect, beforeAll } from "vitest";
import { runLighthouse, type LighthouseResults } from "./utils/runner";
import { runClassifyFlow } from "./flows/classify";
import { budgets } from "./config/thresholds";

const URL = process.env.LIGHTHOUSE_URL || "http://localhost:5173";

describe("Lighthouse — Classify Flow", () => {
  let results: LighthouseResults;

  beforeAll(async () => {
    results = await runLighthouse(URL, runClassifyFlow);
  });

  describe("navigation budgets", () => {
    it("LCP within budget", () => {
      expect(results.navigation.lcp).toBeLessThanOrEqual(budgets.navigation.lcp);
    });

    it("CLS within budget", () => {
      expect(results.navigation.cls).toBeLessThanOrEqual(budgets.navigation.cls);
    });

    it("TBT within budget", () => {
      expect(results.navigation.tbt).toBeLessThanOrEqual(budgets.navigation.tbt);
    });

    it("FCP within budget", () => {
      expect(results.navigation.fcp).toBeLessThanOrEqual(budgets.navigation.fcp);
    });
  });

  describe("interaction budgets", () => {
    for (const [name, budget] of Object.entries(budgets.interactions)) {
      describe(`${name} (owner: ${budget.owner})`, () => {
        it("INP within budget", () => {
          expect(results.interactions[name].inp).toBeLessThanOrEqual(budget.inp);
        });

        it("TBT within budget", () => {
          expect(results.interactions[name].tbt).toBeLessThanOrEqual(budget.tbt);
        });

        it("CLS within budget", () => {
          expect(results.interactions[name].cls).toBeLessThanOrEqual(budget.cls);
        });
      });
    }
  });
});
