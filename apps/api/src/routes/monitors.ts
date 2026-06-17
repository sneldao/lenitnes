import { Router, type Request, type Response } from 'express';
import type { Monitor } from '@lenitnes/types';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { createMonitorSchema, patchMonitorSchema } from '../validation/index.js';
import { validate } from '../middleware/validate.js';
import {
  createMonitor as createMonitorSvc,
  listMonitors as listMonitorsSvc,
  getMonitorWithSignals as getMonitorWithSignalsSvc,
  updateMonitor as updateMonitorSvc,
  pauseAndReleaseEscrow as pauseAndReleaseEscrowSvc,
} from '../services/domain/monitor.service.js';
import { executeCheck } from '../execution/loop.js';
import { query } from '../db/pool.js';
import { createSignalShareToken } from '../services/share-token.js';
import * as notify from '../services/notify.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const monitorsRouter = Router();

function hasAnyUpdateFields(b: Record<string, unknown>): boolean {
  return Object.values(b).some((v) => v !== undefined);
}

// POST /monitors — create watchlist entry (admin-curated after pivot).
monitorsRouter.post('/', validate(createMonitorSchema), async (req, res) => {
  const b = req.body as {
    url: string;
    conditionText: string;
    frequencySeconds: number;
    costPerCheck?: number;
    screenshotsEnabled: boolean;
    isPublic?: boolean;
    confidenceThreshold?: number;
    assetMapping?: {
      coingeckoId?: string;
      krakenPair?: string;
      tokenizedStock?: string;
      direction?: 'long' | 'short' | 'both';
    };
  };

  const monitor = await createMonitorSvc({
    url: b.url,
    conditionText: b.conditionText,
    frequencySeconds: b.frequencySeconds,
    costPerCheck: b.costPerCheck,
    screenshotsEnabled: b.screenshotsEnabled,
    isPublic: b.isPublic,
    confidenceThreshold: b.confidenceThreshold,
    assetMapping: b.assetMapping,
  });

  // ── Public feed: announce new watchlist entry to Telegram channel ──
  if (monitor.is_public && config.telegram.publicChannelId) {
    const freqMin = Math.round(monitor.frequency_seconds / 60);
    const freqLabel = freqMin < 60 ? `${freqMin}m` : `${Math.round(freqMin / 60)}h`;
    notify
      .sendTelegram(
        config.telegram.publicChannelId,
        `🛡️ <b>New watchlist entry live</b>\n` +
          `<b>${monitor.condition_text.slice(0, 80)}${monitor.condition_text.length > 80 ? '…' : ''}</b>\n\n` +
          `📍 ${monitor.url}\n` +
          `⏱ Every ${freqLabel}\n` +
          `🔗 <a href="${config.webOrigin}/signals?monitorId=${monitor.id}">View signals</a>`,
      )
      .catch((err) =>
        logger.warn({ err, monitorId: monitor.id }, 'failed to post watchlist entry to Telegram'),
      );
  }

  res.status(201).json(monitor);
});

// GET /monitors — list all watchlist entries (public after pivot).
monitorsRouter.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `monitors:all:${limit}:${offset}`;
  const cached = cacheGet<Monitor[]>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }
  const rows = await listMonitorsSvc(limit, offset);
  cacheSet(cacheKey, rows, 30_000); // 30s TTL
  res.setHeader('X-Cache', 'MISS');
  res.json(rows);
});

// GET /monitors/:id — detail with signal history.
monitorsRouter.get('/:id', async (req, res) => {
  const result = await getMonitorWithSignalsSvc(req.params.id ?? '');
  if (!result) return res.status(404).json({ error: 'not found' });
  res.json(result);
});

// PATCH /monitors/:id — update frequency/condition/status.
monitorsRouter.patch('/:id', validate(patchMonitorSchema), async (req, res) => {
  const b = req.body as {
    frequencySeconds?: number;
    conditionText?: string;
    topUpHbar?: number;
    status?: 'active' | 'paused';
  };

  if (!hasAnyUpdateFields(b)) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  const monitor = await updateMonitorSvc(req.params.id ?? '', b);
  if (!monitor) return res.status(404).json({ error: 'not found' });
  res.json(monitor);
});

// DELETE /monitors/:id — pause the watchlist entry.
monitorsRouter.delete('/:id', async (req, res) => {
  const ok = await pauseAndReleaseEscrowSvc(req.params.id ?? '');
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// POST /monitors/:id/first-check — trigger a check (system-facing after pivot).
monitorsRouter.post('/:id/first-check', async (req, res) => {
  const monitorId = req.params.id ?? '';

  const { rows } = await query<Monitor>(`SELECT * FROM monitors WHERE id = $1`, [monitorId]);
  const monitor = rows[0];
  if (!monitor) return res.status(404).json({ error: 'not found' });
  if (monitor.status !== 'active') return res.status(400).json({ error: 'monitor_not_active' });

  // Enforce one-time
  const { rows: countRows } = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM signals WHERE monitor_id = $1`,
    [monitorId],
  );
  if (Number(countRows[0]?.count ?? 0) > 0) {
    return res.status(400).json({
      error: 'first_check_already_used',
      message: 'Subsequent checks run on the autonomous schedule.',
    });
  }

  try {
    const result = await executeCheck(monitor, { skipDebit: true });
    res.json({
      ok: true,
      monitorId,
      ...result,
      publicShareToken: result.signalId ? createSignalShareToken(result.signalId) : null,
    });
  } catch (err) {
    logger.error({ err, monitorId }, 'first check failed');
    res.status(500).json({ error: 'execution_failed', detail: String(err) });
  }
});
