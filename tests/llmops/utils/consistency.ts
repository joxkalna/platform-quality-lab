import { mkdirSync, writeFileSync } from "fs";
import path from "path";

export interface ConsistencyCaseResult {
  id: string;
  input: string;
  categories: string[];
  confidences: number[];
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

export function writeConsistencyResults(result: ConsistencyResult): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(RESULTS_DIR, "consistency.json"), JSON.stringify(result, null, 2));
}
