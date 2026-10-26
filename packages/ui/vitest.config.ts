import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
