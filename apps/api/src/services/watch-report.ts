import { query } from '../db/pool.js';
import { config } from '../config.js';
import { sendTelegram } from './notify.js';
import { getPortfolioSummary } from './portfolio.js';
import { logger } from '../logger.js';

interface MonitorRow {
  url: string;
  asset_mapping: { coingeckoId?: string };
  frequency_seconds: number;
  last_check_at: string | null;
  signals_7d: number;
  last_signal_at: string | null;
}

interface SignalRow {
  id: string;
  condition_summary: string;
  asset: string;
  detected_at: string;
  conviction: number;
  thesis: string;
}

interface RepoGroup {
  repoName: string;
  asset: string;
  label: string;
  monitors: MonitorRow[];
}

const ASSET_META: Record<string, { emoji: string; label: string }> = {
  zcash: { emoji: '💰', label: 'Zcash' },
  bitcoin: { emoji: '👑', label: 'Bitcoin' },
  ethereum: { emoji: '⚡', label: 'Ethereum' },
  solana: { emoji: '🐊', label: 'Solana' },
  bnb: { emoji: '🔥', label: 'BNB' },
  filecoin: { emoji: '📁', label: 'Filecoin' },
  near: { emoji: '🌍', label: 'NEAR' },
};

function assetMeta(asset: string) {
  return (
    ASSET_META[asset] ?? {
      emoji: '🔗',
      label: asset.charAt(0).toUpperCase() + asset.slice(1),
    }
  );
}

