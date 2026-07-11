import pLimit from 'p-limit';
import { query, withTransaction } from '../db/pool.js';
import { config } from '../config.js';
import type { Monitor, TinyFishResult } from '@lenitnes/types';
import * as tinyfish from '../services/tinyfish.js';
import * as scraper from '../services/scraper.js';
import * as ipfs from '../services/ipfs.js';
import { fetchCommitsSince, formatCommitEvidence } from '../services/github.js';
import { getProofService } from '../services/proof.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../services/circuit.js';
import { incCounter } from '../middleware/metrics.js';
import { logger } from '../logger.js';
import { runDetectors } from '../services/detectors/registry.js';
import { recordSignalOnChain } from '../services/evm/signal-registry.js';
import { FEATURES } from '../features.js';
import { cacheInvalidate } from '../middleware/cache.js';
import {
  buildAgentEnvFromConfig,
  buildBookContext,
  precedentCount,
  fetchOutcomeContext,
  scoreAndPersist,
  bumpAgentConviction,
  annotateTierPolicyOnScore,
} from '../services/agent.js';
import {
  loadTierPolicyForMonitor,
  applyTierToAgentEnv,
} from '../services/domain/repo-tier-policy.js';
import {
  computeChainConvictionBoost,
  applyChainConvictionBoost,
} from '../services/domain/chain-conviction.js';
import { marketData } from '../services/data-providers/registry.js';
import type { AgentScore } from '@lenitnes/types';
import { executeAgentTrade, type TradeReceipt } from '../services/treasury.js';
import {
  buildOutcomeWindows,
  broadcastSignal,
  type BroadcastSignalInput,
} from '../services/notify.js';

// ─────────────────────────────────────────────────────────────
// Monitor execution loop — the heart of LENITNES.
// One pass over every monitor that is due for a check.
// ─────────────────────────────────────────────────────────────

/** Select monitors whose next check is due based on frequency + last_check_at.
 *
 * 'triggered' must be schedulable: it's set when a monitor fires a
 * signal, and the only thing that resets it to 'active' is the next
 * check (executeCheckTransaction). Filtering to 'active' alone
 * stranded every monitor that ever fired — 6 of 12 repo monitors sat
 * in 'triggered' for weeks, which is why the commit pipeline went
 * silent after the first signal burst. */
