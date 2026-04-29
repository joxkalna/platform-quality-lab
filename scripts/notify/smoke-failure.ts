/**
 * Smoke test failure notification.
 * Decision: "Pipeline is blocked — endpoints are down."
 */

import { postToSlack, header, section, context, pipelineUrl, branch } from "./slack";

const exitCode = process.env.EXIT_CODE;

if (!exitCode || exitCode === "0") {
  console.log("✅ Smoke test passed — skipping Slack notification.");
  process.exit(0);
}

const url = pipelineUrl();
const footer = [branch(), url ? `<${url}|View pipeline>` : ""].filter(Boolean).join(" · ");

postToSlack([
  header("🚨 Pipeline Blocked — Smoke Test Failed"),
  section("Endpoints are unreachable. Nothing can deploy until this is fixed."),
  ...(footer ? [context(`➡️ ${footer}`)] : []),
], "🚨 Pipeline blocked — smoke test failed").catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
