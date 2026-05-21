// SPDX-License-Identifier: Apache-2.0
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

/**
 * Service-role Supabase client for privileged server-side operations.
 * Bypasses Row-Level Security — never expose this to the browser.
 * Session persistence is disabled: this is a stateless server context.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to create the admin client',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    realtime: {
      // supabase-js eagerly constructs a Realtime client, which needs a
      // WebSocket. Node < 22 has no global WebSocket, so supply `ws`. We never
      // open a realtime connection here — this only satisfies the constructor.
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });
}
