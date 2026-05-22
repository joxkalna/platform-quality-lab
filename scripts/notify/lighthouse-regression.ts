/**
 * Lighthouse regression notification.
 * Reads summary.json, compares against thresholds, posts owner-aware Slack alert.
 *
 * TODO: All notify scripts (perf-regression, smoke-failure, chaos-failure,
 * lighthouse-regression) use top-level procedural code. Refactor into
 * callable functions or proper CLI scripts with argument parsing.
 * Currently kept consistent with existing notify scripts.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  postToSlack,
  header,
  section,
  context,
  divider,
  pipelineUrl,
  branch,
} from "./slack";
import { budgets } from "../../tests/lighthouse/config/thresholds";
import type { LighthouseResults } from "../../tests/lighthouse/utils/runner";

const summaryFile = resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "lighthouse",
  "results",
  "summary.json"
);

if (!existsSync(summaryFile)) {
  console.log("⚠️ No Lighthouse summary — skipping notification.");
  process.exit(0);
}

const results: LighthouseResults = JSON.parse(
  readFileSync(summaryFile, "utf-8")
);

interface Breach {
  metric: string;
  value: number;
  budget: number;
  owner: string;
}

const breaches: Breach[] = [];

// Check navigation budgets
const nav = results.navigation;
if (nav.lcp > budgets.navigation.lcp)
  breaches.push({ metric: "LCP", value: nav.lcp, budget: budgets.navigation.lcp, owner: "ui" });
if (nav.cls > budgets.navigation.cls)
  breaches.push({ metric: "CLS", value: nav.cls, budget: budgets.navigation.cls, owner: "ui" });
if (nav.tbt > budgets.navigation.tbt)
  breaches.push({ metric: "TBT", value: nav.tbt, budget: budgets.navigation.tbt, owner: "ui" });
if (nav.fcp > budgets.navigation.fcp)
  breaches.push({ metric: "FCP", value: nav.fcp, budget: budgets.navigation.fcp, owner: "ui" });

// Check interaction budgets
for (const [name, budget] of Object.entries(budgets.interactions)) {
  const metrics = results.interactions[name];
  if (!metrics) continue;

  if (metrics.inp > budget.inp)
    breaches.push({ metric: `${name} INP`, value: metrics.inp, budget: budget.inp, owner: budget.owner });
  if (metrics.tbt > budget.tbt)
    breaches.push({ metric: `${name} TBT`, value: metrics.tbt, budget: budget.tbt, owner: budget.owner });
  if (metrics.cls > budget.cls)
    breaches.push({ metric: `${name} CLS`, value: metrics.cls, budget: budget.cls, owner: budget.owner });
}

if (breaches.length === 0) {
  console.log("✅ All Lighthouse budgets met — skipping notification.");
  process.exit(0);
}

// Group by owner
const byOwner = breaches.reduce<Record<string, Breach[]>>((acc, b) => {
  (acc[b.owner] ??= []).push(b);
  return acc;
}, {});

const breachLines = Object.entries(byOwner).flatMap(([owner, items]) => [
  `*owner: ${owner}*`,
  ...items.map(
    (b) =>
      `  • ${b.metric}: ${typeof b.value === "number" && b.value < 1 ? b.value.toFixed(3) : Math.round(b.value)}ms (budget: ${typeof b.budget === "number" && b.budget < 1 ? b.budget : Math.round(b.budget)})`
  ),
]);

const url = pipelineUrl();
const footer = [branch(), url ? `<${url}|View report>` : ""]
  .filter(Boolean)
  .join(" · ");

postToSlack(
  [
    header("🚨 Lighthouse Budget Exceeded"),
    section(breachLines.join("\n")),
    divider(),
    ...(footer ? [context(`➡️ ${footer}`)] : []),
  ],
  `🚨 Lighthouse budget exceeded: ${breaches[0].metric}`
).catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
