import { config } from '../config.js';
import { query } from '../db/pool.js';
import { monitorRepoFromUrl } from './domain/repo-tier-policy.js';
import { directionalPctChange, isDirectionalHit } from './domain/outcome-metrics.js';
import { sendTelegram } from './notify.js';
import { logger } from '../logger.js';

const WINDOW_LABEL: Record<number, string> = {
  3600: 'T+1h',
  14400: 'T+4h',
  86400: 'T+1d',
  604800: 'T+7d',
};

const THESIS_SNIPPET_MAX = 100;
const DIGEST_MIN_ITEMS = 2;

export interface VerdictBroadcastItem {
  signalId: string;
  asset: string;
  windowSeconds: number;
  pctChange: number;
  conviction: number;
  recommendedAction: 'long' | 'short' | 'none';
  thesis: string;
  detectedAt: string;
  repo: string;
  primaryDetector: string | null;
  tierPolicy: string | null;
  tradeMode: 'paper' | 'live';
}

/** Trim thesis for Telegram without cutting mid-word awkwardly. */
export function snippetThesis(thesis: string, max = THESIS_SNIPPET_MAX): string {
  const t = thesis.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + '…';
}

export function formatUtcShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Plain-language price move vs the call direction. */
export function formatPriceMoveNarrative(
  action: 'long' | 'short' | 'none',
  pctChange: number,
): { correct: boolean | null; headline: string; detail: string } {
  const move = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`;
  if (Math.abs(pctChange) <= 0.5) {
    return {
      correct: null,
      headline: `⚪ Price flat (${move})`,
      detail: 'Move within noise — no directional verdict',
    };
  }

  const direction = pctChange > 0 ? 'up' : 'down';
  const correct = isDirectionalHit(action, direction);
  const priceVerb = pctChange > 0 ? 'rose' : 'fell';
  const detail =
    action === 'short'
      ? `Price ${priceVerb} ${move} — SHORT ${correct ? 'wins' : 'loses'}`
      : action === 'long'
        ? `Price ${priceVerb} ${move} — LONG ${correct ? 'wins' : 'loses'}`
        : `Price ${priceVerb} ${move}`;

  const headline = correct ? `✅ ${detail} — call CORRECT` : `❌ ${detail} — call WRONG`;

  return { correct, headline, detail };
}

export function formatSingleVerdictMessage(
  item: VerdictBroadcastItem,
  cohort?: CohortStats,
): string {
  const label = WINDOW_LABEL[item.windowSeconds] ?? `T+${item.windowSeconds}s`;
  const action = item.recommendedAction.toUpperCase();
  const { headline } = formatPriceMoveNarrative(item.recommendedAction, item.pctChange);
  const modeTag = item.tradeMode === 'live' ? 'LIVE' : 'PAPER';
  const detector = item.primaryDetector ? ` · ${item.primaryDetector}` : '';
  const lines: string[] = [
    `🔎 LENITNES · verdict · ${item.asset.toUpperCase()} ${action} @ ${item.conviction}/100 · ${label}`,
    `📍 ${item.repo}${detector} · ${formatUtcShort(item.detectedAt)} · ${modeTag}`,
    '',
    headline,
    '',
    `💭 "${snippetThesis(item.thesis)}"`,
  ];

  if (item.tierPolicy) {
    lines.push(`⚙️ ${item.tierPolicy}`);
  }

  lines.push('', `🔗 ${config.webOrigin}/signals/${item.signalId}`);

  if (cohort && cohort.total >= 3) {
    lines.push(
      '',
      `📊 ${item.asset.toUpperCase()} ${label}: ${cohort.hits}/${cohort.total} correct (${cohort.hitPct}%) · ${config.webOrigin}/calibration`,
    );
  }

  return lines.join('\n');
}

export interface CohortStats {
  hits: number;
  total: number;
  hitPct: string;
  avgDirPct: string | null;
}

export function formatVerdictDigestMessage(
  items: VerdictBroadcastItem[],
  cohort?: CohortStats,
): string {
  const asset = items[0]!.asset.toUpperCase();
  const label = WINDOW_LABEL[items[0]!.windowSeconds] ?? 'T+?';
  const evaluated = items.map((i) => ({
    item: i,
    result: formatPriceMoveNarrative(i.recommendedAction, i.pctChange),
  }));
  const withVerdict = evaluated.filter((e) => e.result.correct != null);
  const hits = withVerdict.filter((e) => e.result.correct).length;
  const dirReturns = withVerdict
    .map((e) => directionalPctChange(e.item.pctChange, e.item.recommendedAction))
    .filter((n): n is number => n != null);
  const avgDir =
    dirReturns.length > 0
      ? `${(dirReturns.reduce((s, n) => s + n, 0) / dirReturns.length).toFixed(1)}%`
      : null;

  const lines: string[] = [
    `🔎 LENITNES · verdict digest · ${asset} · ${label}`,
    `${items.length} calls matured — ${hits}/${withVerdict.length || items.length} correct${avgDir ? ` · avg ${avgDir} directional` : ''}`,
    '',
  ];

  evaluated.forEach(({ item, result }, idx) => {
    const action = item.recommendedAction.toUpperCase();
    const num = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'][idx] ?? `${idx + 1}.`;
    lines.push(
      `${num} ${formatUtcShort(item.detectedAt)} · ${action} @ ${item.conviction} — ${result.headline.replace(/^[✅❌⚪]\s*/, '')}`,
    );
    lines.push(`   "${snippetThesis(item.thesis, 72)}"`);
    lines.push(`   🔗 ${config.webOrigin}/signals/${item.signalId}`);
    if (idx < evaluated.length - 1) lines.push('');
  });

  if (cohort && cohort.total >= 3) {
    lines.push(
      '',
      `📊 ${asset} ${label} all-time: ${cohort.hits}/${cohort.total} (${cohort.hitPct}%) · ${config.webOrigin}/calibration`,
    );
  }

  return lines.join('\n');
}

export async function loadVerdictContext(
  signalId: string,
  asset: string,
): Promise<Omit<VerdictBroadcastItem, 'windowSeconds' | 'pctChange'> | null> {
  const { rows } = await query<{
    conviction: number;
    recommended_action: string;
    thesis: string;
    raw_response: Record<string, unknown>;
    detected_at: Date;
    url: string;
    primary_detector: string | null;
    order_mode: string | null;
  }>(
    `SELECT ag.conviction, ag.recommended_action, ag.thesis, ag.raw_response,
            s.detected_at, m.url,
            (SELECT sc.detector_type FROM signal_classifications sc
              WHERE sc.signal_id = s.id ORDER BY sc.score DESC LIMIT 1) AS primary_detector,
            (SELECT o.order_params->>'mode' FROM orders o
              WHERE o.signal_id = s.id ORDER BY o.placed_at DESC NULLS LAST LIMIT 1) AS order_mode
       FROM agent_scores ag
       JOIN signals s ON s.id = ag.signal_id
       JOIN monitors m ON m.id = s.monitor_id
      WHERE ag.signal_id = $1
      ORDER BY ag.created_at DESC
      LIMIT 1`,
    [signalId],
  );

  const row = rows[0];
  if (!row || row.conviction < 70 || row.recommended_action === 'none') return null;

  const tradeMode: 'paper' | 'live' =
    row.order_mode === 'live' && config.treasury.tradingEnabled ? 'live' : 'paper';

  return {
    signalId,
    asset,
    conviction: row.conviction,
    recommendedAction: row.recommended_action as 'long' | 'short' | 'none',
    thesis: row.thesis,
    detectedAt: row.detected_at.toISOString(),
    repo: monitorRepoFromUrl(row.url),
    primaryDetector: row.primary_detector,
    tierPolicy:
      typeof row.raw_response.tier_policy === 'string' ? row.raw_response.tier_policy : null,
    tradeMode,
  };
}

export async function fetchAssetCohortStats(
  asset: string,
  windowSeconds: number,
): Promise<CohortStats | null> {
  const { rows } = await query<{ hits: string; total: string; avg_dir: string | null }>(
    `SELECT
        COUNT(*) FILTER (WHERE (
          (ag.recommended_action = 'long' AND so.direction = 'up') OR
          (ag.recommended_action = 'short' AND so.direction = 'down')
        ))::text AS hits,
        COUNT(*)::text AS total,
        AVG(CASE WHEN ag.recommended_action = 'short' THEN -so.pct_change::numeric
                 ELSE so.pct_change::numeric END)::text AS avg_dir
       FROM signal_outcomes so
       JOIN agent_scores ag ON ag.signal_id = so.signal_id
      WHERE so.asset = $1
        AND so.window_seconds = $2
        AND ag.conviction >= 70
        AND ag.recommended_action IN ('long', 'short')
        AND ABS(so.pct_change::numeric) > 0.5`,
    [asset, windowSeconds],
  );

  const row = rows[0];
  const total = parseInt(row?.total ?? '0', 10);
  if (!row || total < 3) return null;
  const hits = parseInt(row.hits, 10);
  return {
    hits,
    total,
    hitPct: ((hits / total) * 100).toFixed(0),
    avgDirPct: row.avg_dir != null ? `${Number(row.avg_dir).toFixed(1)}%` : null,
  };
}

function groupVerdicts(items: VerdictBroadcastItem[]): Map<string, VerdictBroadcastItem[]> {
  const groups = new Map<string, VerdictBroadcastItem[]>();
  for (const item of items) {
    const key = `${item.asset}:${item.windowSeconds}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

/** Post verdict(s) — digests when ≥2 same asset+window in one batch. */
export async function broadcastVerdictBatch(items: VerdictBroadcastItem[]): Promise<void> {
  if (!config.telegram.botToken || !config.telegram.publicChannelId || items.length === 0) return;

  const groups = groupVerdicts(items);
  for (const [, group] of groups) {
    const cohort = await fetchAssetCohortStats(group[0]!.asset, group[0]!.windowSeconds);
    const message =
      group.length >= DIGEST_MIN_ITEMS
        ? formatVerdictDigestMessage(group, cohort ?? undefined)
        : formatSingleVerdictMessage(group[0]!, cohort ?? undefined);

    try {
      await sendTelegram(config.telegram.publicChannelId, message);
      logger.info(
        {
          count: group.length,
          asset: group[0]!.asset,
          window: group[0]!.windowSeconds,
          digest: group.length >= DIGEST_MIN_ITEMS,
        },
        'outcome verdict broadcast',
      );
    } catch (err) {
      logger.error({ err, asset: group[0]!.asset }, 'outcome verdict broadcast failed');
    }
  }
}
