import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: [path.resolve(__dirname, 'consumer/**/*.spec.ts')],
    setupFiles: [path.resolve(__dirname, 'set-env-vars.ts')],
    testTimeout: 30000,
  },
})
