// SPDX-License-Identifier: Apache-2.0
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
});
