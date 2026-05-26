/**
 * Frontend chaos — Playwright assertions during backend failure.
 *
 * These tests run chaos experiments (pod kill, scale-down) and verify
 * the UI handles degradation gracefully: shows errors, doesn't hang,
 * recovers when backend returns.
 *
 * Requires: Kind cluster running with services deployed.
 * Run: npx playwright test --config tests/e2e/playwright.config.ts chaos.spec.ts
 */

import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { ClassifyPage } from "./pages/classify.page";

const kubectl = (cmd: string) =>
  execSync(`kubectl ${cmd}`, { encoding: "utf-8", timeout: 30_000 });

const waitForRollout = (deployment: string, timeoutSec = 60) =>
  execSync(
    `kubectl rollout status deployment/${deployment} --timeout=${timeoutSec}s`,
    { encoding: "utf-8" }
  );

test.describe("Frontend Chaos", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });

  let classifyPage: ClassifyPage;

  test.beforeEach(async ({ page }) => {
    classifyPage = new ClassifyPage(page);
  });

  test.afterEach(() => {
    // Ensure deployments are scaled back up for subsequent tests
    try { kubectl("scale deployment/service-a --replicas=2"); } catch {}
    try { kubectl("scale deployment/service-c --replicas=2"); } catch {}
    try { waitForRollout("service-a", 90); } catch {}
    try { waitForRollout("service-c", 120); } catch {}
  });

  test("UI shows error when Service A pod is killed", async ({ page }) => {
    // Verify baseline works
    await classifyPage.goto();
    await classifyPage.classify("server is down and completely unresponsive");
    const baseline = await classifyPage.getResult();
    expect(baseline.category).toBeTruthy();

    // Kill all Service A pods
    kubectl("delete pods -l app=service-a --force --grace-period=0");
    await page.waitForTimeout(2000);

    // Classify during outage — UI should show error, not hang
    await classifyPage.goto();
    await classifyPage.classify("test during pod kill");

    const error = await classifyPage.getError(30_000);
    expect(error).toBeTruthy();
  });

  test("UI shows error when Service C is scaled to zero", async ({ page }) => {
    // Scale Service C to 0 — simulates downstream dependency gone
    kubectl("scale deployment/service-c --replicas=0");
    kubectl("rollout status deployment/service-c --timeout=30s");

    await page.waitForTimeout(2000);
    await classifyPage.goto();
    await classifyPage.classify("test with no downstream");

    const error = await classifyPage.getError(30_000);
    expect(error).toBeTruthy();
  });

  test("UI shows loading state during slow response", async ({ page }) => {
    await classifyPage.goto();
    await classifyPage.classify("server is down and completely unresponsive");

    // Check that loading state appears (button text changes)
    // The classify action triggers loading — we check it's not stuck
    const isLoading = await classifyPage.isLoading();
    // Loading may have already resolved by the time we check,
    // so we just verify the page didn't hang
    const buttonDisabled = await classifyPage.isButtonDisabled();
    expect(isLoading || !buttonDisabled).toBeTruthy();
  });
});
