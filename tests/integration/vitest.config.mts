import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    globalSetup: [path.resolve(__dirname, 'setup.ts')],
    include: [path.resolve(__dirname, '*.test.ts')],
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: './test-results/integration-junit.xml' }]]
      : ['default'],
  },
})
