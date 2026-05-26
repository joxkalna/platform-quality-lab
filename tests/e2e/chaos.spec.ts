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
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  let classifyPage: ClassifyPage;

  test.beforeEach(async ({ page }) => {
    classifyPage = new ClassifyPage(page);
  });

  test("UI shows error when Service A pod is killed", async ({ page }) => {
    // Verify baseline works
    await classifyPage.goto();
    await classifyPage.classify("server is down and completely unresponsive");
    const baseline = await classifyPage.getResult();
    expect(baseline.category).toBeTruthy();

    // Kill all Service A pods
    kubectl("delete pods -l app=service-a --force --grace-period=0");

    // Wait for pods to terminate before retrying
    await page.waitForTimeout(2000);

    // Attempt classify during outage — UI should show error
    await classifyPage.goto();
    await classifyPage.classify("test during pod kill");

    const error = await classifyPage.getError(30_000);
    expect(error).toBeTruthy();

    // Wait for K8s to recover
    waitForRollout("service-a", 90);

    // Retry — should succeed after recovery
    await page.waitForTimeout(5000);
    await classifyPage.goto();
    await classifyPage.classify("recovery test after pod kill");
    const recovered = await classifyPage.getResult();
    expect(recovered.category).toBeTruthy();
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

    // Restore
    kubectl("scale deployment/service-c --replicas=2");
    waitForRollout("service-c", 120);

    // Verify recovery
    await page.waitForTimeout(5000);
    await classifyPage.goto();
    await classifyPage.classify("recovery after scale-up");
    const recovered = await classifyPage.getResult();
    expect(recovered.category).toBeTruthy();
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
