import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { ClassificationResult } from "../../../services/service-c/src/types";
import type { GoldenCase, EvaluationResult } from "./types";

export type { GoldenCase, EvaluationResult };

const SERVICE_C_URL = process.env.SERVICE_C_URL || "http://localhost:3002";
const RESULTS_DIR = path.resolve(__dirname, "..", "results");
const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures");

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

export function writeResults(result: EvaluationResult): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(RESULTS_DIR, "evaluation.json"), JSON.stringify(result, null, 2));
}
