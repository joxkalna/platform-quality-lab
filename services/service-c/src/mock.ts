import type { ClassificationResult } from "./types";

type MockRule = { keywords: string[]; category: string; confidence: number };

const MOCK_RULES: MockRule[] = [
  { keywords: ["down", "crash", "offline", "unreachable", "unresponsive", "failed", "corruption", "exhausted", "out of memory", "expired", "broken"], category: "critical", confidence: 0.92 },
  { keywords: ["degraded", "latency", "slow", "leak", "error rate", "503", "timeout", "disk usage", "trending", "intermittent", "replica lag", "increased"], category: "warning", confidence: 0.78 },
  { keywords: ["maintenance", "deployment", "config", "feature flag", "scheduled", "applied", "enabled", "rotation", "archived"], category: "info", confidence: 0.85 },
  { keywords: ["healthy", "passing", "operational", "normal", "within SLA", "no incidents", "running", "stable", "completed successfully"], category: "ok", confidence: 0.88 },
];

export function classifyMock(text: string): ClassificationResult {
  const lower = text.toLowerCase();

  for (const rule of MOCK_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { category: rule.category, confidence: rule.confidence, model: "mock" };
    }
  }

  return { category: "info", confidence: 0.5, model: "mock" };
}
