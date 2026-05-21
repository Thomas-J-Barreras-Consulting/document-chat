// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    setupFiles: ['./vitest.integration.setup.ts'],
    // Local Supabase / Docker first-hit latency.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      // `server-only` is a Next.js bundler guard with no runtime API and is
      // unresolvable under pnpm/Vitest. Map it to an empty module so
      // server-guarded code (e.g. lib/supabase/admin.ts) loads in tests.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
});
