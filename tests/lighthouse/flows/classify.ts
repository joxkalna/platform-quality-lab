/**
 * Classify user flow — page object for Lighthouse user flow testing.
 *
 * Defines the selectors and interaction sequence for the classify journey:
 * navigate → expand section → type text → click classify → wait for result.
 */

import type { Page } from "puppeteer";
import type { UserFlow } from "lighthouse";

const SELECTORS = {
  textInput: "textarea",
  classifyButton: '::-p-text(Classify)',
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

  // Expand the Classify Text section — content is conditionally rendered,
  // so we need to click the section header to mount the textarea into the DOM
  await page.waitForSelector(".section-header");
  await page.evaluate(() => {
    const headers = document.querySelectorAll(".section-header");
    (headers[0] as HTMLElement)?.click();
  });
  await page.waitForSelector(SELECTORS.textInput, { timeout: 5_000 });

  // Type text interaction
  await flow.startTimespan({ name: "type-text" });
  await page.type(SELECTORS.textInput, SAMPLE_TEXT);
  await flow.endTimespan();

  // Click classify button
  await flow.startTimespan({ name: "click-classify" });
  const buttons = await page.$$("button");
  // Find the button that contains exactly "Classify" (not section headers)
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
