import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` is a Next.js build-time guard with a server-only exports
      // map Vitest can't resolve under the node condition. Stub it so server
      // modules (e.g. lib/maptiler.ts, lib/stripe.ts) are unit-testable.
      'server-only': path.resolve(__dirname, 'src/test/server-only-stub.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: process.env.CI ? ['default', 'github-actions'] : 'default',
  },
});
