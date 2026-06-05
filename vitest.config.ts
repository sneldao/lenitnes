import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@lenitnes/types': new URL('./packages/types/dist/index.js', import.meta.url).pathname,
    },
  },
});
