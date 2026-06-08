'use client';

import { useState } from 'react';
import glossaryData from '@/data/glossary.json';

const definitions = glossaryData as Record<string, string>;

export function Tooltip({ term, children }: { term: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const def = definitions[term];

  if (!def) return <>{children}</>;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <span
        className="cursor-help border-b border-dashed border-slate-600 decoration-clone"
        title={def}
        tabIndex={0}
        role="button"
        aria-describedby={show ? `tooltip-${term}` : undefined}
      >
        {children}
      </span>
      {show && (
        <span
          id={`tooltip-${term}`}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-edge/60 bg-panel p-2.5 text-[11px] leading-relaxed text-slate-300 shadow-card"
        >
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-accent">
            {term}
          </span>
          {def}
        </span>
      )}
    </span>
  );
}