async function dueMonitors(): Promise<Monitor[]> {
  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors
     WHERE status IN ('active', 'triggered')
       AND (
         last_check_at IS NULL
         OR last_check_at + (frequency_seconds || ' seconds')::interval <= now()
       )`,
  );
  return rows;
}

const CONCURRENCY = 5;
const limit = pLimit(CONCURRENCY);

export async function runDueChecks(): Promise<void> {
  const monitors = await dueMonitors();
  await Promise.all(
    monitors.map((monitor) =>
      limit(() =>
        executeCheck(monitor).catch((err) => {
          logger.error({ err, monitorId: monitor.id }, 'monitor check failed');
        }),
      ),
    ),
  );
}

export interface CheckMetadata {
  checkMethod: 'tinyfish' | 'tinyfish-fetch' | 'scraper-fallback' | 'github-direct';
  circuitOpen: boolean;
  githubCommitsFetched: number;
  confidence: number;
  confidenceThreshold: number;
  thresholdBlocked: boolean;
  classifications?: Array<{
    type: string;
    score: number;
    confidence: number;
    label: string;
  }>;
  // Day 4: agent conviction gating (Gate 2).
  gate2Blocked?: boolean;
  agentConviction?: number;
  agentBand?: 'low' | 'mid' | 'high';
  agentAction?: 'long' | 'short' | 'none';
  agentThesis?: string;
  // Day 5: treasury trade receipt (above-threshold only).
  tradeTxHash?: string;
  tradeChain?: 'hedera' | 'arbitrum' | 'robinhood' | 'bnb' | 'valuechain';
  tradePair?: string;
  tradeMode?: 'paper' | 'live';
  orderId?: string;
}

export async function executeCheck(monitor: Monitor): Promise<{
  signalId: string | null;
  conditionMet: boolean;
  isHeartbeat: boolean;
  summary: string | null;
  metadata: CheckMetadata;
}> {
  const proof = getProofService();
  const circuitOpts = { name: 'tinyfish', threshold: 5, windowMs: 60_000, cooldownMs: 300_000 };

  // ── 2) Three-tier scraping: Fetch (free) → Agent (credits) → scraper ─────
  let result: TinyFishResult;
  const agentCircuitOpen = isCircuitOpen(circuitOpts);
  let checkMethod: 'tinyfish' | 'tinyfish-fetch' | 'scraper-fallback' | 'github-direct' =
    'tinyfish-fetch';

  // Tier 1: Fetch API (free, Chromium-rendered page content)
  try {
    const fetchedPage = await tinyfish.fetchPage(monitor.url);
    result = scraper.analyzeContent(fetchedPage.content, monitor.condition_text, 'tinyfish-fetch');
    recordSuccess(circuitOpts);
    logger.debug({ monitorId: monitor.id, confidence: result.confidence }, 'Fetch API succeeded');
  } catch (err) {
    logger.warn({ err, monitorId: monitor.id }, 'Fetch API failed, trying Agent fallback');

    // Tier 2: Agent API (credits, full NL evaluation)
    if (agentCircuitOpen) {
      logger.warn({ monitorId: monitor.id }, 'Agent circuit open — using scraper fallback');
      result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
      checkMethod = 'scraper-fallback';
      incCounter('tinyfish_errors_total', { fallback: 'scraper' });
    } else {
      try {
        result = await tinyfish.runMonitorCheck({
          url: monitor.url,
          condition: monitor.condition_text,
          lastSeenCommitHash: monitor.last_seen_commit_hash,
          screenshots: monitor.screenshots_enabled,
        });
        checkMethod = 'tinyfish';
        recordSuccess(circuitOpts);
        logger.debug({ monitorId: monitor.id }, 'Agent API succeeded after Fetch failure');
      } catch (agentErr) {
        recordFailure(circuitOpts);
        incCounter('tinyfish_errors_total', { fallback: 'scraper' });
        logger.warn({ err: agentErr, monitorId: monitor.id }, 'Agent failed — scraper fallback');
        result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
        checkMethod = 'scraper-fallback';
      }
    }
  }

  // ── 2b) GitHub-direct enrichment (PRIMARY path for github.com URLs) ──
  // The 3-tier scrape above only does keyword matching against page
  // text — it does not produce structured commit data, so the detector
  // pipeline never fires and the agent never scores anything. For
  // GitHub URLs we go straight to the GitHub API (cheap, fast, ~1 req/s
  // unauthenticated, ~30 req/s with a token) to get the real commit
  // list with hashes, messages, authors, and size stats. The 9 typed
  // detectors are then the signal gate: they decide whether the new
  // commits constitute a signal. (Previously the gate was a keyword
  // match of commit messages against the monitor's condition text —
  // routine commits never matched, which is why the commit pipeline
  // produced zero real signals after the initial backfill burst.)
  let precomputedDetectors: ReturnType<typeof runDetectors> = [];
  if (monitor.url.includes('github.com') && config.github.token) {
    try {
      const allCommits = await fetchCommitsSince(
        monitor.url,
        monitor.last_seen_commit_hash ?? null,
      );
      // Settling delay: drop commits younger than MIN_COMMIT_AGE_MINUTES.
      // Many high-conviction signals fire on commits already priced
      // in within the hour, so the youngest commits are the noisiest.
      // We also leave `latestCommitHash` at the oldest-settled SHA so
      // the unsettled commits get re-evaluated on the next tick when
      // they age past the cutoff.
      const settlingMs = config.agent.minCommitAgeMinutes * 60_000;
      const cutoff = Date.now() - settlingMs;
      const enriched = (allCommits ?? []).filter((c) => {
        const ts = new Date(c.date).getTime();
        // Keep commits with unparseable dates so we don't silently
        // drop them — the agent can still reason about them and the
        // miscalibration is logged below.
        return isNaN(ts) || ts <= cutoff;
      });
      const skipped = (allCommits?.length ?? 0) - enriched.length;
      if (skipped > 0) {
        logger.debug(
          { monitorId: monitor.id, skipped, settlingMs },
          'github-direct: settling delay filtered young commits',
        );
      }
      if (enriched && enriched.length > 0) {
        // latestHash is the SETTLED commit we want to mark as "seen"
        // — younger unsettled ones aren't yet considered processed,
        // so they remain eligible next tick. enriched[0] is the
        // newest settled commit because allCommits is sorted newest-first
        // and we filtered to settled ones.
        const latestHash = enriched[0]?.sha;
        const priorCommits = result.commits ?? [];
        // Merge: GitHub data wins on structured fields; scrape evidence
        // is kept for the LLM. Only override commits when the direct
        // GitHub call produced at least one row, otherwise keep whatever
        // TinyFish returned (it does its own enrichment when working).
        result = {
          ...result,
          commits: enriched,
          latestCommitHash: latestHash ?? result.latestCommitHash,
          githubCommitsFetched: enriched.length,
        };
        // Detector-driven gate: run the typed detectors on the new
        // commits NOW and let them decide signal vs heartbeat. The
        // page-scrape tier's keyword confidence is ignored for GitHub
        // monitors — old page content matching "security" is noise.
        precomputedDetectors = runDetectors({
          result,
          commits: enriched,
          monitorUrl: monitor.url,
          monitorCondition: monitor.condition_text,
        });
        if (precomputedDetectors.length > 0) {
          const topConfidence = precomputedDetectors.reduce(
            (max, d) => (d.confidence > max ? d.confidence : max),
            0,
          );
          result.conditionMet = true;
          result.confidence = Math.max(result.confidence, topConfidence);
          // Evidence the agent can cite: SHA, first line, size stats.
          result.evidence = formatCommitEvidence(enriched);
          result.summary = `github-direct: ${precomputedDetectors.map((d) => d.type).join(', ')} across ${enriched.length} new commit(s)`;
          checkMethod = 'github-direct';
        } else {
          // New commits but no detector fired → heartbeat, regardless
          // of what the page-scrape keyword tier thought.
          result.conditionMet = false;
        }
        logger.info(
          {
            monitorId: monitor.id,
            commits: enriched.length,
            latestHash: (latestHash ?? '').slice(0, 7),
            priorScrapeCommits: priorCommits.length,
            detectorsFired: precomputedDetectors.map((d) => d.type),
          },
          'github-direct enrichment populated commits',
        );
      } else {
        // No new settled commits → nothing to signal on. Suppress the
        // scrape tier's keyword matches for GitHub monitors.
        result.conditionMet = false;
        logger.debug({ monitorId: monitor.id }, 'github-direct: no new commits');
      }
    } catch (err) {
      logger.warn({ err, monitorId: monitor.id }, 'github-direct enrichment failed (non-blocking)');
    }
  }

  // ── 3) DB mutations inside a transaction ──────────────────────────
  let signalId: string | null = null;
  let isHeartbeat: boolean;
  const summary: string | null = result.summary;

  try {
    const txResult = await withTransaction((client) =>
      executeCheckTransaction(client, {
        monitor,
        result,
      }),
    );
    signalId = txResult.signalId;
    isHeartbeat = txResult.isHeartbeat;

    // Day 8: when a new real signal commits, invalidate the
    // scorecard cache so the public surface refreshes before its
    // 60s TTL. Heartbeats (no signal) don't need it.
    if (signalId && !isHeartbeat) {
      cacheInvalidate('scorecard:');
    }
  } catch (err) {
    logger.error({ err, monitorId: monitor.id }, 'monitor check transaction failed');

    return {
      signalId: null,
      conditionMet: false,
      isHeartbeat: false,
      summary: null,
      metadata: {
        checkMethod,
        circuitOpen: agentCircuitOpen,
        githubCommitsFetched: result.githubCommitsFetched ?? 0,
        confidence: result.confidence,
        confidenceThreshold: monitor.confidence_threshold,
        thresholdBlocked: false,
      },
    };
  }

  // ── 4) Post-commit: IPFS + HCS (best-effort, decoupled) ──────────
  if (!isHeartbeat && signalId) {
    // IPFS upload — best-effort. If it fails, we still write HCS.
    let cid: string | null = null;
    try {
      const ipfsResult = await ipfs.uploadProofPackage({
        signalId,
        monitorId: monitor.id,
        detectedAt: new Date().toISOString(),
        url: monitor.url,
        condition: monitor.condition_text,
        tinyfishRunId: result.runId,
        evidence: result.evidence,
        summary: result.summary,
        screenshots: result.screenshots,
      });
      cid = ipfsResult.cid;
    } catch (err) {
      logger.warn({ err, signalId }, 'IPFS upload failed — HCS write proceeds without CID');
    }

    // HCS signal proof — includes evidence/summary so the topic message is
    // independently verifiable even without IPFS. The IPFS CID is appended
    // when available.
    try {
      const hcs = await proof.writeHcsMessage!({
        kind: 'signal',
        signalId,
        monitorId: monitor.id,
        ipfsCid: cid,
        ts: new Date().toISOString(),
        evidence: result.evidence?.slice(0, 500),
        summary: result.summary,
      });

      await query(
        `UPDATE signals SET ipfs_cid = COALESCE($1, ipfs_cid), hedera_hcs_message_id = COALESCE($2, hedera_hcs_message_id) WHERE id = $3`,
        [cid, hcs.hederaTxId, signalId],
      );
    } catch (err) {
      logger.error({ err, monitorId: monitor.id, signalId }, 'HCS signal proof write failed');
    }

    // Also write a heartbeat HCS message for the successful check cycle.
    try {
      await proof.writeHcsMessage!({
        kind: 'heartbeat',
        monitorId: monitor.id,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err, monitorId: monitor.id }, 'failed to write HCS heartbeat (best-effort)');
    }
  }

  // ── 4a) Record signal on Arbitrum (dual-chain proof, best-effort) ────────
  if (!isHeartbeat && signalId && FEATURES.evmProof) {
    recordSignalOnChain('arbitrum', signalId, result.evidence, result.summary)
      .then(({ txHash }) =>
        query(`UPDATE signals SET arb_tx_hash = $1 WHERE id = $2`, [txHash, signalId]),
      )
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ err, signalId }, 'Arbitrum proof recording failed — queued for retry');
        query(
          `INSERT INTO failed_proofs (signal_id, chain, error, next_retry)
           VALUES ($1, 'arbitrum', $2, now() + interval '2 minutes')`,
          [signalId, errMsg],
        ).catch((e) => logger.error({ err: e, signalId }, 'failed to write to failed_proofs'));
      });
  }

  // ── 4b) Run detector pipeline on new signals (best-effort) ─────────
  let classifications: Array<{ type: string; score: number; confidence: number; label: string }> =
    [];
  let detectorResultsFull: Array<{
    type: string;
    score: number;
    confidence: number;
    label: string;
    metadata: Record<string, unknown>;
  }> = [];
  if (!isHeartbeat && signalId && result.commits && result.commits.length > 0) {
    try {
      // Reuse the detector run from the github-direct gate (2b) when
      // present; only the legacy scrape path re-runs detectors here.
      const detectorResults =
        precomputedDetectors.length > 0
          ? precomputedDetectors
          : runDetectors({
              result,
              commits: result.commits,
              monitorUrl: monitor.url,
              monitorCondition: monitor.condition_text,
            });
      if (detectorResults.length > 0) {
        classifications = detectorResults.map((c) => ({
          type: c.type,
          score: c.score,
          confidence: c.confidence,
          label: c.label,
        }));
        detectorResultsFull = detectorResults.map((c) => ({
          type: c.type,
          score: c.score,
          confidence: c.confidence,
          label: c.label,
          metadata: c.metadata,
        }));
        await Promise.all(
          detectorResults.map((c) =>
            query(
              `INSERT INTO signal_classifications
               (signal_id, detector_type, score, confidence, label, metadata)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [signalId, c.type, c.score, c.confidence, c.label, JSON.stringify(c.metadata)],
            ),
          ),
        );
        // Note: backtest outcomes (price_at_signal, pct_change, etc.) are
        // computed by `processSignalOutcomes()` on the 6h cron in scheduler.ts.
        // No need to trigger per-classify — the cron picks up everything that's
        // missing outcomes within minutes anyway.
      }
    } catch (err) {
      logger.warn({ err, signalId }, 'detector pipeline failed (non-blocking)');
    }
  }

  // ── 4c) Search enrichment: find related context (free, best-effort) ───────
  if (!isHeartbeat && signalId && result.summary) {
    tinyfish
      .searchWeb(`${monitor.url} ${result.summary}`)
      .then((results) => {
        if (results.length > 0) {
          return query(`UPDATE signals SET search_results = $1 WHERE id = $2`, [
            JSON.stringify(results),
            signalId,
          ]);
        }
      })
      .catch((err) => {
        logger.warn({ err, signalId }, 'search enrichment failed (non-blocking)');
      });
  }

  // ── 4d) SoSoValue news enrichment: fetch news for monitored ──────
  //      assets and run the news-signal detector. Runs when
  //      SOSO_VALUE_API_KEY is configured, regardless of whether
  //      GitHub commits were found.
  if (!isHeartbeat && signalId && FEATURES.sosovalue) {
    const coingeckoId = monitor.asset_mapping.coingeckoId;
    if (coingeckoId) {
      try {
        const { searchNews } = await import('../services/data-providers/sosovalue/index.js');
        const newsItems = await searchNews(coingeckoId);

        if (newsItems.length > 0) {
          const { newsSignalDetector } = await import('../services/detectors/news-signal.js');
          const detectorInput = {
            result,
            commits: result.commits ?? [],
            monitorUrl: monitor.url,
            monitorCondition: monitor.condition_text,
            news: newsItems.map((n) => ({
              title: n.title,
              content: n.content,
              categories: [n.category],
              currencies:
                n.matched_currencies?.map((c: { name: string }) => ({ name: c.name })) ?? [],
              tags: n.tags ?? [],
            })),
          };
          const newsResult = newsSignalDetector.detect(detectorInput);
          if (newsResult) {
            classifications.push({
              type: newsResult.type,
              score: newsResult.score,
              confidence: newsResult.confidence,
              label: newsResult.label,
            });
            detectorResultsFull.push({
              type: newsResult.type,
              score: newsResult.score,
              confidence: newsResult.confidence,
              label: newsResult.label,
              metadata: newsResult.metadata,
            });
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
      } catch (err) {
        logger.warn({ err, signalId }, 'SoSoValue news enrichment failed (non-blocking)');
      }
    }
  }

  // ── 5) Agent conviction gating (Gate 2) ─────────────────────────
  // If detectors fired, the agent scores the signal against a versioned
  // rubric. Sub-threshold scores are persisted (agent reasoning archive)
  // and the signal is published without a trade. Above-threshold
  // signals continue to the treasury step (Day 5).
  let agentScore: AgentScore | null = null;
  let gate2Blocked = false;
  if (!isHeartbeat && signalId && detectorResultsFull.length > 0) {
    const tierPolicy = await loadTierPolicyForMonitor(monitor.url);
    const env = applyTierToAgentEnv(buildAgentEnvFromConfig(), tierPolicy);
    const threshold = tierPolicy.tradeThreshold;
    try {
      const detectorTypes = detectorResultsFull.map((d) => d.type);
      const [precedent, outcomeContext] = await Promise.all([
        precedentCount(monitor.id, detectorTypes),
        fetchOutcomeContext(monitor.id, detectorTypes),
      ]);
      const coingeckoId = monitor.asset_mapping.coingeckoId;
      const [metrics, quotes] = await Promise.all([
        marketData.getGlobalMetrics(),
        coingeckoId ? marketData.getQuotes([coingeckoId]) : Promise.resolve([]),
      ]);
      let marketContext = marketData.formatMarketContext(metrics, quotes);

      // Enrich agent context with SoSoValue macro events + index data.
      if (FEATURES.sosovalue) {
        const [{ buildMacroContext, buildIndexContext }] = await Promise.all([
          import('../services/data-providers/sosovalue/index.js'),
        ]);
        const [macroCtx, indexCtx] = await Promise.all([buildMacroContext(), buildIndexContext()]);
        if (macroCtx) marketContext += '\n\n' + macroCtx;
        if (indexCtx) marketContext += '\n\n' + indexCtx;
      }

      // Cross-signal narrative context (rubric v3): recent signals
      // across ALL monitors + cross-asset activity + SoSoValue news
      // for this asset. Lets the agent string commits across repos
      // and weigh corroboration instead of scoring in isolation.
      const { buildNarrativeContext } = await import('../services/agent/narrative.js');
      const { buildSequenceContextLive } = await import('../services/domain/sequence-context.js');
      const [narrativeContext, bookContext, sequenceContext] = await Promise.all([
        buildNarrativeContext(monitor.asset_mapping),
        buildBookContext(),
        buildSequenceContextLive(monitor.url, monitor.asset_mapping),
      ]);

      agentScore = await scoreAndPersist(
        {
          signal_id: signalId,
          detector_classifications: detectorResultsFull.map((d) => ({
            detector_type: d.type,
            score: d.score,
            confidence: d.confidence,
            label: d.label,
            metadata: d.metadata,
          })),
          asset_mapping: monitor.asset_mapping,
          evidence_text: result.evidence,
          condition_summary: result.summary,
          precedent_count: precedent,
          past_outcomes: outcomeContext ?? undefined,
          market_context: marketContext,
          narrative_context: narrativeContext || undefined,
          sequence_context: sequenceContext || undefined,
          book_context: bookContext || undefined,
        },
        env,
      );

      await annotateTierPolicyOnScore(signalId, {
        label: tierPolicy.label,
        liveConfirmed: tierPolicy.liveConfirmed,
        mockTier: tierPolicy.mockTier,
        liveTier: tierPolicy.liveTier,
      });

      const chain = await computeChainConvictionBoost(monitor.url);
      if (chain.boost > 0) {
        const boosted = applyChainConvictionBoost(agentScore.conviction, chain.boost);
        if (boosted !== agentScore.conviction) {
          agentScore = await bumpAgentConviction(signalId, agentScore, boosted, chain.reason ?? '');
          logger.info(
            { signalId, boost: chain.boost, conviction: boosted, reason: chain.reason },
            'sector chain conviction boost applied',
          );
        }
      }

      if (agentScore.conviction < threshold) {
        gate2Blocked = true;
        // Sub-threshold scores are archived in agent_scores (public
        // reasoning archive on the web) but NOT broadcast — the
        // Telegram channel carries only above-threshold calls.
        logger.info(
          {
            signalId,
            monitorId: monitor.id,
            conviction: agentScore.conviction,
            threshold,
            tierPolicy: tierPolicy.label,
          },
          'agent below threshold — no trade, archived to reasoning archive',
        );
      } else {
        logger.info(
          { signalId, monitorId: monitor.id, conviction: agentScore.conviction },
          'agent above threshold — proceeding to treasury',
        );
      }
    } catch (err) {
      // Budget exceeded, API error, parse error — treat as blocked.
      // No agent_scores row is written when the call itself fails.
      gate2Blocked = true;
      logger.error(
        { err, signalId, monitorId: monitor.id },
        'agent scoring failed — gate 2 blocked, no trade',
      );
    }
  }

  // ── 5b) Anchor the agent's dispatch on Hedera ──────────────────
  // The agent's hcs_dispatch is its on-chain voice — a 600-char
  // first-person commitment written via hedera-agent-kit's
  // submit_topic_message_tool. The timestamp-only HCS message
  // (step 4 above) anchors WHEN we saw the signal; this dispatch
  // anchors WHAT THE AGENT THOUGHT about it.
  //
  // If the agent's proof_action is 'dedicated_topic' (conviction
  // ≥ 90 + the agent decided it's reference-quality), we ALSO
  // call create_topic_tool to mint a new HCS topic and write the
  // dispatch there. The default topic always gets a copy + a
  // pointer to the dedicated one, so no record is lost.
  if (agentScore && !isHeartbeat && signalId && proof.writeHcsMessage) {
    try {
      let dedicatedTopicId: string | null = null;
      if (agentScore.proof_action === 'dedicated_topic' && proof.createTopic) {
        const topicMemo = `LENITNES dedicated proof · ${monitor.asset_mapping.coingeckoId ?? 'unknown'} · conviction ${agentScore.conviction}`;
        try {
          const { topicId } = await proof.createTopic(topicMemo);
          dedicatedTopicId = topicId;
          // Write the dispatch into the new topic so the dedicated
          // record is independently verifiable. Memo distinguishes
          // it from the default-topic write below.
          await proof.writeHcsMessage(
            {
              kind: 'agent_dispatch',
              signalId,
              conviction: agentScore.conviction,
              recommendedAction: agentScore.recommended_action,
              confidenceBand: agentScore.confidence_band,
              rubricVersion: agentScore.rubric_version,
              dispatch: agentScore.hcs_dispatch,
              dedicatedTopic: true,
            },
            { topicId, memo: `LENITNES dedicated dispatch · ${signalId.slice(0, 8)}` },
          );
          await query(`UPDATE signals SET hedera_dedicated_topic_id = $1 WHERE id = $2`, [
            topicId,
            signalId,
          ]);
          logger.info(
            {
              signalId,
              dedicatedTopicId,
              conviction: agentScore.conviction,
            },
            'hedera: agent requested dedicated topic, created and anchored',
          );
        } catch (err) {
          logger.warn(
            { err, signalId },
            'hedera: dedicated topic creation failed — falling back to standard write',
          );
        }
      }

      // Default-topic dispatch write — happens for every scored
      // signal regardless of proof_action. References the dedicated
      // topic ID if one was created so a single subscriber sees
      // the full picture.
      await proof.writeHcsMessage(
        {
          kind: 'agent_dispatch',
          signalId,
          conviction: agentScore.conviction,
          recommendedAction: agentScore.recommended_action,
          confidenceBand: agentScore.confidence_band,
          rubricVersion: agentScore.rubric_version,
          dispatch: agentScore.hcs_dispatch,
          dedicatedTopicRef: dedicatedTopicId,
        },
        { memo: `LENITNES dispatch · ${signalId.slice(0, 8)}` },
      );
    } catch (err) {
      // Dispatch-anchor failure is non-fatal — the timestamp HCS
      // write from step 4 still gives us a proof anchor. The
      // signal still ships to Telegram.
      logger.error(
        { err, signalId },
        'hedera: agent dispatch HCS write failed (best-effort, signal still public)',
      );
    }
  }

  // ── 6) Treasury trade (above-threshold only) ────────────────────
  // Derives a single trade action from the agent's recommendation +
  // the watchlist entry's asset_mapping. Skipped when:
  //   - the agent said 'none'
  //   - the directions conflict (e.g. agent says short, asset is
  //     only tradeable long)
  //   - the agent call failed (no agentScore)
  //   - the signal is a heartbeat
  let tradeReceipt: TradeReceipt | null = null;
  let orderId: string | null = null;
  if (agentScore && !gate2Blocked && !isHeartbeat && signalId) {
    // Trade execution is encapsulated in treasury.executeAgentTrade
    // (DRY) — the single entry point shared with the narrative-
    // synthesis scan. Resolves the token, applies the risk gate,
    // derives the action, signs, and records the trade.
    const traded = await executeAgentTrade(signalId, agentScore, monitor.asset_mapping);
    tradeReceipt = traded.tradeReceipt;
    orderId = traded.orderId;
  }

  // ── 7) Public broadcast (above-threshold + trade only) ──────────
  // The agent's verdict goes to the public Telegram channel as a
  // best-effort fire-and-forget. Sub-threshold signals are
  // intentionally NOT broadcast — the reasoning archive
  // (agent_scores) is the surface for those, the public channel
  // is reserved for verified trades.
  if (agentScore && !gate2Blocked && !isHeartbeat && signalId && tradeReceipt) {
    // The proof data (ipfs_cid / hedera_tx_id / arb_tx_hash) is
    // written to the signal row by the post-commit step. Pull it
    // back out so the broadcast can include explorer links.
    const { rows: signalRows } = await query<{
      ipfs_cid: string | null;
      hedera_hcs_message_id: string | null;
      arb_tx_hash: string | null;
    }>(`SELECT ipfs_cid, hedera_hcs_message_id, arb_tx_hash FROM signals WHERE id = $1`, [
      signalId,
    ]);
    const signalProofs = signalRows[0];

    const topDetector = [...detectorResultsFull].sort((a, b) => b.score - a.score)[0]?.type;

    const broadcastInput: BroadcastSignalInput = {
      signalId,
      summary: result.summary,
      monitorUrl: monitor.url,
      detectedAt: new Date().toISOString(),
      primaryDetector: topDetector ?? null,
      agentScore: {
        conviction: agentScore.conviction,
        thesis: agentScore.thesis,
        recommended_action: agentScore.recommended_action,
        confidence_band: agentScore.confidence_band,
        hcs_dispatch: agentScore.hcs_dispatch,
        dedicated_topic: agentScore.proof_action === 'dedicated_topic',
      },
      tradeReceipt: {
        chain: tradeReceipt.chain,
        txHash: tradeReceipt.txHash,
        pair: tradeReceipt.pair,
        mode: tradeReceipt.mode,
      },
      proofs: {
        ipfsCid: signalProofs?.ipfs_cid ?? null,
        hederaTxId: signalProofs?.hedera_hcs_message_id ?? null,
        arbitrumTxHash: signalProofs?.arb_tx_hash ?? null,
      },
      outcomeWindows: buildOutcomeWindows(new Date().toISOString()),
    };

    broadcastSignal(broadcastInput).catch((err) => {
      logger.error({ err, signalId }, 'telegram broadcast errored — already logged inside');
    });
  }

  return {
    signalId,
    conditionMet: !isHeartbeat,
    isHeartbeat,
    summary,
    metadata: {
      checkMethod,
      circuitOpen: agentCircuitOpen,
      githubCommitsFetched: result.githubCommitsFetched ?? 0,
      confidence: result.confidence,
      confidenceThreshold: monitor.confidence_threshold ?? 50,
      thresholdBlocked:
        result.conditionMet && result.confidence < (monitor.confidence_threshold ?? 50),
      ...(classifications.length > 0 ? { classifications } : {}),
      gate2Blocked,
      agentConviction: agentScore?.conviction,
      agentBand: agentScore?.confidence_band,
      agentAction: agentScore?.recommended_action,
      agentThesis: agentScore?.thesis,
      tradeTxHash: tradeReceipt?.txHash,
      tradeChain: tradeReceipt?.chain,
      tradePair: tradeReceipt?.pair,
      tradeMode: tradeReceipt?.mode,
      orderId: orderId ?? undefined,
    },
  };
}

// ── Transaction handler ──────────────────────────────────────

interface TxHandlerParams {
  monitor: Monitor;
  result: TinyFishResult;
}

async function executeCheckTransaction(
  client: import('pg').PoolClient,
  params: TxHandlerParams,
): Promise<{ signalId: string | null; isHeartbeat: boolean }> {
  const { monitor, result } = params;

  // Update last_check_at. Always reset status to 'active' so a fired
  // ('triggered') monitor becomes eligible for the next scheduler tick.
  // Without this, after the first signal the monitor's status stays
  // 'triggered' forever and dueMonitors() (which filters status='active')
  // never schedules it again — the worker silently no-ops every job
  // for that monitor and logs nothing because the "skipping — monitor
  // not found" path in queue/worker.ts is at debug level.
  await client.query(`UPDATE monitors SET last_check_at = now(), status = 'active' WHERE id = $1`, [
    monitor.id,
  ]);

  // Track the newest commit hash so we only evaluate new commits next cycle.
  if (result.latestCommitHash) {
    await client.query(`UPDATE monitors SET last_seen_commit_hash = $1 WHERE id = $2`, [
      result.latestCommitHash,
      monitor.id,
    ]);
  }

  // No signal -> store a heartbeat row.
  if (!result.conditionMet) {
    const { rows: heartbeatRows } = await client.query<{ id: string }>(
      `INSERT INTO signals (monitor_id, tinyfish_run_id, is_heartbeat, condition_summary)
       VALUES ($1, $2, true, $3)
       RETURNING id`,
      [monitor.id, result.runId, result.summary],
    );
    return { signalId: heartbeatRows[0]?.id ?? null, isHeartbeat: true };
  }

  // Condition met but confidence below threshold -> treat as heartbeat.
  const threshold = monitor.confidence_threshold ?? 50;
  if (result.confidence < threshold) {
    const { rows: heartbeatRows } = await client.query<{ id: string }>(
      `INSERT INTO signals (monitor_id, tinyfish_run_id, is_heartbeat, condition_summary)
       VALUES ($1, $2, true, $3)
       RETURNING id`,
      [
        monitor.id,
        result.runId,
        `Confidence ${result.confidence} below threshold ${threshold}. ${result.summary}`,
      ],
    );
    return { signalId: heartbeatRows[0]?.id ?? null, isHeartbeat: true };
  }

  // Signal! Insert the signal row. The on-chain timestamp lives in
  // hedera_hcs_message_id (set by the post-commit HCS write), so
  // hedera_tx_id is null at insert time.
  const detectedAt = new Date().toISOString();
  const { rows: sigRows } = await client.query<{ id: string }>(
    `INSERT INTO signals
       (monitor_id, detected_at, tinyfish_run_id, evidence_text,
        screenshot_urls, condition_summary, is_heartbeat)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     RETURNING id`,
    [
      monitor.id,
      detectedAt,
      result.runId,
      result.evidence,
      JSON.stringify(result.screenshots),
      result.summary,
    ],
  );
  const signalId = sigRows[0].id;

  // Mark the monitor as triggered (intermediate state — gets reset to
  // 'active' on the next check tick, see UPDATE in executeCheckTransaction).
  // The 'triggered' value is useful as a one-tick "we just fired" signal
  // for any external observers; it must NOT stick, otherwise the
  // due-monitors query in scheduler.ts (which filters status='active')
  // stops scheduling this monitor after its first signal.
  await client.query(`UPDATE monitors SET status = 'triggered' WHERE id = $1`, [monitor.id]);

  return { signalId, isHeartbeat: false };
}

// ── Rule execution (removed after pivot) ─────────────────────
// The agent is now the only rule. Agent scoring + trade actions live in
// services/agent.ts and services/treasury.ts (Day 3-5). The user-defined
// rules table is dropped in the Day 2 schema migration.
