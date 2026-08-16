'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, BarChart3, BookOpen, ScanLine, MoreHorizontal } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';

// ── 3 primary tabs + a "More" dropdown for the rest ──
const PRIMARY_LINKS = [
  { href: '/scorecard', label: 'Scorecard', icon: BarChart3 },
  { href: '/methodology', label: 'How it works', icon: BookOpen },
  { href: '/scan', label: 'Scan', icon: ScanLine },
];

const MORE_LINKS = [
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/reasoning', label: 'Reasoning' },
  { href: '/intelligence', label: 'Intelligence' },
  { href: '/monitors', label: 'Watchlist' },
  { href: '/case-studies', label: 'Case studies' },
];

export function Nav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href) ?? false;
  }

  // Close "More" dropdown on route change.
  useEffect(() => setMoreOpen(false), [pathname]);

  // Close "More" on outside click.
  useEffect(() => {
    if (!moreOpen) return;
    function onClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  // Is any "More" link currently active?
  const moreActive = MORE_LINKS.some((l) => isActive(l.href));

  return (
    <>
      {/* ── Desktop nav: 3 links + More dropdown ── */}
      <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
        {PRIMARY_LINKS.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-px after:transition-opacity ${
                isActive(l.href)
                  ? 'text-slate-100 after:bg-accent after:opacity-100'
                  : 'text-slate-400 hover:text-slate-100 after:bg-accent after:opacity-0 hover:after:opacity-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {l.label}
            </Link>
          );
        })}

        {/* More dropdown */}
        <div ref={moreRef} className="relative">
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            aria-expanded={moreOpen}
            aria-haspopup="true"
            className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              moreActive || moreOpen ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            More
            <ChevronDown
              className={`h-3 w-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-edge/60 bg-panel/98 shadow-card backdrop-blur-xl">
              {MORE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={`block px-4 py-2.5 text-sm transition-colors ${
                    isActive(l.href)
                      ? 'bg-accent/10 text-accent'
                      : 'text-slate-400 hover:bg-ink-light hover:text-slate-100'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Site-wide Command-K Search Trigger */}
        <CommandPalette />
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="glass fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-edge/40 px-2 py-1.5 sm:hidden"
        aria-label="Mobile navigation"
      >
        {PRIMARY_LINKS.map((l) => {
          const Icon = l.icon;
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
                active ? 'text-accent' : 'text-slate-500'
              }`}
            >
              <Icon className="h-4 w-4" />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
