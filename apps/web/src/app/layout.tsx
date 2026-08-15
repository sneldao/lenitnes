import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from '@/components/Providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ui/toast';

import { Nav } from '@/components/Nav';
import { LiveSignalTicker } from '@/components/LiveSignalTicker';

export const metadata: Metadata = {
  title: 'LENITNES — proof-chained signal monitoring',
  description:
    'An autonomous agent that reads consensus-critical commits, scores them with a versioned rubric, and publishes every call — thesis, timestamped proof, and outcome — as a public track record.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2306b6d4'/%3E%3Cstop offset='100%25' stop-color='%2310b981'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='45' fill='url(%23g)'/%3E%3Ctext x='50' y='58' text-anchor='middle' font-size='40' font-weight='900' fill='%2306090f' font-family='system-ui'%3EL%3C/text%3E%3C/svg%3E",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to main content
        </a>
        <Providers>
          {/* ── Centered shell: narrow, no sidebar ── */}
          <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
            {/* Sticky header */}
            <header className="glass sticky top-0 z-40 -mx-4 flex items-center justify-between rounded-b-2xl px-4 py-3 sm:-mx-6 sm:px-6">
              <Link href="/" className="group flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-signal text-sm font-black text-ink shadow-glow-sm transition-shadow group-hover:shadow-glow">
                  L
                </div>
                <span className="font-display text-sm font-bold tracking-tight text-slate-100">
                  LENITNES
                </span>
              </Link>
              <Nav />
            </header>

            {/* Ambient Live Telemetry Marquee Bar */}
            <div className="-mx-4 sm:-mx-6 mt-1">
              <LiveSignalTicker />
            </div>

            {/* ── Single column: no sidebar ── */}
            <div className="flex flex-1 flex-col py-4 sm:py-6">
              <main id="main-content" className="min-w-0 flex-1 animate-fade-in" tabIndex={-1}>
                <ToastProvider>
                  <ErrorBoundary>{children}</ErrorBoundary>
                </ToastProvider>
              </main>
            </div>

            {/* Footer — compact */}
            <footer className="border-t border-edge/40 py-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Proof-chained on Hedera ·{' '}
                  <a
                    href="https://persidian.com"
                    className="text-slate-400 underline decoration-edge-light underline-offset-2 hover:text-accent"
                  >
                    Persidian
                  </a>
                </span>
                <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                  <span>GitHub</span>
                  <span className="h-1 w-1 rounded-full bg-edge-light" />
                  <span>Hedera</span>
                </div>
              </div>
            </footer>

            {/* Bottom spacer so mobile tab bar doesn't overlap content */}
            <div className="h-16 sm:hidden" aria-hidden />
          </div>
        </Providers>
      </body>
    </html>
  );
}
