import { query } from '../db/pool.js';
import { config } from '../config.js';
import { sendTelegram } from './notify.js';
import { getPortfolioSummary } from './portfolio.js';
import { monitorRepoFromUrl } from './domain/repo-tier-policy.js';
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

interface ResearchRow {
  sig24h: string;
  sig7d: string;
  alerts7d: string;
  confirmed7d: string;
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

interface ResearchSignalRow {
  id: string;
  url: string;
  conviction: number;
  action: string;
  thesis: string;
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

  // ── [markets] — "Top", not "latest": rank by conviction, recency
  // tie-break. Heartbeats and convicted-zero syntheses are not
  // top-of-day material.
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
       AND m.domain = 'code'
       AND a.conviction IS NOT NULL
       AND a.conviction > 0
     ORDER BY a.conviction DESC, s.detected_at DESC
     LIMIT 5`,
  );

  // ── [research] — the second oracle, same loop. Absent here, a
  //    quiet research week would be invisible on the channel, and the
  //    digest would read as a trading journal — the exact blended
  //    signal the brand split removes.
  const { rows: researchRows } = await query<ResearchRow>(
    `SELECT
       COUNT(*) FILTER (WHERE s.detected_at > now() - interval '24 hours')::text AS sig24h,
       COUNT(*)::text AS sig7d,
       COUNT(*) FILTER (WHERE ag.recommended_action = 'alert')::text AS alerts7d,
       COUNT(*) FILTER (
         WHERE ag.recommended_action = 'alert'
           AND EXISTS (
             SELECT 1 FROM signal_outcomes o
             WHERE o.signal_id = s.id AND o.event_match_status = 'confirmed'
           )
       )::text AS confirmed7d
     FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     JOIN agent_scores ag ON ag.signal_id = s.id
     WHERE m.domain = 'science'
       AND s.is_heartbeat = false
       AND s.detected_at > now() - interval '7 days'
       AND ag.recommended_action IN ('alert', 'investigate', 'none')`,
  );
  const research = researchRows[0];

  const { rows: topResearch } = await query<ResearchSignalRow>(
    `SELECT
       s.id::text,
       m.url,
       ag.conviction::int AS conviction,
       ag.recommended_action AS action,
       COALESCE(LEFT(ag.thesis, 200), '') AS thesis
     FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     JOIN agent_scores ag ON ag.signal_id = s.id
     WHERE m.domain = 'science'
       AND s.is_heartbeat = false
       AND s.detected_at > now() - interval '7 days'
       AND ag.conviction IS NOT NULL
       AND ag.conviction > 0
     ORDER BY ag.conviction DESC, s.detected_at DESC
     LIMIT 1`,
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
  // Verdicts notarized on Hedera HCS — the shared proof spine. Same
  // filter as the scorecard's proofCoverage (successful 0.0.x message ids).
  const { rows: notarizedRows } = await query<{ total: string; with_hedera: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (
         WHERE hedera_hcs_message_id IS NOT NULL
           AND hedera_hcs_message_id LIKE '0.0.%'
       )::text AS with_hedera
     FROM signals WHERE NOT is_heartbeat`,
  );
  const notarized = parseInt(notarizedRows[0]?.with_hedera ?? '0');

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

  // ── Lead: the instrument, not a vertical ──
  // One engine, two oracles: the loop, the notarization, and the
  // grading discipline are the identity. Vertical sections follow.
  lines.push(`🛡️ LENITNES · daily · ${today}`);
  lines.push(
    `${totalSignals} judgments scored · ${notarized} notarized (HCS) · ${activeCount} monitors · ${groupsTotal} repos`,
  );
  lines.push('');

  // ── [markets] ───────────────────────────────────────────────
  if (recentSignals.length > 0) {
    lines.push(`[markets] · top judgments (24h)`);
    for (const s of recentSignals.slice(0, 3)) {
      const meta = assetMeta(s.asset);
      const link = s.conviction >= 70 ? ` · ${config.webOrigin}/signals/${s.id}` : '';
      lines.push(`   ${meta.emoji} ${meta.label} · ${s.conviction}/100${link}`);
      if (s.thesis) lines.push(`     "${s.thesis.replace(/\n/g, ' ')}"`);
    }
  } else {
    lines.push(`[markets] · nothing above threshold (24h) — selective silence`);
  }
  // Watchlist roll-up — only show movers
  const noisy = groups
    .map((g) => ({ group: g, total: g.monitors.reduce((s, m) => s + m.signals_7d, 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  if (noisy.length > 0) {
    const seenLabels = new Map<string, number>();
    for (const { group, total } of noisy.slice(0, 4)) {
      const meta = assetMeta(group.asset);
      const dupes = (seenLabels.get(meta.label) ?? 0) + 1;
      seenLabels.set(meta.label, dupes);
      const repoShort = group.repoName.split('/')[1] ?? group.repoName;
      lines.push(
        `   ${meta.emoji} ${meta.label}${dupes > 1 ? ` (${repoShort})` : ''} · ${total} signal(s) (7d)`,
      );
    }
    const quietCount = groupsTotal - noisy.length;
    if (quietCount > 0) lines.push(`   … ${quietCount} other repo(s) quiet`);
  }
  if (recentOrders.length > 0) {
    lines.push(`   💼 trades (7d) · ${recentOrders.length}`);
  }
  // Book state — public-safe fields only; no internal hygiene warnings.
  try {
    const book = await getPortfolioSummary();
    if (book.total_open_positions > 0 || book.total_closed_positions > 0) {
      const realized = book.realized_pnl_usd;
      const parts = [
        `${book.total_open_positions} open`,
        `${book.total_closed_positions} closed`,
        `${realized >= 0 ? '+' : ''}$${realized.toFixed(2)} realized`,
      ];
      lines.push(`   📒 book · ${parts.join(' · ')}`);
    }
  } catch (err) {
    logger.warn({ err }, 'watch report: portfolio summary failed (section skipped)');
  }
  lines.push('');

  // ── [research] ──────────────────────────────────────────────
  const res = research as ResearchRow | undefined;
  const res24h = Number(res?.sig24h ?? 0);
  const res7d = Number(res?.sig7d ?? 0);
  const resAlerts = Number(res?.alerts7d ?? 0);
  const resConfirmed = Number(res?.confirmed7d ?? 0);
  lines.push(
    `[research] · ${res24h} judgment(s) (24h) · ${res7d} (7d) · ${resAlerts} alert(s) · ${resConfirmed} confirmed record event(s)`,
  );
  const top = topResearch[0];
  if (top) {
    const repo = monitorRepoFromUrl(top.url);
    lines.push(
      `   🔬 ${repo} · ${top.conviction}/100 (${top.action}) · ${config.webOrigin}/signals/${top.id}`,
    );
    if (top.thesis) lines.push(`     "${top.thesis.replace(/\n/g, ' ')}"`);
  } else {
    lines.push(`   💤 no judgments this week — record unchanged`);
  }
  lines.push('');

  // ── One-line stat strip + deep links, both verticals ──
  lines.push(
    `📊 ${totalSignals} scored · ${notarized} notarized · ${last24hSignals} new (24h) · ${checks24h} checks (24h)`,
  );
  lines.push('');
  lines.push(
    `🔗 ${config.webOrigin}/scorecard?domain=markets · ${config.webOrigin}/scorecard?domain=research\n🔗 ${config.webOrigin}/reasoning`,
  );

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
