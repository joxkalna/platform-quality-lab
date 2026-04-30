import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 300_000, // 5 min — full golden set against Ollama is slow
    include: [path.resolve(__dirname, "evaluate.test.ts")],
    reporters: ["default"],
    coverage: { enabled: false },
  },
});
