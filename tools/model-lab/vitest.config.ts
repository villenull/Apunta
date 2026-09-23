import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'model-lab',
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
