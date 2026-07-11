/**
 * Shared formatting utilities — single source of truth for all display logic.
 * Import from here. Do not inline format functions in components or pages.
 */

import type { MonitorStatus, RepoTier } from '@lenitnes/types';

// ── Time ──────────────────────────────────────────────────────────────────

/**
 * Human-readable time-ago string.
 * @param iso  ISO 8601 string, or null
 * @param fallback  returned when iso is null (default: 'never')
 */
export function timeAgo(iso: string | null, fallback = 'never'): string {
  if (!iso) return fallback;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * ISO → compact local datetime string, e.g. "2026-04-15 14:32"
 */
export function formatIsoShort(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * ISO → full locale datetime string, e.g. "Apr 15, 2026, 2:32 PM"
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Seconds → compact window label: "15m", "4h", "7d"
 */
export function formatWindow(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// ── Numbers ───────────────────────────────────────────────────────────────

/**
 * Format a 0–1 ratio as a percentage string: 0.625 → "62.5%"
 */
export function formatRatio(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

/** Nullable hit-rate display for calibration / tier tables. */
export function formatNullableRatio(n: number | null, decimals = 0): string {
  if (n == null) return '—';
  return formatRatio(n, decimals);
}

/**
 * Format an already-multiplied percentage with sign: 2.15 → "+2.15%"
 */
export function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/**
 * Format a USD value with optional positive sign.
 * Small amounts (< $1) show 4 decimal places; larger show 2.
 */
export function formatUsd(n: number, opts?: { showPositiveSign?: boolean }): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : opts?.showPositiveSign && n > 0 ? '+' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}k`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(4)}`;
}

/**
 * Format a Sharpe ratio, returning '—' for non-finite values.
 */
export function formatSharpe(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

// ── URLs / Labels ──────────────────────────────────────────────────────────

/**
 * Shorten a URL to a readable label:
 *   https://github.com/zcash/halo2/commits → "zcash/halo2/commits"
 *   https://example.com/releases           → "example.com/releases"
 */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    return (u.hostname.replace(/^www\./, '') + path).slice(0, 50);
  } catch {
    return url.slice(0, 50);
  }
}

/**
 * Classify a GitHub URL path type for display.
 */
export function urlType(url: string): 'release' | 'commits' | 'other' {
  try {
    const path = new URL(url).pathname;
    if (path.includes('/releases')) return 'release';
    if (path.includes('/commits')) return 'commits';
  } catch {
    // fall through
  }
  return 'other';
}

/**
 * Extract a compact "owner/repo" label from a GitHub URL.
 *   https://github.com/zcash/halo2/commits → "zcash/halo2"
 */
export function repoLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    if (!hostname.includes('github.com')) return shortUrl(url);
    return pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  } catch {
    return url;
  }
}

// ── Signal / Agent ─────────────────────────────────────────────────────────

/**
 * Map a conviction score to a Tailwind text-color class.
 * Thresholds: ≥70 → signal (green), ≥50 → warn (amber), <50 → muted slate
 */
export function convictionColor(n: number | null): string {
  if (n == null) return 'text-slate-500';
  if (n >= 70) return 'text-signal';
  if (n >= 50) return 'text-warn';
  return 'text-slate-500';
}

/**
 * Map a 0–100 score to a Tailwind text-color class.
 * Used for per-detector scores where the threshold is looser.
 * Thresholds: ≥70 → signal, ≥40 → warn, <40 → muted
 */
export function scoreColor(n: number): string {
  if (n >= 70) return 'text-signal';
  if (n >= 40) return 'text-warn';
  return 'text-slate-400';
}

/**
 * Map a 0–100 score to a Tailwind bg-color class for progress bars.
 */
export function scoreBgColor(n: number): string {
  if (n >= 70) return 'bg-signal';
  if (n >= 40) return 'bg-warn';
  return 'bg-slate-500';
}

/**
 * Normalise a detector type slug for display: "security_critical_patch" → "security critical patch"
 */
export function formatDetectorType(s: string): string {
  return s.replace(/_/g, ' ');
}

// ── Monitor status ─────────────────────────────────────────────────────────

/**
 * Map monitor status to Tailwind badge classes.
 * active → signal (green) · triggered → accent (cyan) · paused → danger (red)
 */
export function statusColor(s: MonitorStatus): string {
  switch (s) {
    case 'active':
      return 'bg-signal/15 text-signal';
    case 'triggered':
      return 'bg-accent/15 text-accent';
    case 'paused':
      return 'bg-danger/15 text-danger';
  }
}

/**
 * Map monitor status to a dot colour class for inline status indicators.
 */
export function statusDotColor(s: MonitorStatus): string {
  switch (s) {
    case 'active':
      return 'bg-signal';
    case 'triggered':
      return 'bg-accent';
    case 'paused':
      return 'bg-danger';
  }
}

// ── Misc ───────────────────────────────────────────────────────────────────

/**
 * Frequency in seconds → human label: "Every 15m", "Every 2h"
 */
export function freqLabel(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `Every ${mins}m`;
  return `Every ${Math.round(mins / 60)}h`;
}

/**
 * Asset coingeckoId → 3-letter ticker badge label.
 */
export function assetTicker(coingeckoId: string): string {
  const map: Record<string, string> = {
    zcash: 'ZEC',
    bitcoin: 'BTC',
    ethereum: 'ETH',
    solana: 'SOL',
    arbitrum: 'ARB',
    sui: 'SUI',
  };
  return map[coingeckoId] ?? coingeckoId.slice(0, 3).toUpperCase();
}

/**
 * Build a block explorer URL for a transaction hash.
 */
export function explorerUrl(chain: string, txHash: string): string {
  if (chain === 'bsc' || chain === 'bnb') return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chain === 'arbitrum') return `https://sepolia.arbiscan.io/tx/${txHash}`;
  return '#';
}

/** Tailwind classes for A/B/C repo tier badges (calibration, scan, scorecard). */
export function tierBadgeClass(tier?: RepoTier): string {
  if (tier === 'A') return 'bg-signal/15 text-signal';
  if (tier === 'C') return 'bg-danger/15 text-danger';
  if (tier === 'B') return 'bg-accent/10 text-accent';
  return 'bg-slate-800 text-slate-500';
}
