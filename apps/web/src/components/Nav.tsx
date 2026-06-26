'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { AgentActivityPanel } from '@/components/AgentActivityPanel';

const NAV_LINKS = [
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/backtest', label: 'Backtest' },
  { href: '/monitors', label: 'Watchlist' },
  { href: '/case-study/halo2', label: 'Case Study' },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  // Close on route change so a tap on a drawer link doesn't leave
  // the drawer open under the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // a11y: trap basics for the mobile drawer — move focus in on open,
  // close on Escape, restore scroll behavior. Without this Escape
  // does nothing and screen readers stay anchored on the trigger.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="ml-auto mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 sm:hidden"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="primary-nav-drawer"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(l.href) ? 'page' : undefined}
            className={`relative px-3 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-px after:transition-opacity ${
              isActive(l.href)
                ? 'text-slate-100 after:bg-accent after:opacity-100'
                : 'text-slate-400 hover:text-slate-100 after:bg-accent after:opacity-0 hover:after:opacity-100'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {open && (
        <div
          id="primary-nav-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-x-0 top-[57px] z-50 border-b border-edge/40 bg-panel/98 p-4 shadow-card backdrop-blur-xl sm:hidden"
        >
          <div className="mx-auto max-w-4xl space-y-0.5">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? 'page' : undefined}
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
              <AgentActivityPanel />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
