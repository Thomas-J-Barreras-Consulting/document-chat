'use client';
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface EditableDocument {
  id: string;
  title: string;
  version: string;
  status: 'draft' | 'current' | 'retired';
  effective_date: string | null;
}

const STATUSES = ['draft', 'current', 'retired'] as const;

async function readDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.detail === 'string' ? body.detail : fallback;
  } catch {
    return fallback;
  }
}

export function DocumentEditor({ doc }: { doc: EditableDocument }) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [version, setVersion] = useState(doc.version);
  const [status, setStatus] = useState<EditableDocument['status']>(doc.status);
  const [effectiveDate, setEffectiveDate] = useState(doc.effective_date ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          version,
          status,
          effective_date: effectiveDate === '' ? null : effectiveDate,
        }),
      });
      if (!res.ok) throw new Error(await readDetail(res, 'Could not save changes.'));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(await readDetail(res, 'Could not delete.'));
      router.push('/documents');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
      setDeleting(false);
    }
  }

  return (
    <section>
      <h2>Edit</h2>
      <form onSubmit={onSave}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Version
          <input value={version} onChange={(e) => setVersion(e.target.value)} required />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EditableDocument['status'])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effective date
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved ? <span role="status"> Saved.</span> : null}
      </form>

      <button type="button" onClick={onDelete} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete document'}
      </button>

      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
