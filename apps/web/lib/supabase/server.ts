// SPDX-License-Identifier: Apache-2.0
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cookie-bound Supabase client for the Next.js App Router (RSC, Route
 * Handlers, Server Actions). Carries the signed-in user's session via
 * cookies and respects Row-Level Security. Not yet exercised — auth wiring
 * arrives with Tier 1; this lands the pattern.
 */
export async function createSSRClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Session refresh is handled by middleware instead (Tier 1).
          }
        },
      },
    },
  );
}
