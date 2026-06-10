// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

/**
 * Top-nav shell wrapping the signed-in pages. Server component — receives
 * the resolved user from the page that knows it (so we don't double-call
 * `getOptionalUser`). The signout `form` posts to the existing
 * `/auth/signout` route handler.
 */
export function AppShell({
  user,
  children,
}: {
  user: User | null;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav__inner">
          <Link href="/" className="top-nav__brand">
            <span className="top-nav__brand-mark" aria-hidden="true" />
            document-chat
          </Link>
          {user ? (
            <nav className="top-nav__links" aria-label="Primary">
              <Link href="/documents">Documents</Link>
              <Link href="/chats">Chats</Link>
            </nav>
          ) : null}
          <div className="top-nav__spacer" />
          {user ? (
            <div className="top-nav__user">
              <span className="subtle">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="btn btn--ghost btn--sm">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="top-nav__user">
              <Link href="/login" className="btn btn--ghost btn--sm">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn--sm">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
