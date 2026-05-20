import { expect, test } from "@playwright/test";
import { ClassifyPage } from "./pages/classify.page";

test.describe("Classify — E2E", () => {
  let classifyPage: ClassifyPage;

  test.beforeEach(async ({ page }) => {
    classifyPage = new ClassifyPage(page);
    await classifyPage.goto();
  });

  test("classifies text and displays result", async () => {
    await classifyPage.classify("server is down and completely unresponsive");

    const result = await classifyPage.getResult();
    expect(result.category).toBeTruthy();
    expect(result.confidence).toBeTruthy();
    expect(result.model).toBeTruthy();
  });
});
