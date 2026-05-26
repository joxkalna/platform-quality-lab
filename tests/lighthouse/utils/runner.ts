/**
 * Lighthouse runner — Puppeteer + Lighthouse setup/teardown.
 *
 * Launches a headless browser, runs a user flow, extracts metrics,
 * and writes HTML report + JSON summary to results/.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { startFlow } from "lighthouse";
import type { FlowResult, UserFlow } from "lighthouse";

const RESULTS_DIR = resolve(__dirname, "..", "results");

export interface NavigationMetrics {
  lcp: number;
  cls: number;
  tbt: number;
  fcp: number;
}

export interface InteractionMetrics {
  inp: number;
  tbt: number;
  cls: number;
}

export interface LighthouseResults {
  navigation: NavigationMetrics;
  interactions: Record<string, InteractionMetrics>;
  timestamp: string;
}

type FlowFn = (flow: UserFlow, page: Page, url: string) => Promise<void>;

// --- Browser lifecycle ---

function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

async function closeBrowser(browser: Browser, page: Page) {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

// --- Metric extraction ---

function requireMetric(audits: Record<string, { numericValue?: number }>, key: string) {
  const value = audits[key]?.numericValue;
  if (value === undefined || value === null) {
    throw new Error(`Lighthouse metric "${key}" not measured — page may have failed to load`);
  }
  return value;
}

function extractNavigationMetrics(step: FlowResult.Step): NavigationMetrics {
  const audits = step.lhr.audits;
  return {
    lcp: requireMetric(audits, "largest-contentful-paint"),
    cls: requireMetric(audits, "cumulative-layout-shift"),
    tbt: requireMetric(audits, "total-blocking-time"),
    fcp: requireMetric(audits, "first-contentful-paint"),
  };
}

function extractInteractionMetrics(step: FlowResult.Step): InteractionMetrics {
  const audits = step.lhr.audits;
  return {
    // INP is only reported when a qualifying interaction (click/type) occurs
    // during the timespan. Falls back to 0 for timespans with no interaction
    // (e.g. waiting for a network response). Same approach as production services.
    inp: audits["interaction-to-next-paint"]?.numericValue ?? 0,
    tbt: requireMetric(audits, "total-blocking-time"),
    cls: requireMetric(audits, "cumulative-layout-shift"),
  };
}

function extractResults(flowResult: FlowResult): LighthouseResults {
  let navigation: NavigationMetrics = { lcp: 0, cls: 0, tbt: 0, fcp: 0 };
  const interactions: Record<string, InteractionMetrics> = {};

  for (const step of flowResult.steps) {
    const name = step.name || "unknown";

    if (step.lhr.gatherMode === "navigation") {
      navigation = extractNavigationMetrics(step);
    } else if (step.lhr.gatherMode === "timespan") {
      interactions[name] = extractInteractionMetrics(step);
    }
  }

  return { navigation, interactions, timestamp: new Date().toISOString() };
}

// --- Write results ---

function writeResults(results: LighthouseResults, report: string) {
  writeFileSync(resolve(RESULTS_DIR, "report.html"), report);
  writeFileSync(
    resolve(RESULTS_DIR, "summary.json"),
    JSON.stringify(results, null, 2)
  );
}

// --- Public entry point ---

export async function runLighthouse(url: string, flowFn: FlowFn) {
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const browser = await launchBrowser();
  const page = await browser.newPage();

  const flow = await startFlow(page, {
    config: {
      extends: "lighthouse:default",
      settings: {
        onlyCategories: ["performance"],
        disableStorageReset: true,
      },
    },
  });

  try {
    await flowFn(flow, page, url);

    const flowResult = await flow.createFlowResult();
    const report = await flow.generateReport();
    const results = extractResults(flowResult);

    writeResults(results, report);
    return results;
  } finally {
    await closeBrowser(browser, page);
  }
}
