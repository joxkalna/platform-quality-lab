export interface ClassificationResult {
  category: string;
  confidence: string;
  model: string;
}

export type Category = "critical" | "warning" | "info" | "ok";

export const VALID_CATEGORIES: Category[] = ["critical", "warning", "info", "ok"];
