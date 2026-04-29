/**
 * Chaos failure notification.
 * Decision: "Service failed resilience check — review before promoting."
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { postToSlack, header, section, context, pipelineUrl, branch } from "./slack";

interface ChaosCheck {
  name: string;
  passed: boolean;
}

interface ChaosReport {
  experiment: string;
  service: string;
  passed: boolean;
  checks: ChaosCheck[];
}

const reportsDir = resolve(__dirname, "..", "chaos", "reports");

if (!existsSync(reportsDir)) {
  console.log("⚠️ No chaos reports directory — skipping notification.");
  process.exit(0);
}

const reports: ChaosReport[] = readdirSync(reportsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(reportsDir, f), "utf-8")));

if (reports.length === 0) {
  console.log("⚠️ No chaos reports found — skipping notification.");
  process.exit(0);
}

const failures = reports.filter((r) => !r.passed);

if (failures.length === 0) {
  console.log("✅ All chaos experiments passed — skipping Slack notification.");
  process.exit(0);
}

const total = reports.length;
const failedCount = failures.length;

const failureLines = failures
  .map((r) => {
    const failedChecks = r.checks
      .filter((c) => !c.passed)
      .map((c) => c.name)
      .join(", ");
    return `• *${r.experiment}* (${r.service}) — ${failedChecks}`;
  })
  .join("\n");

const url = pipelineUrl();
const footer = [branch(), url ? `<${url}|View chaos results>` : ""].filter(Boolean).join(" · ");

postToSlack([
  header(`🔥 Chaos Failed — ${failedCount}/${total} Experiments`),
  section(failureLines),
  section("_Services failed resilience checks — review before promoting_"),
  ...(footer ? [context(`➡️ ${footer}`)] : []),
], `🔥 Chaos failed: ${failedCount}/${total} experiments`).catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
