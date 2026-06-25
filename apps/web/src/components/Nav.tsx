'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { AgentActivityPanel } from '@/components/AgentActivityPanel';

// Primary public nav — only the surfaces that have real content for a visitor.
const NAV_LINKS = [
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/case-study/halo2', label: 'Case Study' },
  { href: '/monitors', label: 'Watchlist' },
  { href: '/backtest', label: 'Backtest' },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(!open)}
        className="ml-auto mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 sm:hidden"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Desktop nav */}
      <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`relative px-3 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-px after:transition-opacity ${
              isActive(l.href)
                ? 'text-slate-100 after:bg-accent after:opacity-100'
                : 'text-slate-400 hover:text-slate-100 after:bg-accent after:opacity-0 hover:after:opacity-100'
            }`}
          >
            {l.label}
          </Link>
        ))}
        <div className="ml-3 h-5 w-px bg-edge" />
        <Link href="/case-study/halo2" className="btn ml-3 py-2 text-xs">
          Read the case study
        </Link>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-x-0 top-[57px] z-50 border-b border-edge/40 bg-panel/98 p-4 shadow-card backdrop-blur-xl sm:hidden">
          <div className="mx-auto max-w-4xl space-y-0.5">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isActive(l.href)
                    ? 'bg-accent/10 text-accent'
                    : 'text-slate-400 hover:bg-ink-light hover:text-slate-100'
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="border-t border-edge/40 pt-3">
              <Link
                href="/case-study/halo2"
                onClick={() => setOpen(false)}
                className="btn w-full justify-center py-2.5 text-xs"
              >
                Read the case study
              </Link>
            </div>
            {/* Agent activity on mobile — shown in the drawer */}
            <div className="border-t border-edge/40 pt-3">
              <AgentActivityPanel />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
