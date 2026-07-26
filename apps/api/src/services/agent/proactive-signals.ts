// ─────────────────────────────────────────────────────────────
// Proactive signals — velocity anomaly + PR activity scanner.
//
// Runs both detectors, and for each hit that clears the threshold,
// creates a signal, scores it via the agent, and trades if above
// the conviction floor. Follows the same pipeline as narrative
// scan and thesis synthesis (signal → score → trade → broadcast).
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { config } from '../../config.js';
import { cacheInvalidate } from '../../middleware/cache.js';
import { marketData } from '../data-providers/registry.js';
import { scoreAndPersist, buildAgentEnvFromConfig, buildBookContext } from '../agent.js';
import { executeAgentTrade } from '../treasury.js';
import { broadcastSignal, buildOutcomeWindows } from '../notify.js';
import { getProofService } from '../proof.js';
import { buildNarrativeContext } from './narrative.js';
import { buildDetectorTrackRecordContext } from './detector-track-record.js';
import { detectVelocityAnomalies } from '../detectors/velocity-anomaly.js';
import { detectHighImpactPRs } from '../detectors/pr-activity.js';
import { detectSecurityAdvisories } from '../detectors/security-advisory.js';
import { detectProtocolReleases } from '../detectors/protocol-release.js';
import { detectFundingOiAnomalies } from '../detectors/funding-oi.js';
import type { SignalClassification, AssetMapping, AgentScore } from '@lenitnes/types';

interface ProactiveHit {
  monitorId: string;
  url: string;
  asset: string | null;
  classification: SignalClassification;
}

const PROACTIVE_MONITOR_URL = 'proactive:signals';
const CONV_FLOOR = 70;

let proactiveRunning = false;

