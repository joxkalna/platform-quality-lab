/**
 * Reusable Slack webhook utility.
 *
 * Uses Block Kit for structured formatting.
 *
 * Environment variables:
 *   SLACK_WEBHOOK_URL — Incoming Webhook URL
 *   DRY_RUN — "true" prints to stdout instead of posting
 */

interface Block {
  type: string;
  text?: { type: string; text: string };
  elements?: { type: string; text: string }[];
}

export const postToSlack = async (blocks: Block[], fallbackText: string): Promise<void> => {
  if (process.env.DRY_RUN === "true") {
    console.log("--- DRY RUN ---");
    console.log(JSON.stringify(blocks, null, 2));
    return;
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("⚠️ SLACK_WEBHOOK_URL not set — skipping notification.");
    return;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: fallbackText, blocks }),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${res.statusText}`);
  }

  console.log("✅ Slack notification sent.");
};

// Block Kit helpers

export const header = (text: string): Block => ({
  type: "header",
  text: { type: "plain_text", text },
});

export const section = (markdown: string): Block => ({
  type: "section",
  text: { type: "mrkdwn", text: markdown },
});

export const divider = (): Block => ({ type: "divider" });

export const context = (text: string): Block => ({
  type: "context",
  elements: [{ type: "mrkdwn", text }],
});

// Environment helpers

export const pipelineUrl = (): string =>
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "";

export const branch = (): string => process.env.GITHUB_REF_NAME || "unknown";
