'use client';
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';
import type { components } from '@document-chat/contracts';

type Citation = components['schemas']['Citation'];

export interface CitationDrawerProps {
  chunkId: string;
  onClose: () => void;
}

/**
 * Hydrates one citation by calling `POST /citations:resolve` and renders
 * the source title + page + excerpt. Closes when the user dismisses it.
 */
export function CitationDrawer({ chunkId, onClose }: CitationDrawerProps) {
  const [citation, setCitation] = useState<Citation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setCitation(null);
    setError(null);
    fetch('/api/citations:resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chunk_ids: [chunkId] }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { citations: Citation[] };
        if (aborted) return;
        const first = body.citations[0];
        if (!first) throw new Error('No citation returned.');
        setCitation(first);
      })
      .catch((err: unknown) => {
        if (aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load citation.');
      });
    return () => {
      aborted = true;
    };
  }, [chunkId]);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        data-testid="citation-drawer"
        className="drawer"
        role="dialog"
        aria-label="Source citation"
      >
        <div className="drawer__header">
          <h2 style={{ fontSize: '0.9375rem' }}>Source</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close citation"
            className="btn btn--ghost btn--sm"
          >
            Close
          </button>
        </div>
        {error ? (
          <p role="alert" className="alert">
            {error}
          </p>
        ) : citation ? (
          citation.unavailable ? (
            <p className="muted">
              <em>{citation.unavailable_reason ?? 'Source is no longer available.'}</em>
            </p>
          ) : (
            <>
              <h3>{citation.document_title}</h3>
              <p className="drawer__meta">
                v{citation.document_version}
                {citation.page_number !== null && citation.page_number !== undefined
                  ? ` · page ${citation.page_number}`
                  : ''}
              </p>
              <blockquote>{citation.excerpt}</blockquote>
            </>
          )
        ) : (
          <p className="muted">Loading citation…</p>
        )}
      </aside>
    </>
  );
}
