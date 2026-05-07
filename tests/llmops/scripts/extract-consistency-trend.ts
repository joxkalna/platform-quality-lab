/**
 * Extract LLMOps consistency results and append to llmops-trend.json.
 * Adds consistency metrics alongside accuracy data for dashboard display.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface ConsistencyTrendEntry {
  date: string;
  branch: string;
  runsPerCase: number;
  casesChecked: number;
  stable: number;
  unstable: number;
  stabilityRate: number;
}

const consistencyFile = resolve(process.cwd(), "tests", "llmops", "results", "consistency.json");
const trendFile = resolve(process.cwd(), "docs", "dashboard", "consistency-trend.json");

if (!existsSync(consistencyFile)) {
  console.log("⚠️ No consistency.json — skipping consistency trend extraction.");
  process.exit(0);
}

const raw = JSON.parse(readFileSync(consistencyFile, "utf-8"));

const entry: ConsistencyTrendEntry = {
  date: new Date().toISOString().split("T")[0],
  branch: process.env.GITHUB_REF_NAME || "local",
  runsPerCase: raw.runsPerCase,
  casesChecked: raw.casesChecked,
  stable: raw.stable,
  unstable: raw.unstable,
  stabilityRate: raw.stabilityRate,
};

const trend: ConsistencyTrendEntry[] = existsSync(trendFile)
  ? JSON.parse(readFileSync(trendFile, "utf-8"))
  : [];

trend.push(entry);

writeFileSync(trendFile, JSON.stringify(trend, null, 2));
console.log(`✅ Consistency trend updated: ${trend.length} entries (stability: ${(entry.stabilityRate * 100).toFixed(1)}%, stable: ${entry.stable}/${entry.casesChecked})`);
