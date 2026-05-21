// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { createAdminClient } from './admin';

// Requires a running local Supabase stack (`pnpm db:start`) with
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
// Proves the client, the service-role key, and the local Auth service all
// work end to end. The Tier 0 migration only enables extensions, so there is
// no public table to query — the GoTrue admin API needs none.
describe('supabase admin client (integration)', () => {
  it('connects to the local stack and the service-role key works', async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.listUsers();
    expect(error).toBeNull();
    expect(Array.isArray(data.users)).toBe(true);
  });
});
