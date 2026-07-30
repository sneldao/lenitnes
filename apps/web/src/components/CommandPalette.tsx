'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  BarChart3,
  BookOpen,
  ScanLine,
  PieChart,
  Sliders,
  Brain,
  Eye,
  FileCode2,
  ArrowRight,
  Sparkles,
  Command,
  X,
} from 'lucide-react';
import { CONSENSUS_WATCHLIST } from '@lenitnes/types';
import { cn } from '@/lib/utils';

interface PaletteItem {
  id: string;
  category: 'Navigation' | 'Watchlist Repo' | 'Quick Action';
  title: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
  icon: React.ElementType;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle Command Palette with Cmd+K / Ctrl+K / '/'
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const items: PaletteItem[] = [
    // Navigation
    {
      id: 'nav-scorecard',
      category: 'Navigation',
      title: 'Public Scorecard',
      subtitle: 'Verifiable signal track record & outcome metrics',
      href: '/scorecard',
      icon: BarChart3,
    },
    {
      id: 'nav-methodology',
      category: 'Navigation',
      title: 'Methodology & How it Works',
      subtitle: '4 pillars, LLM Rubric v4, 7 safety gates',
      href: '/methodology',
      icon: BookOpen,
    },
    {
      id: 'nav-scan',
      category: 'Navigation',
      title: 'Leak-Scan Replay Engine',
      subtitle: 'Audit any repo last 90 days of commits',
      href: '/scan',
      icon: ScanLine,
    },
    {
      id: 'nav-portfolio',
      category: 'Navigation',
      title: 'Portfolio & Positions',
      subtitle: 'Paper vs live positions, realized P&L',
      href: '/portfolio',
      icon: PieChart,
    },
    {
      id: 'nav-calibration',
      category: 'Navigation',
      title: 'Calibration & Repo Tiers',
      subtitle: 'A/B/C tiering tables & parameter loops',
      href: '/calibration',
      icon: Sliders,
    },
    {
      id: 'nav-reasoning',
      category: 'Navigation',
      title: 'Agent Reasoning Stream',
      subtitle: 'Live LLM evaluation theses & decisions',
      href: '/reasoning',
      icon: Brain,
    },
    {
      id: 'nav-monitors',
      category: 'Navigation',
      title: 'Monitored Consensus Repos',
      subtitle: 'Live GitHub pollers & detector status',
      href: '/monitors',
      icon: Eye,
    },
    {
      id: 'nav-casestudy',
      category: 'Navigation',
      title: 'Halo2 Case Study',
      subtitle: 'Deep dive into zero-knowledge circuit leak',
      href: '/case-study/halo2',
      icon: FileCode2,
    },

    // Watchlist Repos
    ...CONSENSUS_WATCHLIST.map((repo) => ({
      id: `repo-${repo.repo}`,
      category: 'Watchlist Repo' as const,
      title: repo.repo,
      subtitle: `${repo.asset.toUpperCase()} · ${repo.why}`,
      href: `/scan?repo=${encodeURIComponent(repo.repo)}&asset=${encodeURIComponent(repo.asset)}`,
      icon: Eye,
    })),

    // Quick Actions
    {
      id: 'act-rubric-sim',
      category: 'Quick Action',
      title: 'Launch Rubric v4 Simulator',
      subtitle: 'Interactive conviction score & gate sandbox',
      href: '/methodology#scoring',
      icon: Sparkles,
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase())),
  );

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      setIsOpen(false);
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [router],
  );

  // Keyboard navigation inside palette
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Header Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-xl border border-edge/50 bg-panel/60 px-3 py-1.5 text-xs text-slate-400 hover:border-accent/40 hover:text-slate-200 transition-colors cursor-pointer"
        title="Open Command Palette (⌘K)"
      >
        <Search className="h-3.5 w-3.5 text-slate-500" />
        <span>Search or jump to…</span>
        <kbd className="rounded border border-edge/60 bg-ink-light px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
          ⌘K
        </kbd>
      </button>

      {/* Modal Dialog Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-ink/80 backdrop-blur-md p-4 animate-fade-in">
          <div
            className="w-full max-w-xl rounded-2xl border border-edge/60 bg-panel shadow-card overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-edge/40 px-4 py-3 bg-panel/90">
              <Search className="h-4 w-4 text-accent shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Type a command, page, or repository (e.g. zcash/halo2)…"
                className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <kbd className="hidden sm:inline-block rounded border border-edge/60 bg-ink-light px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="overflow-y-auto p-2 space-y-1 divide-y divide-edge/20">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  No matching pages, repos, or actions found for &quot;{query}&quot;.
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        'group flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-accent/15 border border-accent/30'
                          : 'hover:bg-ink-light/50',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'p-2 rounded-lg border shrink-0',
                            isSelected
                              ? 'bg-accent/20 border-accent/40 text-accent'
                              : 'bg-ink-light/60 border-edge/30 text-slate-400 group-hover:text-slate-200',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div
                            className={cn(
                              'text-xs font-semibold truncate',
                              isSelected ? 'text-slate-100' : 'text-slate-200',
                            )}
                          >
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-[11px] text-slate-500 truncate">
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-ink-light text-slate-500 border border-edge/30">
                          {item.category}
                        </span>
                        <ArrowRight
                          className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            isSelected ? 'text-accent translate-x-0.5' : 'text-slate-600',
                          )}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer tips */}
            <div className="flex items-center justify-between border-t border-edge/40 bg-ink-light/30 px-4 py-2 text-[10px] font-mono text-slate-500">
              <span>Use ↑ ↓ to navigate · Enter to select</span>
              <span>LENITNES Quick Palette</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
