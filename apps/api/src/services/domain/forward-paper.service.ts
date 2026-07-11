import { query } from '../../db/pool.js';
import { directionalPctChange, isDirectionalHit } from './outcome-metrics.js';
import { monitorRepoFromUrl } from './repo-tier-policy.js';

export interface ForwardPaperEntry {
  signalId: string;
  repo: string;
  asset: string | null;
  detectedAt: string;
  conviction: number;
  recommendedAction: string;
  tierPolicy: string | null;
  liveConfirmed: boolean;
  t1dPct: number | null;
  hitT1d: boolean | null;
  matured: boolean;
}

export interface ForwardPaperSummary {
  days: number;
  entries: ForwardPaperEntry[];
  liveAgentCount: number;
  tradeGradeCount: number;
  hitRateT1d: number | null;
  avgDirectionalT1d: number | null;
  liveConfirmedCount: number;
}

/** Forward-looking paper log — live agent scores on watchlist monitors with outcomes. */
export async function getForwardPaperLog(days = 7): Promise<ForwardPaperSummary> {
  const { rows } = await query<{
    signal_id: string;
    detected_at: Date;
    url: string;
    asset: string | null;
    conviction: number;
    recommended_action: string;
    raw_response: Record<string, unknown>;
    pct_change: string | null;
    window_seconds: number | null;
  }>(
    `SELECT s.id AS signal_id,
            s.detected_at,
            m.url,
            COALESCE(s.asset, m.asset_mapping->>'coingeckoId') AS asset,
            ag.conviction,
            ag.recommended_action,
            ag.raw_response,
            so.pct_change,
            so.window_seconds
       FROM agent_scores ag
       JOIN signals s ON s.id = ag.signal_id
       JOIN monitors m ON m.id = s.monitor_id
       LEFT JOIN signal_outcomes so ON so.signal_id = s.id AND so.window_seconds = 86400
      WHERE ag.created_at > now() - ($1::int || ' days')::interval
        AND s.is_heartbeat = false
        AND (ag.raw_response->>'mock') IS DISTINCT FROM 'true'
      ORDER BY ag.created_at DESC
      LIMIT 200`,
    [days],
  );

  const entries: ForwardPaperEntry[] = rows.map((r) => {
    const tierPolicy =
      typeof r.raw_response.tier_policy === 'string' ? r.raw_response.tier_policy : null;
    const liveConfirmed = r.raw_response.live_confirmed === true;
    const t1dPct = r.pct_change != null ? Number(r.pct_change) : null;
    const action = r.recommended_action as 'long' | 'short' | 'none';
    const matured = t1dPct != null;
    const direction = t1dPct == null ? null : t1dPct > 0.1 ? 'up' : t1dPct < -0.1 ? 'down' : 'flat';
    const hitT1d = matured && action !== 'none' ? isDirectionalHit(action, direction) : null;

    return {
      signalId: r.signal_id,
      repo: monitorRepoFromUrl(r.url),
      asset: r.asset,
      detectedAt: r.detected_at.toISOString(),
      conviction: r.conviction,
      recommendedAction: r.recommended_action,
      tierPolicy,
      liveConfirmed,
      t1dPct,
      hitT1d,
      matured,
    };
  });

  const tradeGrade = entries.filter((e) => e.recommendedAction !== 'none' && e.conviction >= 70);
  const matured = tradeGrade.filter((e) => e.matured && e.hitT1d != null);
  const hits = matured.filter((e) => e.hitT1d === true);
  const dirReturns = matured
    .map((e) => directionalPctChange(e.t1dPct, e.recommendedAction as 'long' | 'short' | 'none'))
    .filter((n): n is number => n != null);

  return {
    days,
    entries,
    liveAgentCount: entries.length,
    tradeGradeCount: tradeGrade.length,
    hitRateT1d: matured.length > 0 ? hits.length / matured.length : null,
    avgDirectionalT1d:
      dirReturns.length > 0 ? dirReturns.reduce((s, n) => s + n, 0) / dirReturns.length : null,
    liveConfirmedCount: entries.filter((e) => e.liveConfirmed).length,
  };
}
