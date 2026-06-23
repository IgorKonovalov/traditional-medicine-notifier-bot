import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/test-helper.ts', 'src/bot/test-helper.ts'],
      // No thresholds while the project is a skeleton — most modules are
      // intentional stubs. Add floors once real feature logic lands (mirror
      // the sibling bot's ratcheted thresholds at that point).
    },
  },
});
