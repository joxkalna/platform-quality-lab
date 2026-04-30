import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 600_000, // 10 min — 5 runs per case against Ollama
    include: [path.resolve(__dirname, "consistency.test.ts")],
    reporters: ["default"],
    coverage: { enabled: false },
  },
});
