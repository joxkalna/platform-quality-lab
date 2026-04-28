import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { info } from "./logger.ts";

export const handleSummary = (data: object): Record<string, string> => {
  info(`Test completed at: ${new Date()}. Preparing summary...`);

  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
    "results/summary.json": JSON.stringify(data, null, 2),
  };
};
