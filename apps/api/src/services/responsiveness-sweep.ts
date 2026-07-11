import { cacheGet, cacheSet } from '../middleware/cache.js';
import { createRedisClient } from '../queue/connection.js';
import { logger } from '../logger.js';
import { describeReplay, replayWatchlistResponsiveness } from './replay.js';
import { tierProfiles, type TieredProfile } from './domain/repo-tiers.js';
import { invalidateRepoTierCache } from './domain/repo-tier-policy.js';
import { config } from '../config.js';
import { sendTelegram } from './notify.js';
import type { ReplayResponsiveness } from './replay.js';

export type SweepMode = 'mock' | 'live';

export interface ResponsivenessPayload {
  from: string;
  to: string;
  mode: SweepMode;
  profiles: TieredProfile[];
  completedAt: string;
}

export type SweepStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface SweepState {
  status: SweepStatus;
  mode: SweepMode;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  payload?: ResponsivenessPayload;
}

const SWEEP_TTL_MS = 30 * 60 * 1000;
const REDIS_TTL_SEC = 31 * 60;

const inFlight = new Map<SweepMode, Promise<void>>();

function memoryKey(mode: SweepMode, from?: string, to?: string): string {
  return `responsiveness:${from ?? ''}:${to ?? ''}:${mode}`;
}

function redisKey(mode: SweepMode): string {
  return `responsiveness:sweep:${mode}`;
}

async function readRedisState(mode: SweepMode): Promise<SweepState | null> {
  try {
    const client = await createRedisClient({ socket: { reconnectStrategy: false } });
    client.on('error', () => {});
    await client.connect();
    const raw = await client.get(redisKey(mode));
    await client.quit();
    if (!raw) return null;
    return JSON.parse(raw) as SweepState;
  } catch {
    return null;
  }
}

async function writeRedisState(mode: SweepMode, state: SweepState): Promise<void> {
  try {
    const client = await createRedisClient({ socket: { reconnectStrategy: false } });
    client.on('error', () => {});
    await client.connect();
    await client.setEx(redisKey(mode), REDIS_TTL_SEC, JSON.stringify(state));
    await client.quit();
  } catch (err) {
    logger.debug({ err, mode }, 'responsiveness sweep: redis write failed');
  }
}

export async function getResponsivenessSweepState(
  mode: SweepMode,
  from?: string,
  to?: string,
): Promise<SweepState> {
  const memKey = memoryKey(mode, from, to);
  const memCached = cacheGet<ResponsivenessPayload>(memKey);
  if (memCached) {
    return { status: 'ready', mode, payload: memCached, completedAt: memCached.completedAt };
  }

  const redisState = await readRedisState(mode);
  if (redisState?.status === 'ready' && redisState.payload) {
    cacheSet(memKey, redisState.payload, SWEEP_TTL_MS);
    return redisState;
  }
  if (redisState?.status === 'pending') {
    return redisState;
  }

  return { status: 'idle', mode };
}

async function runSweep(mode: SweepMode, from?: string, to?: string): Promise<void> {
  const startedAt = new Date().toISOString();
  const pending: SweepState = { status: 'pending', mode, startedAt };
  await writeRedisState(mode, pending);

  try {
    const profiles = await replayWatchlistResponsiveness({
      from,
      to,
      mock: mode === 'mock',
    });
    const tiered = tierProfiles(profiles);
    const completedAt = new Date().toISOString();
    const payload: ResponsivenessPayload = {
      from: from ?? describeReplay({ repo: 'zcash/halo2' }).from,
      to: to ?? describeReplay({ repo: 'zcash/halo2' }).to,
      mode,
      profiles: tiered,
      completedAt,
    };

    const memKey = memoryKey(mode, from, to);
    cacheSet(memKey, payload, SWEEP_TTL_MS);
    await writeRedisState(mode, { status: 'ready', mode, startedAt, completedAt, payload });
    invalidateRepoTierCache();
    logger.info(
      {
        mode,
        repos: tiered.length,
        aTier: tiered.filter((p) => p.tier === 'A').map((p) => p.repo),
      },
      'responsiveness sweep complete',
    );
  } catch (err) {
    const message = (err as Error).message;
    await writeRedisState(mode, { status: 'error', mode, startedAt, error: message });
    logger.error({ err, mode }, 'responsiveness sweep failed');
    await notifySweepFailure(mode, message);
    throw err;
  }
}

async function notifySweepFailure(mode: SweepMode, message: string): Promise<void> {
  const operatorChatId = config.telegram.operatorChatId;
  if (!operatorChatId || !config.telegram.botToken) return;
  await sendTelegram(
    operatorChatId,
    `⚠️ LENITNES · responsiveness sweep failed (${mode})\n\n${message.slice(0, 400)}`,
  ).catch((err) => logger.error({ err }, 'responsiveness sweep: operator telegram failed'));
}

/** Fire-and-forget unless a sweep for this mode is already running. */
export function scheduleResponsivenessSweep(
  mode: SweepMode = 'mock',
  from?: string,
  to?: string,
): void {
  if (inFlight.has(mode)) return;
  const job = runSweep(mode, from, to)
    .catch(() => {
      /* logged in runSweep */
    })
    .finally(() => {
      inFlight.delete(mode);
    });
  inFlight.set(mode, job);
}

export async function ensureResponsivenessSweep(
  mode: SweepMode = 'mock',
  from?: string,
  to?: string,
): Promise<SweepState> {
  const state = await getResponsivenessSweepState(mode, from, to);
  if (state.status === 'ready' && state.payload) return state;
  if (state.status === 'pending') return state;

  scheduleResponsivenessSweep(mode, from, to);
  return { status: 'pending', mode, startedAt: new Date().toISOString() };
}

/** Warm mock sweep on deploy — non-blocking. */
export function warmResponsivenessCacheOnBoot(): void {
  void ensureResponsivenessSweep('mock').catch((err) => {
    logger.warn({ err }, 'responsiveness warm on boot failed');
  });
}

export function profilesFromState(state: SweepState): ReplayResponsiveness[] | null {
  return state.payload?.profiles ?? null;
}

/** Operator alert when sweep is error/stale (scheduler watchdog). */
const lastSweepHealthAlertAt = { error: 0 };
const SWEEP_HEALTH_ALERT_COOLDOWN_MS = 12 * 3_600_000;

export async function checkResponsivenessSweepHealth(): Promise<void> {
  const state = await getResponsivenessSweepState('mock');
  const operatorChatId = config.telegram.operatorChatId;

  if (state.status === 'error') {
    logger.error({ error: state.error }, 'responsiveness sweep in error state');
    const now = Date.now();
    if (
      operatorChatId &&
      config.telegram.botToken &&
      now - lastSweepHealthAlertAt.error > SWEEP_HEALTH_ALERT_COOLDOWN_MS
    ) {
      lastSweepHealthAlertAt.error = now;
      await sendTelegram(
        operatorChatId,
        `⚠️ LENITNES · responsiveness sweep ERROR\n\n${state.error ?? 'unknown'}`,
      ).catch(() => {});
    }
    scheduleResponsivenessSweep('mock');
    return;
  }

  if (state.status === 'ready' && state.completedAt) {
    const ageH = (Date.now() - new Date(state.completedAt).getTime()) / 3_600_000;
    if (ageH > 8) {
      logger.warn({ ageH }, 'responsiveness sweep stale — rescheduling');
      scheduleResponsivenessSweep('mock');
    }
    return;
  }

  if (state.status === 'idle') {
    scheduleResponsivenessSweep('mock');
  }
}
