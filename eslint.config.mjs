import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import resilience from "./eslint-plugin-resilience/index.mjs";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["services/*/src/**/*.ts"],
    plugins: { resilience },
    rules: {
      "resilience/fetch-requires-timeout": "error",
      "resilience/fetch-requires-error-handling": "error",
    },
  },
  {
    ignores: ["**/dist/", "**/node_modules/"],
  },
];
