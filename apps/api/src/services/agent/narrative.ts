// ─────────────────────────────────────────────────────────────
// Narrative context — the cross-signal synthesis layer.
//
// The agent historically scored each signal in isolation: one
// monitor's commits + that asset's market data. That is why
// individual updates "rareely produce enough impetus" — the agent
// never saw the pattern, only the dots. This module is the single
// source of truth for building the cross-signal narrative that is
// injected into every agent score (AgentInput.narrative_context,
// rubric v3).
//
// Two consumers share one builder (DRY):
//   1. loop.ts — builds per-signal context before scoreAndPersist,
//      so every commit signal is scored with knowledge of what the
//      OTHER repos + the SoSoValue news feed did in the same window.
//   2. narrative.runNarrativeScan — the periodic portfolio-wide
//      scan that fires when no individual monitor crossed threshold
//      but the cluster is meaningful. (Phase 2.)
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { FEATURES } from '../../features.js';
import { cacheInvalidate } from '../../middleware/cache.js';
import { marketData } from '../data-providers/registry.js';
import { scoreAndPersist, buildAgentEnvFromConfig, buildBookContext } from '../agent.js';
import { executeAgentTrade } from '../treasury.js';
import { broadcastSignal, buildOutcomeWindows } from '../notify.js';
import { getProofService } from '../proof.js';
import { newsSignalDetector } from '../detectors/news-signal.js';
import type { NewsEvidence } from '../detectors/types.js';
import type { AssetMapping, AgentScore } from '@lenitnes/types';

interface RecentSignalRow {
  asset: string | null;
  conviction: number | null;
  recommended_action: string | null;
  detector_types: string[] | null;
  thesis: string | null;
  detected_at: string;
}

/**
 * Fetch the recent (last 24h) non-heartbeat signals across ALL
 * monitors, joined to their agent score + detector classifications.
 * Returns the strongest signals first (conviction desc). Capped at
 * 12 rows to keep the prompt compact.
 */
async function recentSignalsAcrossMonitors(): Promise<RecentSignalRow[]> {
  const { rows } = await query<RecentSignalRow>(
    `SELECT m.asset_mapping->>'coingeckoId' AS asset,
            a.conviction,
            a.recommended_action,
            ARRAY_AGG(DISTINCT sc.detector_type) AS detector_types,
            LEFT(a.thesis, 140) AS thesis,
            s.detected_at::text
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
       LEFT JOIN agent_scores a ON a.signal_id = s.id
       LEFT JOIN signal_classifications sc ON sc.signal_id = s.id
      WHERE s.is_heartbeat = false
        AND s.detected_at > now() - interval '24 hours'
        AND m.url NOT LIKE 'narrative:%'
      GROUP BY s.id, m.asset_mapping, a.conviction, a.recommended_action,
               a.thesis, s.detected_at
      ORDER BY a.conviction DESC NULLS LAST, s.detected_at DESC
      LIMIT 12`,
  );
  return rows;
}

/**
 * Tally of how many signals each asset produced in the last 24h.
 * Surfaces "which assets are active right now" so the agent can
 * spot correlated activity (e.g. BTC + ETH + ZEC all firing).
 */
async function crossAssetActivity(): Promise<Array<{ asset: string; count: string }>> {
  const { rows } = await query<{ asset: string; count: string }>(
    `SELECT m.asset_mapping->>'coingeckoId' AS asset,
            COUNT(*)::text AS count
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
      WHERE s.is_heartbeat = false
        AND s.detected_at > now() - interval '24 hours'
        AND m.url NOT LIKE 'narrative:%'
      GROUP BY m.asset_mapping->>'coingeckoId'
      ORDER BY COUNT(*) DESC`,
  );
  return rows;
}

/**
 * Build the narrative context string for a single signal's agent
 * score. Includes:
 *   - Recent signals across all monitors (the cross-repo cluster)
 *   - Cross-asset activity tally
 *   - SoSoValue news for THIS signal's asset (corroboration)
 *
 * Returns '' when there is no recent activity and no news, so the
 * agent prompt stays unchanged for the cold-start case.
 */
