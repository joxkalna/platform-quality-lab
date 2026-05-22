/**
 * Classify user flow — page object for Lighthouse user flow testing.
 *
 * Defines the selectors and interaction sequence for the classify journey:
 * navigate → type text → click classify → wait for result.
 */

import type { Page } from "puppeteer";
import type { UserFlow } from "lighthouse";

const SELECTORS = {
  textInput: "textarea",
  result: ".classify-result",
} as const;

const SAMPLE_TEXT = "server is down and completely unresponsive";

export async function runClassifyFlow(
  flow: UserFlow,
  page: Page,
  url: string
) {
  // Cold navigation — measures full page load (LCP, CLS, TBT, FCP)
  await flow.navigate(url, { name: "cold-navigation" });

  // Wait for React to hydrate — Classify section is defaultOpen
  // but may not be in the DOM immediately after Lighthouse navigation completes
  await page.waitForSelector(SELECTORS.textInput, { timeout: 10_000 });

  // Type text interaction
  await flow.startTimespan({ name: "type-text" });
  await page.type(SELECTORS.textInput, SAMPLE_TEXT);
  await flow.endTimespan();

  // Click classify button
  await flow.startTimespan({ name: "click-classify" });
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => el.textContent?.trim());
    if (text === "Classify") {
      await btn.click();
      break;
    }
  }
  await flow.endTimespan();

  // Wait for result — measures full backend round-trip surfacing in UI
  await flow.startTimespan({ name: "result-displayed" });
  try {
    await page.waitForSelector(SELECTORS.result, { timeout: 60_000 });
  } catch (err) {
    await page.screenshot({ path: "tests/lighthouse/results/debug-failure.png" });
    const { writeFileSync } = await import("node:fs");
    writeFileSync("tests/lighthouse/results/debug-page.html", await page.content());
    throw err;
  }
  await flow.endTimespan();
}
