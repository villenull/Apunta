import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'installer',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
