'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  Eye,
  FileSearch,
  FileText,
  FlaskConical,
  LineChart,
  MoreHorizontal,
  PieChart,
  ScanLine,
  SlidersHorizontal,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Nav — consolidated to four primary items:
//
//   Markets  (flyout: scorecard, portfolio, calibration, reasoning, watchlist)
//   Research (flyout: lab, integrity scorecard, science scan, reasoning, watchlist)
//   How it works
//   More     (flyout: case studies, intelligence, watchlist)
//
// Each portal owns its sub-pages; the scorecard routes accept
// ?domain=markets|research (plus legacy code|science|bio aliases).
// ─────────────────────────────────────────────────────────────

/** Public label → internal pipeline domain. */
type FlyItem = {
  label: string;
  href: string;
  description: string;
  icon: ReactNode;
  iconColor?: string;
};

const MARKETS_ITEMS: FlyItem[] = [
  {
    label: 'Scorecard',
    href: '/scorecard?domain=markets',
    description: 'Track record · hit ratio · P&L',
    icon: <BarChart3 className="h-3.5 w-3.5" />,
    iconColor: 'text-accent',
  },
  {
    label: 'Portfolio',
    href: '/portfolio',
    description: 'Open & closed positions',
    icon: <PieChart className="h-3.5 w-3.5" />,
    iconColor: 'text-accent',
  },
  {
    label: 'Calibration',
    href: '/scorecard?domain=markets',
    description: 'Conviction bands & repo tiers',
    icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
    iconColor: 'text-accent',
  },
  {
    label: 'Reasoning',
    href: '/reasoning?domain=markets',
    description: 'Every scored call, markets only',
    icon: <FileText className="h-3.5 w-3.5" />,
    iconColor: 'text-accent',
  },
  {
    label: 'Watchlist',
    href: '/monitors',
    description: 'Consensus repos being watched',
    icon: <ScanLine className="h-3.5 w-3.5" />,
    iconColor: 'text-accent',
  },
];

const RESEARCH_ITEMS: FlyItem[] = [
  {
    label: 'Lab',
    href: '/research',
    description: 'Research integrity portal',
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    iconColor: 'text-signal',
  },
  {
    label: 'Scorecard',
    href: '/scorecard?domain=research',
    description: 'Alerts · precision · lead time',
    icon: <LineChart className="h-3.5 w-3.5" />,
    iconColor: 'text-signal',
  },
  {
    label: 'Science scan',
    href: '/scan?domain=research',
    description: 'Stats & results rewrites',
    icon: <FileSearch className="h-3.5 w-3.5" />,
    iconColor: 'text-signal',
  },
  {
    label: 'Reasoning',
    href: '/reasoning?domain=research',
    description: 'Scored science calls, research only',
    icon: <FileText className="h-3.5 w-3.5" />,
    iconColor: 'text-signal',
  },
  {
    label: 'Watchlist',
    href: '/monitors',
    description: 'Scientific software repos',
    icon: <Eye className="h-3.5 w-3.5" />,
    iconColor: 'text-signal',
  },
];

const MORE_ITEMS: FlyItem[] = [
  {
    label: 'Watchlist',
    href: '/monitors',
    description: 'All monitored repos',
    icon: <Eye className="h-3.5 w-3.5" />,
  },
  {
    label: 'Intelligence',
    href: '/intelligence',
    description: 'Velocity · PRs · synthesis',
    icon: <BarChart3 className="h-3.5 w-3.5" />,
  },
  {
    label: 'Case studies',
    href: '/case-studies',
    description: 'halo2 · 3dClustSim replays',
    icon: <BookOpen className="h-3.5 w-3.5" />,
  },
];

