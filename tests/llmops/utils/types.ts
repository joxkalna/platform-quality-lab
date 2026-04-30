export interface GoldenCase {
  id: string;
  input: string;
  expectedCategory: string;
  acceptableCategories: string[];
  minConfidence: number;
  tags: string[];
}

export interface CaseResult {
  id: string;
  input: string;
  expected: string;
  acceptable: string[];
  actual: string;
  confidence: number;
  pass: boolean;
  tags: string[];
}

export interface CategoryStats {
  total: number;
  passed: number;
  accuracy: number;
}

export interface EvaluationResult {
  timestamp: string;
  model: string;
  totalCases: number;
  passed: number;
  accuracy: number;
  perCategory: Record<string, CategoryStats>;
  failures: CaseResult[];
}
