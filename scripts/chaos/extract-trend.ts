/**
 * Extract chaos experiment results and append to chaos-trend.json.
 * Run after chaos experiments to build historical pass/fail data.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

interface ChaosTrendEntry {
  date: string;
  branch: string;
  total: number;
  passed: number;
  failed: number;
  experiments: { name: string; service: string; passed: boolean }[];
}

const reportsDir = resolve(process.cwd(), "scripts", "chaos", "reports");
const trendFile = resolve(process.cwd(), "docs", "dashboard", "chaos-trend.json");

if (!existsSync(reportsDir)) {
  console.log("⚠️ No chaos reports directory — skipping trend extraction.");
  process.exit(0);
}

const reports = readdirSync(reportsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(reportsDir, f), "utf-8")));

if (reports.length === 0) {
  console.log("⚠️ No chaos reports found — skipping trend extraction.");
  process.exit(0);
}

const entry: ChaosTrendEntry = {
  date: new Date().toISOString().split("T")[0],
  branch: process.env.GITHUB_REF_NAME || "local",
  total: reports.length,
  passed: reports.filter((r) => r.passed).length,
  failed: reports.filter((r) => !r.passed).length,
  experiments: reports.map((r) => ({
    name: r.experiment,
    service: r.service,
    passed: r.passed,
  })),
};

const trend: ChaosTrendEntry[] = existsSync(trendFile)
  ? JSON.parse(readFileSync(trendFile, "utf-8"))
  : [];

trend.push(entry);

writeFileSync(trendFile, JSON.stringify(trend, null, 2));
console.log(`✅ Chaos trend updated: ${trend.length} entries (${entry.passed}/${entry.total} passed)`);
