import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts', 'packages/**/src/**/*.test.ts', 'apps/**/test/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      thresholds: { statements: 80, functions: 80, branches: 70, lines: 80 },
    },
  },
});