export async function buildNarrativeContext(assetMapping: {
  coingeckoId?: string;
}): Promise<string> {
  const [recent, activity] = await Promise.all([
    recentSignalsAcrossMonitors(),
    crossAssetActivity(),
  ]);

  const lines: string[] = [];

  if (recent.length > 0) {
    lines.push('--- Cross-signal narrative (last 24h, all monitors) ---');
    for (const r of recent) {
      const asset = (r.asset ?? 'unknown').toUpperCase();
      const conv = r.conviction != null ? ` ${r.conviction}/100` : '';
      const action = r.recommended_action ? ` ${r.recommended_action.toUpperCase()}` : '';
      const detectors = (r.detector_types ?? []).filter(Boolean).join(', ');
      const thesis = r.thesis ? ` — ${r.thesis}` : '';
      lines.push(`  ${asset}${action}${conv} [${detectors}]${thesis}`);
    }
  }

  if (activity.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('--- Cross-asset activity (24h) ---');
    lines.push(
      '  ' + activity.map((a) => `${(a.asset ?? 'unknown').toUpperCase()} ×${a.count}`).join(', '),
    );
  }

  // SoSoValue news corroboration for this signal's asset.
  if (FEATURES.sosovalue && assetMapping.coingeckoId) {
    try {
      const { searchNews } = await import('../data-providers/sosovalue/index.js');
      const news = await searchNews(assetMapping.coingeckoId);
      if (news.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push(
          `--- SoSoValue news for ${assetMapping.coingeckoId} (top ${Math.min(news.length, 5)}) ---`,
        );
        for (const n of news.slice(0, 5)) {
          lines.push(`  ${n.title}`);
        }
      }
    } catch (err) {
      logger.warn({ err }, 'narrative: sosovalue news fetch failed (non-blocking)');
    }
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Periodic narrative scan (Phase 2).
//
// Runs on its own scheduler cron (every 2h). Gathers the cross-
// repo + SoSoValue-news cluster and, when it is meaningful, scores
// it as a synthesis signal under the `narrative:portfolio` monitor
// — so the agent can trade a cross-repo theme even when no
// individual monitor crossed threshold. Reuses scoreAndPersist +
// executeAgentTrade + broadcastSignal (DRY); only the signal-row +
// HCS persist is narrative-specific.
// ─────────────────────────────────────────────────────────────

const NARRATIVE_MONITOR_URL = 'narrative:portfolio';
/** Min recent signals (last 24h, distinct assets) for a commit-driven cluster. */
const MIN_SIGNALS_FOR_CLUSTER = 2;
/** Min sentiment-matching news items for a news-driven cluster. */
const MIN_NEWS_FOR_CLUSTER = 3;

interface NarrativeCluster {
  meaningful: boolean;
  dominantAsset: string | null;
  assetMapping: AssetMapping;
  evidenceSummary: string;
  news: NewsEvidence[];
  /** Human-readable reason the cluster was/wasn't meaningful. */
  reason: string;
}

/**
 * The distinct assets the agent currently watches (coingeckoIds
 * from active, non-narrative monitors). Used to scope news scans
 * when there are no recent signals to derive a dominant asset.
 */
async function watchedAssets(): Promise<string[]> {
  const { rows } = await query<{ asset: string }>(
    `SELECT DISTINCT m.asset_mapping->>'coingeckoId' AS asset
       FROM monitors m
      WHERE m.url NOT LIKE 'narrative:%'
        AND m.asset_mapping->>'coingeckoId' IS NOT NULL`,
  );
  return rows.map((r) => r.asset).filter(Boolean);
}

/**
 * Aggregate recent signals by asset to find the dominant one — the
 * asset with the highest total conviction in the last 24h. Returns
 * the coingeckoId and the majority recommended action.
 */
async function dominantAssetFromSignals(
  recent: RecentSignalRow[],
): Promise<{ asset: string; action: 'long' | 'short' | 'none' } | null> {
  const byAsset = new Map<string, { conviction: number; actions: Record<string, number> }>();
  for (const r of recent) {
    if (!r.asset) continue;
    const entry = byAsset.get(r.asset) ?? { conviction: 0, actions: {} };
    entry.conviction += r.conviction ?? 0;
    const act = r.recommended_action ?? 'none';
    entry.actions[act] = (entry.actions[act] ?? 0) + 1;
    byAsset.set(r.asset, entry);
  }
  if (byAsset.size === 0) return null;
  let best: { asset: string; action: 'long' | 'short' | 'none' } | null = null;
  let bestConv = -1;
  for (const [asset, e] of byAsset) {
    if (e.conviction > bestConv) {
      bestConv = e.conviction;
      const topAction = (Object.entries(e.actions).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        'none') as 'long' | 'short' | 'none';
      best = { asset, action: topAction };
    }
  }
  return best;
}

/**
 * Gather the narrative cluster: recent cross-repo signals + SoSoValue
 * news for the dominant asset. Decides whether the cluster is
 * meaningful enough to spend an agent call on.
 */
async function gatherNarrativeCluster(): Promise<NarrativeCluster> {
  const recent = await recentSignalsAcrossMonitors();
  const dominant = await dominantAssetFromSignals(recent);

  // Commit-driven cluster: ≥2 recent signals across distinct assets.
  const distinctAssets = new Set(recent.map((r) => r.asset).filter(Boolean));
  if (recent.length >= MIN_SIGNALS_FOR_CLUSTER && distinctAssets.size >= 2 && dominant) {
    const news = await fetchNewsForAsset(dominant.asset);
    const evidenceSummary = buildClusterSummary(recent, dominant.asset, news);
    return {
      meaningful: true,
      dominantAsset: dominant.asset,
      assetMapping: { coingeckoId: dominant.asset, direction: 'both' },
      evidenceSummary,
      news,
      reason: `${recent.length} signals across ${distinctAssets.size} assets (24h)`,
    };
  }

  // News-driven cluster: OPT-IN (NARRATIVE_NEWS_CLUSTER=1). With this
  // branch on by default, the news cycle became the dominant signal
  // source (43 of 54 scores) and drowned the commit thesis the
  // operation exists to prove — every 2h scan re-scored the same
  // headlines, flip-flopping direction. News is corroboration for
  // commit signals (rubric v4 caps news-only conviction at 65);
  // a news-only TRADE cluster must be explicitly enabled.
  if (FEATURES.sosovalue && process.env.NARRATIVE_NEWS_CLUSTER === '1') {
    const assets = await watchedAssets();
    for (const asset of assets.slice(0, 3)) {
      const news = await fetchNewsForAsset(asset);
      const sentimentCount = countSentimentNews(news);
      if (sentimentCount >= MIN_NEWS_FOR_CLUSTER) {
        const evidenceSummary = buildClusterSummary(recent, asset, news);
        return {
          meaningful: true,
          dominantAsset: asset,
          assetMapping: { coingeckoId: asset, direction: 'both' },
          evidenceSummary,
          news,
          reason: `${sentimentCount} sentiment news items for ${asset}`,
        };
      }
    }
  }

  return {
    meaningful: false,
    dominantAsset: dominant?.asset ?? null,
    assetMapping: { direction: 'both' },
    evidenceSummary: '',
    news: [],
    reason: recent.length === 0 ? 'no recent signals' : 'insufficient cluster size',
  };
}

async function fetchNewsForAsset(asset: string): Promise<NewsEvidence[]> {
  if (!FEATURES.sosovalue) return [];
  try {
    const { searchNews } = await import('../data-providers/sosovalue/index.js');
    const items = await searchNews(asset);
    return items.map((n) => ({
      title: n.title,
      content: n.content,
      categories: [n.category],
      currencies: n.matched_currencies?.map((c) => ({ name: c.name })) ?? [],
      tags: n.tags ?? [],
    }));
  } catch (err) {
    logger.warn({ err, asset }, 'narrative: news fetch for asset failed (non-blocking)');
    return [];
  }
}

/** Count news items the news-signal detector would classify (any sentiment hit). */
function countSentimentNews(news: NewsEvidence[]): number {
  let count = 0;
  for (const n of news) {
    const result = newsSignalDetector.detect({
      result: { conditionMet: true, confidence: 100, evidence: '', summary: '' },
      commits: [],
      monitorUrl: '',
      monitorCondition: '',
      news: [n],
    });
    if (result) count++;
  }
  return count;
}

function buildClusterSummary(
  recent: RecentSignalRow[],
  dominantAsset: string,
  news: NewsEvidence[],
): string {
  const lines: string[] = [`Narrative synthesis · dominant asset ${dominantAsset.toUpperCase()}`];
  if (recent.length > 0) {
    lines.push(`Recent signals (24h): ${recent.length}`);
    for (const r of recent.slice(0, 6)) {
      const a = (r.asset ?? 'unknown').toUpperCase();
      const c = r.conviction != null ? ` ${r.conviction}/100` : '';
      const act = r.recommended_action ? ` ${r.recommended_action.toUpperCase()}` : '';
      lines.push(`  ${a}${act}${c}`);
    }
  }
  if (news.length > 0) {
    lines.push(`SoSoValue news: ${news.length} items`);
    for (const n of news.slice(0, 4)) lines.push(`  ${n.title}`);
  }
  return lines.join('\n');
}

/**
 * Run one narrative-synthesis scan. Idempotent within a window: a
 * guard flag prevents re-entrancy. No-ops (no signal row, no agent
 * call) when the cluster is not meaningful — this is what turns
 * "0 signals scanned, quiet hour" into either a real synthesis
 * signal or a quiet no-op that costs nothing.
 */
let narrativeRunning = false;
export async function runNarrativeScan(): Promise<void> {
  if (narrativeRunning) return;
  narrativeRunning = true;
  try {
    const { rows: monitorRows } = await query<{ id: string; confidence_threshold: number }>(
      `SELECT id, confidence_threshold FROM monitors WHERE url = $1`,
      [NARRATIVE_MONITOR_URL],
    );
    const monitor = monitorRows[0];
    if (!monitor) {
      logger.warn('narrative scan: narrative:portfolio monitor not seeded — skipping');
      return;
    }

    const cluster = await gatherNarrativeCluster();
    if (!cluster.meaningful) {
      logger.debug({ reason: cluster.reason }, 'narrative scan: no meaningful cluster');
      return;
    }

    // Create the synthesis signal row.
    const detectedAt = new Date().toISOString();
    const { rows: sigRows } = await query<{ id: string }>(
      `INSERT INTO signals (monitor_id, detected_at, evidence_text, condition_summary, is_heartbeat)
       VALUES ($1, $2, $3, $4, false) RETURNING id`,
      [monitor.id, detectedAt, cluster.evidenceSummary, cluster.evidenceSummary],
    );
    const signalId = sigRows[0].id;
    cacheInvalidate('scorecard:');

    // HCS timestamp anchor (best-effort, mirrors loop.ts §4).
    const proof = getProofService();
    if (proof.writeHcsMessage) {
      try {
        const hcs = await proof.writeHcsMessage({
          kind: 'signal',
          signalId,
          monitorId: monitor.id,
          ts: detectedAt,
          evidence: cluster.evidenceSummary.slice(0, 500),
          summary: 'narrative synthesis',
        });
        await query(
          `UPDATE signals SET hedera_hcs_message_id = COALESCE($1, hedera_hcs_message_id) WHERE id = $2`,
          [hcs.hederaTxId, signalId],
        );
      } catch (err) {
        logger.warn(
          { err, signalId },
          'narrative scan: HCS timestamp anchor failed (non-blocking)',
        );
      }
    }

    // Run the news detector on the cluster news so the agent has a
    // classification to score against (narrative signals carry no
    // commit detectors).
    let classifications: Array<{
      detector_type: string;
      score: number;
      confidence: number;
      label: string;
      metadata: Record<string, unknown>;
    }> = [];
    if (cluster.news.length > 0) {
      const newsResult = newsSignalDetector.detect({
        result: { conditionMet: true, confidence: 100, evidence: '', summary: '' },
        commits: [],
        monitorUrl: NARRATIVE_MONITOR_URL,
        monitorCondition: 'narrative synthesis',
        news: cluster.news,
      });
      if (newsResult) {
        classifications = [
          {
            detector_type: newsResult.type,
            score: newsResult.score,
            confidence: newsResult.confidence,
            label: newsResult.label,
            metadata: newsResult.metadata,
          },
        ];
        await query(
          `INSERT INTO signal_classifications
             (signal_id, detector_type, score, confidence, label, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            signalId,
            newsResult.type,
            newsResult.score,
            newsResult.confidence,
            newsResult.label,
            JSON.stringify(newsResult.metadata),
          ],
        );
      }
    }

    // Build market + narrative context and score.
    const coingeckoId = cluster.dominantAsset;
    const [metrics, quotes] = await Promise.all([
      marketData.getGlobalMetrics(),
      coingeckoId ? marketData.getQuotes([coingeckoId]) : Promise.resolve([]),
    ]);
    let marketContext = marketData.formatMarketContext(metrics, quotes);
    if (FEATURES.sosovalue) {
      const { buildMacroContext, buildIndexContext } =
        await import('../data-providers/sosovalue/index.js');
      const [macroCtx, indexCtx] = await Promise.all([buildMacroContext(), buildIndexContext()]);
      if (macroCtx) marketContext += '\n\n' + macroCtx;
      if (indexCtx) marketContext += '\n\n' + indexCtx;
    }
    const [narrativeContext, bookContext] = await Promise.all([
      buildNarrativeContext(cluster.assetMapping),
      buildBookContext(),
    ]);

    const env = buildAgentEnvFromConfig();
    const threshold = monitor.confidence_threshold;
    let agentScore: AgentScore;
    try {
      agentScore = await scoreAndPersist(
        {
          signal_id: signalId,
          detector_classifications: classifications,
          asset_mapping: cluster.assetMapping,
          evidence_text: cluster.evidenceSummary,
          condition_summary: 'narrative synthesis',
          precedent_count: 0,
          market_context: marketContext,
          narrative_context: narrativeContext || undefined,
          book_context: bookContext || undefined,
        },
        env,
      );
    } catch (err) {
      logger.error({ err, signalId }, 'narrative scan: agent scoring failed — no trade');
      return;
    }

    // Anchor the agent's dispatch on Hedera (best-effort, mirrors loop.ts §5b).
    if (proof.writeHcsMessage) {
      try {
        await proof.writeHcsMessage(
          {
            kind: 'agent_dispatch',
            signalId,
            conviction: agentScore.conviction,
            recommendedAction: agentScore.recommended_action,
            confidenceBand: agentScore.confidence_band,
            rubricVersion: agentScore.rubric_version,
            dispatch: agentScore.hcs_dispatch,
          },
          { memo: `LENITNES narrative dispatch · ${signalId.slice(0, 8)}` },
        );
      } catch (err) {
        logger.warn({ err, signalId }, 'narrative scan: HCS dispatch anchor failed (non-blocking)');
      }
    }

    if (agentScore.conviction < threshold) {
      // Archived in agent_scores; not broadcast (channel carries
      // only above-threshold calls).
      logger.info(
        { signalId, conviction: agentScore.conviction, threshold },
        'narrative scan: below threshold — no trade, archived to reasoning archive',
      );
      return;
    }

    // Above threshold — trade + broadcast (reuses the DRY treasury + notify paths).
    const { tradeReceipt, orderId } = await executeAgentTrade(
      signalId,
      agentScore,
      cluster.assetMapping,
    );
    logger.info(
      { signalId, conviction: agentScore.conviction, orderId, tradeMode: tradeReceipt?.mode },
      'narrative scan: synthesis signal traded',
    );

    if (tradeReceipt) {
      const { rows: proofRows } = await query<{
        ipfs_cid: string | null;
        hedera_hcs_message_id: string | null;
        arb_tx_hash: string | null;
      }>(`SELECT ipfs_cid, hedera_hcs_message_id, arb_tx_hash FROM signals WHERE id = $1`, [
        signalId,
      ]);
      broadcastSignal({
        signalId,
        summary: cluster.evidenceSummary,
        monitorUrl: NARRATIVE_MONITOR_URL,
        detectedAt: detectedAt,
        agentScore: {
          conviction: agentScore.conviction,
          thesis: agentScore.thesis,
          recommended_action: agentScore.recommended_action,
          confidence_band: agentScore.confidence_band,
          hcs_dispatch: agentScore.hcs_dispatch,
        },
        tradeReceipt: {
          chain: tradeReceipt.chain,
          txHash: tradeReceipt.txHash,
          pair: tradeReceipt.pair,
          mode: tradeReceipt.mode,
        },
        proofs: {
          ipfsCid: proofRows[0]?.ipfs_cid ?? null,
          hederaTxId: proofRows[0]?.hedera_hcs_message_id ?? null,
          arbitrumTxHash: proofRows[0]?.arb_tx_hash ?? null,
        },
        outcomeWindows: buildOutcomeWindows(detectedAt),
      }).catch((err) => logger.error({ err, signalId }, 'narrative scan: broadcast errored'));
    }
  } catch (err) {
    logger.error({ err }, 'narrative scan failed');
  } finally {
    narrativeRunning = false;
  }
}