function groupMonitors(rows: MonitorRow[]): RepoGroup[] {
  const groups = new Map<string, RepoGroup>();
  for (const r of rows) {
    const u = new URL(r.url);
    const repoName = u.pathname
      .replace(/^\//, '')
      .replace(/\/releases$/, '')
      .replace(/\/commits\/.*/, '');
    const asset = r.asset_mapping?.coingeckoId ?? repoName.split('/')[1] ?? 'unknown';
    if (!groups.has(repoName))
      groups.set(repoName, { repoName, asset, label: assetMeta(asset).label, monitors: [] });
    groups.get(repoName)!.monitors.push(r);
  }
  return [...groups.values()];
}

export async function buildWatchReport(): Promise<string> {
  const { rows: monitorRows } = await query<MonitorRow>(
    `SELECT
       m.url,
       m.asset_mapping,
       m.frequency_seconds,
       m.last_check_at,
       -- heartbeats excluded: a check that found nothing is not "activity"
       (SELECT COUNT(*) FROM signals s WHERE s.monitor_id = m.id AND s.detected_at > now() - interval '7 days' AND s.is_heartbeat = false) AS signals_7d,
       (SELECT MAX(s.detected_at) FROM signals s WHERE s.monitor_id = m.id AND s.is_heartbeat = false) AS last_signal_at
     FROM monitors m
     WHERE m.status = 'active'
     ORDER BY m.url, m.frequency_seconds`,
  );

  // "Top", not "latest": rank by conviction, recency tie-break.
  // Heartbeats and convicted-zero syntheses are not top-of-day material.
  const { rows: recentSignals } = await query<SignalRow>(
    `SELECT
       s.id::text,
       LEFT(COALESCE(s.condition_summary, s.evidence_text, ''), 120) AS condition_summary,
       COALESCE(m.asset_mapping->>'coingeckoId', 'unknown') AS asset,
       s.detected_at::text AS detected_at,
       a.conviction::int AS conviction,
       COALESCE(LEFT(a.thesis, 200), '') AS thesis
     FROM signals s
     LEFT JOIN monitors m ON m.id = s.monitor_id
     JOIN agent_scores a ON a.signal_id = s.id
     WHERE s.detected_at > now() - interval '24 hours'
       AND s.is_heartbeat = false
       AND a.conviction IS NOT NULL
       AND a.conviction > 0
     ORDER BY a.conviction DESC, s.detected_at DESC
     LIMIT 5`,
  );

  const groups = groupMonitors(monitorRows);

  const totalSignals = await query<{ c: string }>(
    'SELECT COUNT(*)::text AS c FROM signals WHERE is_heartbeat = false',
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));
  const last24hSignals = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM signals WHERE detected_at > now() - interval '24 hours' AND is_heartbeat = false",
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));
  const checks24h = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM signals WHERE detected_at > now() - interval '24 hours'",
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));
  const aboveThreshold7d = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM agent_scores WHERE conviction >= 70 AND created_at > now() - interval '7 days'",
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));

  const { rows: recentOrders } = await query<{
    chain: string;
    chain_tx_hash: string | null;
    status: string;
    placed_at: string;
  }>(
    `SELECT chain, chain_tx_hash, status, placed_at::text AS placed_at
       FROM orders
      WHERE placed_at > now() - interval '7 days'
      ORDER BY placed_at DESC
      LIMIT 5`,
  );

  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const groupsTotal = groups.length;
  const activeCount = monitorRows.length;

  // ── Lead: state-of-the-agent in one line ──
  // Same voice as the hourly heartbeat — verdict first, infra last.
  // Daily is "what happened today"; hourly is "where are we now".
  if (aboveThreshold7d > 0) {
    lines.push(
      `🛡️ LENITNES · daily · ${today} · ${aboveThreshold7d} high-conviction signal(s) this week`,
    );
  } else if (recentSignals.length > 0) {
    const top = recentSignals[0];
    const topMeta = assetMeta(top.asset);
    lines.push(
      `🛡️ LENITNES · daily · ${today} · ${topMeta.label} ${top.conviction}/100 (close miss)`,
    );
  } else {
    lines.push(`🛡️ LENITNES · daily · ${today} · all ${groupsTotal} repos clean`);
  }
  lines.push('');

  // ── Top signals — show the actual thesis, not a count ──
  if (recentSignals.length > 0) {
    lines.push(`💭 Top signals (24h)`);
    for (const s of recentSignals.slice(0, 3)) {
      const meta = assetMeta(s.asset);
      const link = s.conviction >= 70 ? ` · ${config.webOrigin}/signals/${s.id}` : '';
      lines.push(`   ${meta.emoji} ${meta.label} · ${s.conviction}/100${link}`);
      if (s.thesis) lines.push(`     "${s.thesis.replace(/\n/g, ' ')}"`);
    }
    lines.push('');
  }

  // ── Watchlist roll-up — only show movers ──
  const noisy = groups
    .map((g) => ({ group: g, total: g.monitors.reduce((s, m) => s + m.signals_7d, 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  if (noisy.length > 0) {
    lines.push(`📊 Watchlist activity (7d, real signals — heartbeats excluded)`);
    // Two repos can map to the same asset (geth + reth → Ethereum):
    // disambiguate with the repo name on repeats so the list never
    // shows the same label twice with no way to tell them apart.
    const seenLabels = new Map<string, number>();
    for (const { group, total } of noisy) {
      const meta = assetMeta(group.asset);
      const dupes = (seenLabels.get(meta.label) ?? 0) + 1;
      seenLabels.set(meta.label, dupes);
      const repoShort = group.repoName.split('/')[1] ?? group.repoName;
      lines.push(
        `   ${meta.emoji} ${meta.label}${dupes > 1 ? ` (${repoShort})` : ''} · ${total} signal(s)`,
      );
    }
    const quietCount = groupsTotal - noisy.length;
    if (quietCount > 0) lines.push(`   … ${quietCount} other repo(s) quiet`);
    lines.push('');
  }

  // ── Trades — only when something fired ──
  if (recentOrders.length > 0) {
    lines.push(`💼 Trades (7d)`);
    for (const o of recentOrders) {
      const tx = o.chain_tx_hash ? o.chain_tx_hash.slice(0, 10) + '…' : 'pending';
      const venue = o.chain_tx_hash?.startsWith('0xpropr:')
        ? ' · propr perp'
        : o.chain_tx_hash?.startsWith('0xpap')
          ? ' · paper'
          : '';
      lines.push(`   ${o.chain} · ${o.status}${venue} · ${tx} (${o.placed_at.slice(0, 10)})`);
    }
    lines.push('');
  }

  // ── Book state — moved here from the (removed) hourly heartbeat.
  //    Public-safe fields only; no internal hygiene warnings.
  try {
    const book = await getPortfolioSummary();
    if (book.total_open_positions > 0 || book.total_closed_positions > 0) {
      const realized = book.realized_pnl_usd;
      const unrealized = book.unrealized_pnl_usd;
      const parts = [
        `${book.total_open_positions} open`,
        `${book.total_closed_positions} closed`,
        `${realized >= 0 ? '+' : ''}$${realized.toFixed(2)} realized`,
      ];
      if (book.total_open_positions > 0) {
        parts.push(`${unrealized >= 0 ? '+' : ''}$${unrealized.toFixed(2)} unrealized`);
      }
      lines.push(`💼 Book · ${parts.join(' · ')}`);
      lines.push('');
    }
  } catch (err) {
    logger.warn({ err }, 'watch report: portfolio summary failed (section skipped)');
  }

  // ── One-line stat strip + footer ──
  lines.push(
    `📈 ${totalSignals} scored signals · ${last24hSignals} new (24h) · ${checks24h} checks (24h) · ${activeCount} monitors · ${groupsTotal} repos`,
  );
  lines.push('');
  lines.push(`🔗 ${config.webOrigin}/scorecard · ${config.webOrigin}/portfolio`);

  return lines.join('\n');
}

let lastReportDate = '';

export async function sendDailyWatchReport(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (today === lastReportDate && process.env.NODE_ENV !== 'test') return;
  lastReportDate = today;

  if (!config.telegram.botToken || !config.telegram.publicChannelId) {
    logger.warn('telegram not configured — watch report skipped');
    return;
  }

  try {
    const report = await buildWatchReport();
    await sendTelegram(config.telegram.publicChannelId, report);
    logger.info('daily watch report sent to telegram');
  } catch (err) {
    logger.error({ err }, 'daily watch report failed');
  }
}
