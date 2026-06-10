'use client';
// SPDX-License-Identifier: Apache-2.0

export interface CitationChipProps {
  label: string;
  onClick: () => void;
}

/**
 * Small inline button rendered in place of `[<chunk-uuid>]` markers. Plain
 * button so the chip is keyboard-reachable and screenreaders announce it as
 * a reference link.
 */
export function CitationChip({ label, onClick }: CitationChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="citation-chip"
      className="citation-chip"
      aria-label={`Open citation ${label}`}
    >
      {label}
    </button>
  );
}
