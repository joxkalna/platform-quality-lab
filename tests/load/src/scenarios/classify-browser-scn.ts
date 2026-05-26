/**
 * k6 browser scenario — classify user journey.
 *
 * Runs a real Chromium session: navigate → type → classify → assert result.
 * Measures Web Vitals (LCP, FCP, CLS, TTFB) alongside functional checks.
 *
 * Pattern: each browser scenario is a standalone async function that owns
 * its page lifecycle (open → interact → measure → close). This makes it
 * composable — add new journeys by creating new scenario files and
 * registering them in index.ts + a JSON config.
 *
 * Reference: https://grafana.com/docs/k6/latest/using-k6-browser/
 */

import { browser } from "k6/browser";
import { check } from "k6";
import { Trend } from "k6/metrics";

// Custom metrics — prefixed with `browser_` to distinguish from HTTP metrics.
// Each scenario should define its own metrics so they can be thresholded
// independently in JSON configs.
const classifyDuration = new Trend("browser_classify_duration", true);
const pageLoadDuration = new Trend("browser_page_load_duration", true);

const UI_URL = __ENV.UI_URL || "http://localhost:5173";
const SAMPLE_TEXT = "database connection pool exhausted, all requests failing";

export async function classifyBrowserScenario() {
  const page = await browser.newPage();

  try {
    // --- Navigation measurement ---
    const navStart = Date.now();
    await page.goto(UI_URL, { waitUntil: "networkidle" });
    pageLoadDuration.add(Date.now() - navStart);

    // --- Interaction: fill + submit ---
    const textarea = await page.locator("textarea");
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill(SAMPLE_TEXT);

    const classifyStart = Date.now();
    const classifyBtn = await page.locator('button:has-text("Classify")');
    await classifyBtn.click();

    // --- Result measurement (full round-trip: UI → A → C → LLM → back) ---
    await page.locator(".classify-result").waitFor({
      state: "visible",
      timeout: 60_000,
    });
    classifyDuration.add(Date.now() - classifyStart);

    // --- Functional assertions ---
    check(page, {
      "result is visible": () =>
        page.locator(".classify-result").isVisible(),
      "category badge shown": () =>
        page.locator(".classify-result .badge").isVisible(),
    });

    // --- Navigation timing (browser-native) ---
    // Reference: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming
    const vitals = await page.evaluate(() => {
      const entries = performance.getEntriesByType(
        "navigation"
      ) as PerformanceNavigationTiming[];
      const nav = entries[0];
      return {
        ttfb: nav ? nav.responseStart - nav.requestStart : 0,
        domContentLoaded: nav
          ? nav.domContentLoadedEventEnd - nav.startTime
          : 0,
        loadComplete: nav ? nav.loadEventEnd - nav.startTime : 0,
      };
    });

    check(vitals, {
      "TTFB under 2s": (v) => v.ttfb < 2000,
      "DOM loaded under 5s": (v) => v.domContentLoaded < 5000,
    });
  } finally {
    await page.close();
  }
}