export async function runProactiveScan(): Promise<void> {
  if (proactiveRunning) return;
  proactiveRunning = true;
  try {
    // Run all five proactive detectors in parallel.
    const [velocityHits, prHits, advisoryHits, releaseHits, fundingHits] = await Promise.all([
      detectVelocityAnomalies(),
      detectHighImpactPRs(),
      detectSecurityAdvisories(),
      detectProtocolReleases(),
      detectFundingOiAnomalies(),
    ]);

    const allHits: ProactiveHit[] = [
      ...velocityHits,
      ...prHits,
      ...advisoryHits,
      ...releaseHits,
      ...fundingHits,
    ];
    if (allHits.length === 0) {
      logger.debug('proactive scan: no proactive signals found');
      return;
    }

    logger.info(
      {
        velocity: velocityHits.length,
        prs: prHits.length,
        advisories: advisoryHits.length,
        releases: releaseHits.length,
        fundingOi: fundingHits.length,
      },
      'proactive scan: hits found, scoring',
    );

    // Ensure the synthetic monitor row exists.
    let monitorId: string;
    let threshold: number;
    const { rows: monitorRows } = await query<{ id: string; confidence_threshold: number }>(
      `SELECT id, confidence_threshold FROM monitors WHERE url = $1`,
      [PROACTIVE_MONITOR_URL],
    );
    if (monitorRows.length > 0) {
      monitorId = monitorRows[0].id;
      threshold = monitorRows[0].confidence_threshold;
    } else {
      const { rows: inserted } = await query<{ id: string; confidence_threshold: number }>(
        `INSERT INTO monitors (url, condition_text, frequency_seconds, status, confidence_threshold, is_public)
         VALUES ($1, 'proactive velocity + PR scanner', 7200, 'active', 70, true)
         RETURNING id, confidence_threshold`,
        [PROACTIVE_MONITOR_URL],
      );
      monitorId = inserted[0].id;
      threshold = inserted[0].confidence_threshold;
    }

    const effectiveThreshold = Math.max(threshold, CONV_FLOOR);

    // Process each hit: create signal, score, potentially trade.
    for (const hit of allHits) {
      try {
        await processHit(hit, monitorId, effectiveThreshold);
      } catch (err) {
        logger.error({ err, url: hit.url }, 'proactive scan: hit processing failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'proactive scan failed');
  } finally {
    proactiveRunning = false;
  }
}

async function processHit(hit: ProactiveHit, monitorId: string, threshold: number): Promise<void> {
  // Funding/OI is directional: the contrarian read of the funding
  // sign sets the asset mapping direction so the agent gets the
  // prior. All other proactive detectors stay direction-agnostic.
  const suggested =
    hit.classification.type === 'funding_oi_anomaly'
      ? (hit.classification.metadata.suggestedDirection as 'long' | 'short' | undefined)
      : undefined;

  const assetMapping: AssetMapping = {
    coingeckoId: hit.asset ?? undefined,
    direction: suggested ?? 'both',
  };

  const evidence = buildEvidence(hit);
  const detectedAt = new Date().toISOString();

  // Create signal row.
  const { rows: sigRows } = await query<{ id: string }>(
    `INSERT INTO signals (monitor_id, detected_at, evidence_text, condition_summary, is_heartbeat, asset)
     VALUES ($1, $2, $3, $4, false, $5) RETURNING id`,
    [monitorId, detectedAt, evidence, hit.classification.label, hit.asset],
  );
  const signalId = sigRows[0].id;
  cacheInvalidate('scorecard:');

  // Persist classification.
  await query(
    `INSERT INTO signal_classifications
       (signal_id, detector_type, score, confidence, label, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      signalId,
      hit.classification.type,
      hit.classification.score,
      hit.classification.confidence,
      hit.classification.label,
      JSON.stringify(hit.classification.metadata),
    ],
  );

  // HCS anchor (best-effort).
  const proof = getProofService();
  if (proof.writeHcsMessage) {
    try {
      const hcs = await proof.writeHcsMessage({
        kind: 'signal',
        signalId,
        monitorId,
        ts: detectedAt,
        evidence: evidence.slice(0, 500),
        summary: `proactive: ${hit.classification.type}`,
      });
      await query(
        `UPDATE signals SET hedera_hcs_message_id = COALESCE($1, hedera_hcs_message_id) WHERE id = $2`,
        [hcs.hederaTxId, signalId],
      );
    } catch (err) {
      logger.warn({ err, signalId }, 'proactive scan: HCS anchor failed (non-blocking)');
    }
  }

  // Build context and score.
  const coingeckoId = hit.asset;
  const [metrics, quotes] = await Promise.all([
    marketData.getGlobalMetrics(),
    coingeckoId ? marketData.getQuotes([coingeckoId]) : Promise.resolve([]),
  ]);
  let marketContext = marketData.formatMarketContext(metrics, quotes);
  try {
    const { buildMacroContext, buildIndexContext } =
      await import('../data-providers/sosovalue/index.js');
    const [macroCtx, indexCtx] = await Promise.all([buildMacroContext(), buildIndexContext()]);
    if (macroCtx) marketContext += '\n\n' + macroCtx;
    if (indexCtx) marketContext += '\n\n' + indexCtx;
  } catch {
    // SoSoValue not available.
  }

  const [narrativeContext, bookContext, trackRecordContext] = await Promise.all([
    buildNarrativeContext(assetMapping),
    buildBookContext(),
    buildDetectorTrackRecordContext([hit.classification.type]),
  ]);

  const env = buildAgentEnvFromConfig();
  let agentScore: AgentScore;
  try {
    agentScore = await scoreAndPersist(
      {
        signal_id: signalId,
        detector_classifications: [
          {
            detector_type: hit.classification.type,
            score: hit.classification.score,
            confidence: hit.classification.confidence,
            label: hit.classification.label,
            metadata: hit.classification.metadata,
          },
        ],
        asset_mapping: assetMapping,
        evidence_text: evidence,
        condition_summary: `Proactive ${hit.classification.type} scan: ${hit.classification.label}`,
        precedent_count: 0,
        market_context: marketContext,
        narrative_context: narrativeContext || undefined,
        book_context: bookContext || undefined,
        detector_track_record: trackRecordContext || undefined,
      },
      env,
    );
  } catch (err) {
    logger.error({ err, signalId }, 'proactive scan: agent scoring failed');
    return;
  }

  logger.info(
    {
      signalId,
      type: hit.classification.type,
      conviction: agentScore.conviction,
      action: agentScore.recommended_action,
    },
    'proactive scan: scored',
  );

  // HCS dispatch anchor.
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
        { memo: `LENITNES proactive dispatch · ${signalId.slice(0, 8)}` },
      );
    } catch (err) {
      logger.warn({ err, signalId }, 'proactive scan: HCS dispatch failed (non-blocking)');
    }
  }

  if (agentScore.conviction < threshold) {
    logger.info(
      { signalId, conviction: agentScore.conviction, threshold },
      'proactive scan: below threshold — archived, no trade',
    );
    return;
  }

  // Trade + broadcast.
  const { tradeReceipt, orderId } = await executeAgentTrade(signalId, agentScore, assetMapping);
  logger.info(
    { signalId, conviction: agentScore.conviction, orderId, tradeMode: tradeReceipt?.mode },
    'proactive scan: signal traded',
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
      summary: evidence,
      monitorUrl: PROACTIVE_MONITOR_URL,
      detectedAt,
      agentScore: {
        conviction: agentScore.conviction,
        thesis: agentScore.thesis,
        recommended_action: agentScore.recommended_action,
        confidence_band: agentScore.confidence_band,
        hcs_dispatch: agentScore.hcs_dispatch,
      },
      detectorTypes: [hit.classification.type],
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
    }).catch((err) => logger.error({ err, signalId }, 'proactive scan: broadcast errored'));
  }
}

function buildEvidence(hit: ProactiveHit): string {
  const lines: string[] = [];
  const meta = hit.classification.metadata;

  if (hit.classification.type === 'velocity_anomaly') {
    lines.push(`Velocity anomaly detected for ${hit.url}`);
    lines.push(`Direction: ${meta.direction}`);
    lines.push(`Deviation: ${meta.deviation}σ from baseline`);
    lines.push(`Current 7d commits: ${meta.current7d}`);
    lines.push(`Baseline weekly: ${meta.baselineWeekly}`);
  } else if (hit.classification.type === 'pr_activity') {
    lines.push(`High-impact PR: ${hit.classification.label}`);
    lines.push(`PR #${meta.prNumber}: ${meta.prUrl}`);
    lines.push(`Author: ${meta.author}`);
    lines.push(`Changes: +${meta.additions}/-${meta.deletions} across ${meta.changedFiles} files`);
    lines.push(`Discussion: ${meta.comments} comments, ${meta.reviewComments} review comments`);
    if (meta.labels && (meta.labels as string[]).length > 0) {
      lines.push(`Labels: ${(meta.labels as string[]).join(', ')}`);
    }
    if (meta.reasons && (meta.reasons as string[]).length > 0) {
      lines.push(`Impact factors: ${(meta.reasons as string[]).join('; ')}`);
    }
  } else if (hit.classification.type === 'security_advisory') {
    lines.push(`Security advisory published: ${hit.classification.label}`);
    lines.push(`GHSA: ${meta.ghsaId}${meta.cveId ? ` · CVE ${meta.cveId}` : ''}`);
    lines.push(
      `Severity: ${meta.severity}${meta.cvssScore != null ? ` (CVSS ${meta.cvssScore})` : ''}`,
    );
    lines.push(`Published: ${meta.publishedAt}`);
    if (meta.summary) lines.push(`Summary: ${meta.summary}`);
    if (meta.reasons && (meta.reasons as string[]).length > 0) {
      lines.push(`Why it scored: ${(meta.reasons as string[]).join('; ')}`);
    }
  } else if (hit.classification.type === 'protocol_release') {
    lines.push(`Protocol release published: ${hit.classification.label}`);
    lines.push(
      `Tag: ${meta.tagName}${meta.prerelease ? ' (pre-release)' : ''} · by ${meta.author}`,
    );
    lines.push(`Published: ${meta.publishedAt}`);
    lines.push(`Release: ${meta.releaseUrl}`);
    if (meta.reasons && (meta.reasons as string[]).length > 0) {
      lines.push(`Why it scored: ${(meta.reasons as string[]).join('; ')}`);
    }
  } else if (hit.classification.type === 'funding_oi_anomaly') {
    lines.push(`Perp funding/OI anomaly: ${hit.classification.label}`);
    lines.push(`Suggested direction: ${meta.suggestedDirection} (contrarian read of funding)`);
    lines.push(
      `Funding: ${((meta.fundingRateHourly as number) * 100).toFixed(4)}%/hr (${(meta.fundingAnnualizedPct as number).toFixed(0)}%/yr)`,
    );
    lines.push(
      `Open interest: $${((meta.openInterestUsd as number) / 1_000_000).toFixed(1)}M · 24h vol: $${((meta.volume24hUsd as number) / 1_000_000).toFixed(1)}M`,
    );
    if (meta.reasons && (meta.reasons as string[]).length > 0) {
      lines.push(`Why it scored: ${(meta.reasons as string[]).join('; ')}`);
    }
  }

  return lines.join('\n');
}