export function Nav() {
  const pathname = usePathname();
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);

  useEffect(() => {
    setOpenFlyout(null);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    const base = href.split('?')[0];
    return pathname === base || pathname?.startsWith(`${base}/`);
  };

  const activeSection =
    pathname?.startsWith('/research') || pathname?.startsWith('/science')
      ? 'research'
      : pathname?.startsWith('/markets') || pathname === '/scorecard'
        ? 'markets'
        : pathname === '/methodology' || pathname?.startsWith('/case-studies')
          ? 'methodology'
          : null;

  const portal = (
    label: string,
    key: 'markets' | 'research',
    items: FlyItem[],
    active: boolean,
  ) => (
    <div className="relative">
      <button
        onClick={() => setOpenFlyout(openFlyout === key ? null : key)}
        aria-expanded={openFlyout === key}
        aria-haspopup="true"
        className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
          active || openFlyout === key ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100'
        }`}
      >
        {label}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${openFlyout === key ? 'rotate-180' : ''}`}
        />
      </button>
      {openFlyout === key && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-edge/60 bg-panel/95 shadow-card backdrop-blur-xl">
          <Link
            href={`/${key}`}
            onClick={() => setOpenFlyout(null)}
            className="block border-b border-edge/30 px-4 py-3 transition-colors hover:bg-ink-light"
          >
            <span className="block font-display text-sm font-semibold text-slate-100">
              {label} <span className="text-slate-600">·</span>{' '}
              <span className="text-slate-500">
                {key === 'markets' ? 'price oracle' : 'record oracle'}
              </span>
            </span>
          </Link>
          <div className="p-1.5">
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpenFlyout(null)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-ink-light"
              >
                <span className={`shrink-0 ${item.iconColor ?? 'text-slate-500'}`}>
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-200 hover:text-accent">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{item.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────── */}
      <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
        {portal('Markets', 'markets', MARKETS_ITEMS, activeSection === 'markets')}
        {portal('Research', 'research', RESEARCH_ITEMS, activeSection === 'research')}
        <Link
          href="/methodology"
          aria-current={activeSection === 'methodology' ? 'page' : undefined}
          className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-px after:transition-opacity ${
            activeSection === 'methodology'
              ? 'text-slate-100 after:bg-accent after:opacity-100'
              : 'text-slate-400 hover:text-slate-100 after:bg-accent after:opacity-0 hover:after:opacity-100'
          }`}
        >
          How it works
        </Link>

        {/* More */}
        <div className="relative">
          <button
            onClick={() => setOpenFlyout(openFlyout === 'more' ? null : 'more')}
            aria-expanded={openFlyout === 'more'}
            aria-haspopup="true"
            className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              openFlyout === 'more' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            More
            <ChevronDown
              className={`h-3 w-3 transition-transform ${openFlyout === 'more' ? 'rotate-180' : ''}`}
            />
          </button>
          {openFlyout === 'more' && (
            <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-edge/60 bg-panel/95 shadow-card backdrop-blur-xl">
              <div className="p-1.5">
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpenFlyout(null)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-ink-light"
                  >
                    <span className="shrink-0 text-slate-500">{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-200 hover:text-accent">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ── Mobile bottom bar: Markets · Research · How it works · More ── */}
      <nav
        className="glass fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-edge/40 px-2 py-1.5 sm:hidden"
        aria-label="Mobile navigation"
      >
        <Link
          href="/markets"
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
            activeSection === 'markets' ? 'text-accent' : 'text-slate-500'
          }`}
        >
          <LineChart className="h-4 w-4" />
          Markets
        </Link>
        <Link
          href="/research"
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
            activeSection === 'research' ? 'text-signal' : 'text-slate-500'
          }`}
        >
          <FlaskConical className="h-4 w-4" />
          Research
        </Link>
        <Link
          href="/methodology"
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
            activeSection === 'methodology' ? 'text-accent' : 'text-slate-500'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          How it works
        </Link>
        <div className="relative flex-1">
          <button
            onClick={() => setOpenFlyout(openFlyout === 'more' ? null : 'more')}
            aria-expanded={openFlyout === 'more'}
            className={`flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
              openFlyout === 'more' ? 'text-accent' : 'text-slate-500'
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
            More
          </button>
          {openFlyout === 'more' && (
            <div className="absolute bottom-full right-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-edge/60 bg-panel/95 shadow-card backdrop-blur-xl">
              <div className="p-1.5">
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpenFlyout(null)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-ink-light"
                  >
                    <span className="shrink-0 text-slate-500">{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-200">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
