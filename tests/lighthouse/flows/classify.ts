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
  classifyButton: "button",
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

  // Type text interaction
  await flow.startTimespan({ name: "type-text" });
  await page.waitForSelector(SELECTORS.textInput);
  await page.type(SELECTORS.textInput, SAMPLE_TEXT);
  await flow.endTimespan();

  // Click classify + wait for result — measures the full interaction
  // from button click to result visible in the DOM (includes backend round-trip)
  await flow.startTimespan({ name: "click-classify" });
  await page.click(SELECTORS.classifyButton);
  await flow.endTimespan();

  await flow.startTimespan({ name: "result-displayed" });
  await page.waitForSelector(SELECTORS.result, { timeout: 60_000 });
  await flow.endTimespan();
}
