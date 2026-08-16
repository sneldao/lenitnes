'use client';

import { useState } from 'react';

/**
 * Progressive-disclosure helpers: long lists collapse to `initial`
 * rows with a single toggle, so each page answers one question at a
 * glance instead of dumping every row on the reader.
 */

export function useShowMore(total: number, initial: number) {
  const [expanded, setExpanded] = useState(false);
  return {
    /** How many rows to render right now. */
    shown: expanded ? total : Math.min(initial, total),
    expanded,
    toggle: () => setExpanded((v) => !v),
    needsToggle: total > initial,
  };
}

export function ShowMoreButton({
  total,
  initial,
  expanded,
  onToggle,
  noun = 'rows',
}: {
  total: number;
  initial: number;
  expanded: boolean;
  onToggle: () => void;
  noun?: string;
}) {
  if (total <= initial) return null;
  return (
    <button
      onClick={onToggle}
      className="mt-2 w-full rounded-lg border border-edge/40 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:border-accent/40 hover:text-accent"
    >
      {expanded ? `collapse to ${initial} ${noun}` : `show all ${total} ${noun}`}
    </button>
  );
}
