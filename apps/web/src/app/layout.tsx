import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from '@/components/Providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'LENITNES — proof-chained signal monitoring',
  description:
    'Monitor GitHub & the web for crypto market signals. On-chain proof, frontier-model agent, autonomous treasury.',
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
          <ToastProvider>
            <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 sm:px-6">
              <header className="glass sticky top-0 z-40 -mx-4 flex items-center justify-between rounded-b-2xl px-4 py-3 sm:-mx-6 sm:px-6">
                <Link href="/" className="group flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-signal text-sm font-black text-ink shadow-glow-sm transition-shadow group-hover:shadow-glow">
                    L
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold tracking-tight text-slate-100">
                      LENITNES
                    </span>
                    <span className="hidden text-[10px] font-medium text-slate-500 sm:block">
                      proof-chained monitoring
                    </span>
                  </div>
                </Link>
                <Nav />
              </header>
              <main
                id="main-content"
                className="animate-fade-in flex-1 py-6 sm:py-10"
                tabIndex={-1}
              >
                <ErrorBoundary>{children}</ErrorBoundary>
              </main>
              <footer className="border-t border-edge/40 py-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-accent/20 to-signal/20 text-[9px] font-bold text-accent">
                      L
                    </div>
                    <span className="text-xs text-slate-500">
                      Every signal carries a cryptographic proof chain
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                    <span>Hedera</span>
                    <span className="h-1 w-1 rounded-full bg-edge-light" />
                    <span>CMC</span>
                    <span className="h-1 w-1 rounded-full bg-edge-light" />
                    <span>TWAK</span>
                    <span className="h-1 w-1 rounded-full bg-edge-light" />
                    <span>x402</span>
                  </div>
                </div>
              </footer>
            </div>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
