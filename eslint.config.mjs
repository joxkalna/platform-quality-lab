import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["services/*/src/**/*.ts"],
  },
  {
    ignores: ["**/dist/", "**/node_modules/"],
  },
];
