import type { Locator, Page } from "@playwright/test";

export class ClassifyPage {
  private readonly textInput: Locator;
  private readonly classifyButton: Locator;
  private readonly result: Locator;
  private readonly error: Locator;

  constructor(private page: Page) {
    this.textInput = page.locator("textarea");
    this.classifyButton = page.getByRole("button", { name: "Classify", exact: true });
    this.result = page.locator(".classify-result");
    this.error = page.locator('[class*="error"]');
  }

  async goto() {
    await this.page.goto("/");
  }

  async classify(text: string) {
    await this.textInput.fill(text);
    await this.classifyButton.click();
  }

  async getResult() {
    await this.result.waitFor({ state: "visible", timeout: 60_000 });
    return {
      category: await this.result.locator('[class*="badge"]').textContent(),
      confidence: await this.result.locator(".data-field-value").first().textContent(),
      model: await this.result.locator(".data-field-value").last().textContent(),
    };
  }

  async getError() {
    await this.error.waitFor({ state: "visible" });
    return this.error.textContent();
  }

  async isButtonDisabled() {
    return this.classifyButton.isDisabled();
  }

  async isLoading() {
    return (await this.classifyButton.textContent())?.includes("Classifying");
  }

  async selectExample(index: number) {
    await this.page.locator(".example-chip").nth(index).click();
  }

  async getInputValue() {
    return this.textInput.inputValue();
  }
}
