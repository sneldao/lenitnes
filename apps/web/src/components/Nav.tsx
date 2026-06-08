'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Menu, X } from 'lucide-react';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/signals', label: 'Signals' },
  { href: '/rules', label: 'Rules' },
  { href: '/orders', label: 'Orders' },
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
      <button
        onClick={() => setOpen(!open)}
        className="ml-auto mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 sm:hidden"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((l) => (
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
        <div className="ml-3 h-5 w-px bg-edge" />
        <Link href="/monitors/new" className="btn ml-3 py-2 text-xs">
          + Monitor
        </Link>
      </nav>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-2xl border border-edge/40 bg-panel/95 p-3 shadow-card backdrop-blur-xl sm:hidden">
          {LINKS.map((l) => (
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
          <div className="mt-1 border-t border-edge/40 pt-2">
            <Link
              href="/monitors/new"
              onClick={() => setOpen(false)}
              className="btn w-full justify-center py-2.5 text-xs"
            >
              + New Monitor
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
