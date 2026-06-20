import { query } from '../db/pool.js';
import { config } from '../config.js';
import { sendTelegram } from './notify.js';
import { logger } from '../logger.js';

interface MonitorRow {
  url: string;
  condition_text: string;
  asset_mapping: { coingeckoId?: string };
  frequency_seconds: number;
  last_check_at: string | null;
  signals_7d: number;
  last_signal_at: string | null;
}

interface RepoGroup {
  repoName: string;
  asset: string;
  monitors: MonitorRow[];
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
    if (!groups.has(repoName)) groups.set(repoName, { repoName, asset, monitors: [] });
    groups.get(repoName)!.monitors.push(r);
  }
  return [...groups.values()];
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${seconds / 60}m`;
  return `${seconds / 3600}h`;
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
  const { rows } = await query<MonitorRow>(
    `SELECT
       m.url,
       m.condition_text,
       m.asset_mapping,
       m.frequency_seconds,
       m.last_check_at,
       (SELECT COUNT(*) FROM signals s WHERE s.monitor_id = m.id AND s.detected_at > now() - interval '7 days') AS signals_7d,
       (SELECT MAX(s.detected_at) FROM signals s WHERE s.monitor_id = m.id) AS last_signal_at
     FROM monitors m
     WHERE m.status = 'active'
     ORDER BY m.url, m.frequency_seconds`,
  );

  const groups = groupMonitors(rows);
  const totalSignals = await query<{ c: string }>('SELECT COUNT(*)::text AS c FROM signals').then(
    (r) => parseInt(r.rows[0]?.c ?? '0'),
  );
  const last24hSignals = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM signals WHERE detected_at > now() - interval '24 hours'",
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));
  const aboveThreshold = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM agent_scores WHERE conviction >= 70 AND created_at > now() - interval '7 days'",
  ).then((r) => parseInt(r.rows[0]?.c ?? '0'));

  const lines: string[] = [];
  lines.push('\uD83D\uDEE1\uFE0F LENITNES \u2014 Daily Watch Report');
  lines.push('');

  for (const group of groups) {
    const emoji =
      group.asset === 'zcash'
        ? '\uD83D\uDCB0'
        : group.asset === 'bitcoin'
          ? '\uD83D\uDC51'
          : group.asset === 'ethereum'
            ? '\u26A1'
            : group.asset === 'solana'
              ? '\uD83D\uDC0A'
              : '\uD83D\uDD17';
    lines.push(
      `${emoji} ${group.asset.charAt(0).toUpperCase() + group.asset.slice(1)} \u2014 github.com/${group.repoName}`,
    );

    for (const m of group.monitors) {
      const cond =
        m.condition_text.length > 60 ? m.condition_text.slice(0, 60) + '\u2026' : m.condition_text;
      const freq = formatDuration(m.frequency_seconds);
      const ago = timeAgo(m.last_check_at);
      const status = m.signals_7d > 0 ? '\u26A0\uFE0F Signal' : '\u2705 No signal';
      lines.push(`  \u2022 ${cond}`);
      lines.push(`    Check: ${freq} intervals \u00B7 Last: ${ago} \u00B7 ${status}`);
    }
    lines.push('');
  }

  lines.push(`\uD83D\uDCCA Stats`);
  lines.push(`\u2022 ${totalSignals} signals processed`);
  lines.push(`\u2022 ${last24hSignals} checks in last 24h`);
  lines.push(`\u2022 ${aboveThreshold} above-threshold signals this week`);
  lines.push('');
  lines.push(`\uD83E\uDDE0 Agent verdict`);
  const anySignal = rows.some((r) => r.signals_7d > 0);
  if (anySignal) {
    lines.push(`At least one monitor has recent signal activity. Check the scorecard for details.`);
  } else {
    lines.push(
      `No repo in the watchlist has pushed a commit or release matching our detector keywords. The system is alive and checking every 30s\u20136h depending on the monitor.`,
    );
    lines.push(``);
    lines.push(`Absence of signal is itself a signal: the network is quiet.`);
  }
  lines.push(``);
  lines.push(`Scorecard: ${config.webOrigin}/scorecard`);
  lines.push(`Source: https://github.com/sneldao/lenitnes`);

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
