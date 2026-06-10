// SPDX-License-Identifier: Apache-2.0
import { headers } from 'next/headers';
import Link from 'next/link';
import type { components } from '@document-chat/contracts';
import { getOptionalUser } from '../lib/auth';
import { AppShell } from './app-shell';

// The frontend consumes the OpenAPI contract: the response is typed by the
// generated `VersionResponse` schema, so the page breaks at compile time if
// the contract changes shape. Tier 1 replaces this hand-rolled fetch with the
// generated client wrapped in TanStack Query.
type VersionResponse = components['schemas']['VersionResponse'];

// Read /api/version on every request (no static caching of build info).
export const dynamic = 'force-dynamic';

async function getVersion(): Promise<VersionResponse | null> {
  try {
    const headerList = await headers();
    const host = headerList.get('host');
    if (!host) return null;
    const protocol = headerList.get('x-forwarded-proto') ?? 'http';
    const res = await fetch(`${protocol}://${host}/api/version`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as VersionResponse;
  } catch {
    return null;
  }
}

export default async function Home() {
  const [version, user] = await Promise.all([getVersion(), getOptionalUser()]);

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

      <section className="card">
        <h2 className="card__title">Build info</h2>
        {version ? (
          <dl className="kv">
            <dt>API version</dt>
            <dd>{version.api_version}</dd>
            <dt>Spec version</dt>
            <dd>{version.spec_version}</dd>
            <dt>Environment</dt>
            <dd>
              <span className={`badge badge--${version.environment}`}>{version.environment}</span>
            </dd>
            {version.git_sha ? (
              <>
                <dt>Commit</dt>
                <dd>
                  <code>{version.git_sha.slice(0, 12)}</code>
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="muted">
            Could not reach <code>/api/version</code>.
          </p>
        )}
      </section>

      <section className="card page-section">
        <h2 className="card__title">Tier 0 endpoints</h2>
        <p className="muted">
          <code>/api/health</code> · <code>/api/version</code>
        </p>
      </section>
    </AppShell>
  );
}
