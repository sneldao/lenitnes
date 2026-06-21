'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

// APP_LINKS is the post-pivot operator nav (useAuth().isAuthenticated
// is hardcoded false in the Day 13 zero-headcount build, so this is
// never rendered today, but kept for the day the auth surface comes back).
// /signals and /admin were removed in Day 13; /account is the only
// post-pivot authenticated route that would need to exist for the
// operator surface to make sense again.
const APP_LINKS = [
  { href: '/monitors', label: 'Monitors' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/case-study/halo2', label: 'Case Study' },
  { href: '/backtest', label: 'Backtest' },
];

const LANDING_LINKS = [
  { href: '/monitors', label: 'Monitors' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/#how-it-works', label: 'Proof Chain' },
  { href: '/#zec-story', label: 'Case Study' },
  { href: '/#demo', label: 'Demo' },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  // Prevent flash of unauthenticated content while auth resolves
  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-5 w-20 animate-pulse rounded bg-edge/40" />
      </div>
    );
  }

  const links = isAuthenticated ? APP_LINKS : LANDING_LINKS;
  // Public CTA: case study is the founding myth (the lede on the landing
  // page). Per-user routes (/monitors/new, /account) were removed in the
  // Day 12 pivot — useAuth().isAuthenticated is hardcoded false, so this
  // branch is the one that actually renders today.
  const cta = isAuthenticated
    ? { href: '/account', label: 'Account' }
    : { href: '/case-study/halo2', label: 'Read the case study' };

  function isActive(href: string): boolean {
    if (href.includes('#')) return false;
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="ml-auto mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 sm:hidden"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      <nav className="hidden items-center gap-1 sm:flex">
        {links.map((l) => (
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
        {isAuthenticated && (
          <Link
            href="/account"
            className={`relative px-3 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-px after:transition-opacity ${
              isActive('/account')
                ? 'text-slate-100 after:bg-accent after:opacity-100'
                : 'text-slate-500 hover:text-slate-100 after:bg-accent after:opacity-0 hover:after:opacity-100'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>
        )}
        <div className="ml-3 h-5 w-px bg-edge" />
        <Link href={cta.href} className="btn ml-3 py-2 text-xs">
          {cta.label}
        </Link>
      </nav>

      {open && (
        <div className="fixed inset-x-0 top-[57px] z-50 border-b border-edge/40 bg-panel/98 p-4 shadow-card backdrop-blur-xl sm:hidden">
          <div className="mx-auto max-w-4xl space-y-0.5">
            {links.map((l) => (
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
            {isAuthenticated && (
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isActive('/account')
                    ? 'bg-accent/10 text-accent'
                    : 'text-slate-400 hover:bg-ink-light hover:text-slate-100'
                }`}
              >
                <Settings className="h-3.5 w-3.5" />
                Account
              </Link>
            )}
            <div className="border-t border-edge/40 pt-3">
              <Link
                href={cta.href}
                onClick={() => setOpen(false)}
                className="btn w-full justify-center py-2.5 text-xs"
              >
                {cta.label}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
