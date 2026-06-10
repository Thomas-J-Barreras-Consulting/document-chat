// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { getOptionalUser } from '../lib/auth';
import { AppShell } from './app-shell';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getOptionalUser();

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div className="page-header__title">
          <h1>document-chat</h1>
          <p>Public Apache 2.0 starter for a document Q&amp;A system with traceable citations.</p>
        </div>
        {user ? (
          <div className="row">
            <Link href="/documents" className="btn btn--secondary">
              Documents
            </Link>
            <Link href="/chats" className="btn">
              Start a chat
            </Link>
          </div>
        ) : (
          <div className="row">
            <Link href="/login" className="btn btn--secondary">
              Sign in
            </Link>
            <Link href="/signup" className="btn">
              Create account
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
