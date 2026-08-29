export type QualityStatus = "pass" | "warn" | "fail";

const STATUS_LABELS: Record<QualityStatus, string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
};

export const formatQualityStatus = (status: QualityStatus): string => STATUS_LABELS[status];
