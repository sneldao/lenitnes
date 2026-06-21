import { query } from '../db/pool.js';
import { config } from '../config.js';
import { sendTelegram } from './notify.js';
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
  zcash: { emoji: '\uD83D\uDCB0', label: 'Zcash' },
  bitcoin: { emoji: '\uD83D\uDC51', label: 'Bitcoin' },
  ethereum: { emoji: '\u26A1', label: 'Ethereum' },
  solana: { emoji: '\uD83D\uDC0A', label: 'Solana' },
  bnb: { emoji: '\uD83D\uDD25', label: 'BNB' },
  filecoin: { emoji: '\uD83D\uDCC1', label: 'Filecoin' },
  near: { emoji: '\uD83C\uDF0D', label: 'NEAR' },
};

function assetMeta(asset: string) {
  return (
    ASSET_META[asset] ?? {
      emoji: '\uD83D\uDD17',
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

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function buildWatchReport(): Promise<string> {
  const { rows: monitorRows } = await query<MonitorRow>(
    `SELECT
       m.url,
       m.asset_mapping,
       m.frequency_seconds,
       m.last_check_at,
       (SELECT COUNT(*) FROM signals s WHERE s.monitor_id = m.id AND s.detected_at > now() - interval '7 days') AS signals_7d,
       (SELECT MAX(s.detected_at) FROM signals s WHERE s.monitor_id = m.id) AS last_signal_at
     FROM monitors m
     WHERE m.status = 'active'
     ORDER BY m.url, m.frequency_seconds`,
  );

  const { rows: recentSignals } = await query<SignalRow>(
    `SELECT
       s.id::text,
       LEFT(COALESCE(s.condition_summary, s.evidence_text, ''), 120) AS condition_summary,
       COALESCE(m.asset_mapping->>'coingeckoId', 'unknown') AS asset,
       s.detected_at::text AS detected_at,
       COALESCE(a.conviction, 0)::int AS conviction,
       COALESCE(LEFT(a.thesis, 200), '') AS thesis
     FROM signals s
     LEFT JOIN monitors m ON m.id = s.monitor_id
     LEFT JOIN agent_scores a ON a.signal_id = s.id
     WHERE s.detected_at > now() - interval '24 hours'
     ORDER BY s.detected_at DESC
     LIMIT 5`,
  );

  const groups = groupMonitors(monitorRows);

  const totalSignals = await query<{ c: string }>('SELECT COUNT(*)::text AS c FROM signals').then(
    (r) => parseInt(r.rows[0]?.c ?? '0'),
  );
  const last24hSignals = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM signals WHERE detected_at > now() - interval '24 hours'",
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));
  const aboveThreshold7d = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM agent_scores WHERE conviction >= 70 AND created_at > now() - interval '7 days'",
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));

  const lines: string[] = [];

  // ── Header ──
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`\uD83D\uDEE1\uFE0F LENITNES \u2014 Daily Report \u00B7 ${today}`);
  lines.push('');

  // ── Quick summary line ──
  const activeCount = monitorRows.length;
  const groupsWithSignals = groups.filter((g) => g.monitors.some((m) => m.signals_7d > 0)).length;
  const groupsTotal = groups.length;
  if (aboveThreshold7d > 0) {
    lines.push(`\uD83D\uDD25 ${aboveThreshold7d} high-conviction signal(s) this week`);
    lines.push(
      `\uD83D\uDCCA ${totalSignals} total \u00B7 ${last24hSignals} last 24h \u00B7 ${activeCount} monitors active across ${groupsTotal} repos`,
    );
  } else {
    lines.push(`\u2705 All ${groupsTotal} repos clean \u00B7 ${activeCount} monitors active`);
    lines.push(`\uD83D\uDCCA ${totalSignals} total signals \u00B7 ${last24hSignals} last 24h`);
  }
  lines.push('');

  // ── Recent signals (if any) ──
  if (recentSignals.length > 0) {
    lines.push(`\uD83D\uDCE1 Signals last 24h`);
    for (const s of recentSignals) {
      const meta = assetMeta(s.asset);
      const score = s.conviction >= 70 ? `\uD83D\uDD25 ${s.conviction}` : `${s.conviction}`;
      const link = s.conviction >= 70 ? `${config.webOrigin}/signals/${s.id}` : null;
      lines.push(`  ${meta.emoji} ${s.condition_summary.replace(/\n/g, ' ')}`);
      if (s.thesis) lines.push(`    \uD83E\uDDE0 ${s.thesis}`);
      lines.push(`    Conviction: ${score}${link ? ` \u00B7 ${link}` : ''}`);
    }
    lines.push('');
  }

  // ── Watchlist summary (compact, one line per repo) ──
  for (const group of groups) {
    const meta = assetMeta(group.asset);
    const maxSignals = Math.max(...group.monitors.map((m) => m.signals_7d));
    const maxAgo = group.monitors.reduce(
      (latest, m) =>
        !latest || (m.last_check_at && m.last_check_at > latest) ? m.last_check_at : latest,
      null as string | null,
    );

    let badge: string;
    if (maxSignals > 0) {
      const total = group.monitors.reduce((s, m) => s + m.signals_7d, 0);
      badge = `\uD83D\uDD36 ${total} signal(s)`;
    } else {
      badge = `\u2705 Clean`;
    }
    lines.push(`${meta.emoji} ${meta.label} \u2014 ${badge} \u00B7 checked ${timeAgo(maxAgo)}`);
  }
  lines.push('');

  // ── Stats ──
  lines.push(`\uD83D\uDCCA Stats`);
  lines.push(`\u2022 ${totalSignals} signals processed (all time)`);
  lines.push(`\u2022 ${last24hSignals} checks in last 24h`);
  lines.push(`\u2022 ${aboveThreshold7d} above-threshold signals this week`);
  lines.push('');

  // ── Agent note ──
  lines.push(`\uD83E\uDDE0 Agent note`);
  if (aboveThreshold7d > 0) {
    lines.push(
      `Above-threshold signal activity detected this week. Review the scorecard for conviction scores, thesis, and outcome tracking.`,
    );
  } else if (recentSignals.length > 0) {
    lines.push(
      `${recentSignals.length} new signal(s) detected in the last 24h, all below the conviction threshold (70). The agent is watching but no trade action was warranted.`,
    );
  } else {
    lines.push(
      `No new signals in the last 24h. All ${groupsTotal} watched repos are quiet. The pipeline is healthy and checking on schedule.`,
    );
  }
  lines.push('');

  // ── Footer ──
  lines.push(`\uD83D\uDD17 Scorecard: ${config.webOrigin}/scorecard`);
  lines.push(`\uD83D\uDD0D Source: https://github.com/sneldao/lenitnes`);

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
