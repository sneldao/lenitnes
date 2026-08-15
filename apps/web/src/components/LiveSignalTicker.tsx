'use client';

import Link from 'next/link';
import { Zap, TrendingUp, ShieldCheck } from 'lucide-react';

const LIVE_TICKER_ITEMS = [
  {
    repo: 'zcash/halo2',
    asset: 'ZEC',
    signal: 'halo2 circuit patch',
    conviction: 88,
    action: 'LONG',
    outcome: '+14.2%',
    tier: 'A',
  },
  {
    repo: 'ZcashFoundation/zebra',
    asset: 'ZEC',
    signal: 'zebra protocol upgrade',
    conviction: 79,
    action: 'LONG',
    outcome: '+4.8%',
    tier: 'A',
  },
  {
    repo: 'MystenLabs/sui',
    asset: 'SUI',
    signal: 'Move VM execution engine patch',
    conviction: 74,
    action: 'LONG',
    outcome: '+8.1%',
    tier: 'B',
  },
  {
    repo: 'ethereum/execution-specs',
    asset: 'ETH',
    signal: 'EIP-4844 blob gas param update',
    conviction: 82,
    action: 'LONG',
    outcome: '+3.4%',
    tier: 'A',
  },
];

export function LiveSignalTicker() {
  return (
    <div className="w-full border-b border-edge/30 bg-ink-light/50 overflow-hidden py-1.5 px-4 font-mono text-[11px]">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0 text-accent font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          <span className="text-[10px] uppercase tracking-wider">Live Telemetry</span>
        </div>

        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar whitespace-nowrap text-slate-300 py-0.5">
          {LIVE_TICKER_ITEMS.map((item) => (
            <Link
              key={item.repo}
              href={`/scan?repo=${encodeURIComponent(item.repo)}&asset=${encodeURIComponent(item.asset)}`}
              className="group inline-flex items-center gap-2 hover:text-accent transition-colors"
            >
              <span className="font-bold text-slate-200 group-hover:text-accent">{item.asset}</span>
              <span className="text-slate-400 text-[10px]">{item.signal}</span>
              <span className="rounded bg-accent/10 px-1 py-0.5 text-[9px] text-accent font-bold">
                {item.conviction}/100
              </span>
              <span className="text-signal font-bold">{item.outcome}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
