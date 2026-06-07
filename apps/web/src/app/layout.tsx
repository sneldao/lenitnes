import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from '@/components/Providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WalletProvider, WalletConnectButton } from '@/components/WalletConnect';

export const metadata: Metadata = {
  title: 'LENITNES — proof-chained signal monitoring',
  description:
    'Monitor GitHub & the web for crypto market signals. Hedera-timestamped proof, TinyFish detection, Kraken execution.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🔗%3C/text%3E%3C/svg%3E",
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
          <WalletProvider>
            <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
              <header className="flex items-center justify-between border-b border-edge py-5">
                <Link href="/" className="flex items-center gap-2">
                  <span className="text-lg font-black tracking-tight text-accent">LENITNES</span>
                  <span className="hidden text-xs text-slate-500 sm:inline">
                    proof-chained monitoring
                  </span>
                </Link>
                <nav className="flex items-center gap-4 text-sm">
                  <Link href="/" className="text-slate-300 hover:text-accent">
                    Dashboard
                  </Link>
                  <Link href="/rules" className="text-slate-300 hover:text-accent">
                    Rules
                  </Link>
                  <Link href="/orders" className="text-slate-300 hover:text-accent">
                    Orders
                  </Link>
                  <Link href="/monitors/new" className="btn">
                    New Monitor
                  </Link>
                  <WalletConnectButton />
                </nav>
              </header>
              <main id="main-content" className="flex-1 py-8" tabIndex={-1}>
                <ErrorBoundary>{children}</ErrorBoundary>
              </main>
              <footer className="border-t border-edge py-6 text-xs text-slate-500">
                Hedera · TinyFish · Kraken — every signal carries a cryptographic proof chain.
              </footer>
            </div>
          </WalletProvider>
        </Providers>
      </body>
    </html>
  );
}
