import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 600_000,
    hookTimeout: 600_000,
    include: [path.resolve(__dirname, "consistency.test.ts")],
    reporters: ["default"],
    coverage: { enabled: false },
  },
});
