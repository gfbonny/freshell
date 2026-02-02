import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/server/**/*.test.ts', 'test/unit/server/**/*.test.ts', 'test/integration/server/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Maximum parallelization settings
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },
    fileParallelism: true,
    maxConcurrency: 10,
    sequence: {
      shuffle: true, // Detect order-dependent tests
    },
  },
})
