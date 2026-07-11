import type { RepoTier } from '@lenitnes/types';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { createRedisClient } from '../queue/connection.js';
import { logger } from '../logger.js';
import { describeReplay, replayWatchlistResponsiveness } from './replay.js';
import { tierProfiles, type TieredProfile } from './domain/repo-tiers.js';
import { invalidateRepoTierCache } from './domain/repo-tier-policy.js';
import { reposForTier, watchlistRepos, type WatchlistRepo } from './domain/sweep-repos.js';
import { config } from '../config.js';
import { sendTelegram } from './notify.js';
import type { ReplayResponsiveness } from './replay.js';

export type SweepMode = 'mock' | 'live';
export type SweepTierFilter = RepoTier;

export interface SweepRunOptions {
  from?: string;
  to?: string;
  tier?: SweepTierFilter;
  repos?: WatchlistRepo[];
}

export interface ResponsivenessPayload {
  from: string;
  to: string;
  mode: SweepMode;
  tierFilter?: SweepTierFilter;
  profiles: TieredProfile[];
  completedAt: string;
}

export type SweepStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface SweepState {
  status: SweepStatus;
  mode: SweepMode;
  tierFilter?: SweepTierFilter;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  payload?: ResponsivenessPayload;
}

export interface SweepQueueJob {
  mode: SweepMode;
  from?: string;
  to?: string;
  tier?: SweepTierFilter;
  enqueuedAt: string;
}

const SWEEP_TTL_MS = 30 * 60 * 1000;
const REDIS_TTL_SEC = 31 * 60;
const SWEEP_QUEUE_KEY = 'responsiveness:queue';
const PENDING_STALE_MS = 20 * 60 * 1000;

/** Worker container runs sweeps; API enqueues only (avoids OOM on replay+LLM). */
export function isResponsivenessSweepWorker(): boolean {
  return process.env.RUN_RESPONSIVENESS_SWEEPS === '1';
}

const inFlight = new Map<string, Promise<void>>();
let drainingQueue = false;

function inFlightKey(mode: SweepMode, tier?: SweepTierFilter): string {
  return tier ? `${mode}:tier:${tier}` : mode;
}

function memoryKey(mode: SweepMode, from?: string, to?: string, tier?: SweepTierFilter): string {
  return `responsiveness:${from ?? ''}:${to ?? ''}:${mode}:${tier ?? ''}`;
}

function redisKey(mode: SweepMode, tier?: SweepTierFilter): string {
  return tier ? `responsiveness:sweep:${mode}:tier:${tier}` : `responsiveness:sweep:${mode}`;
}

async function withRedis<T>(
  fn: (client: Awaited<ReturnType<typeof createRedisClient>>) => Promise<T>,
): Promise<T | null> {
  try {
    const client = await createRedisClient({ socket: { reconnectStrategy: false } });
    client.on('error', () => {});
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.quit();
    }
  } catch {
    return null;
  }
}

async function readRedisState(mode: SweepMode, tier?: SweepTierFilter): Promise<SweepState | null> {
  return (
    (await withRedis(async (client) => {
      const raw = await client.get(redisKey(mode, tier));
      if (!raw) return null;
      return JSON.parse(raw) as SweepState;
    })) ?? null
  );
}

async function writeRedisState(
  mode: SweepMode,
  state: SweepState,
  tier?: SweepTierFilter,
): Promise<void> {
  await withRedis(async (client) => {
    await client.setEx(redisKey(mode, tier), REDIS_TTL_SEC, JSON.stringify(state));
  });
}

async function enqueueSweepJob(job: SweepQueueJob): Promise<void> {
  await withRedis(async (client) => {
    await client.rPush(SWEEP_QUEUE_KEY, JSON.stringify(job));
  });
}

export async function resolveSweepRepos(
  options?: Pick<SweepRunOptions, 'tier' | 'repos'>,
): Promise<{ repos: WatchlistRepo[]; tier?: SweepTierFilter }> {
  if (options?.repos?.length) {
    return { repos: options.repos, tier: options.tier };
  }
  if (options?.tier) {
    const mockState = await getResponsivenessSweepState('mock');
    const profiles = mockState.payload?.profiles ?? [];
    if (profiles.length === 0) {
      throw new Error('No mock sweep cached — run mock sweep before tier-filtered live sweep');
    }
    const repos = reposForTier(options.tier, profiles);
    if (repos.length === 0) {
      throw new Error(`No repos in tier ${options.tier} from latest mock sweep`);
    }
    return { repos, tier: options.tier };
  }
  return { repos: watchlistRepos() };
}

export async function getResponsivenessSweepState(
  mode: SweepMode,
  from?: string,
  to?: string,
  tier?: SweepTierFilter,
): Promise<SweepState> {
  const memKey = memoryKey(mode, from, to, tier);
  const memCached = cacheGet<ResponsivenessPayload>(memKey);
  if (memCached) {
    return {
      status: 'ready',
      mode,
      tierFilter: tier,
      payload: memCached,
      completedAt: memCached.completedAt,
    };
  }

  const redisState = await readRedisState(mode, tier);
  if (redisState?.status === 'ready' && redisState.payload) {
    cacheSet(memKey, redisState.payload, SWEEP_TTL_MS);
    return redisState;
  }
  if (redisState?.status === 'pending' || redisState?.status === 'error') {
    return redisState;
  }

  return { status: 'idle', mode, tierFilter: tier };
}

async function runSweep(mode: SweepMode, options: SweepRunOptions = {}): Promise<void> {
  const { from, to } = options;
  const { repos, tier } = await resolveSweepRepos(options);
  const startedAt = new Date().toISOString();
  const pending: SweepState = { status: 'pending', mode, tierFilter: tier, startedAt };
  await writeRedisState(mode, pending, tier);

  try {
    const profiles = await replayWatchlistResponsiveness({
      from,
      to,
      mock: mode === 'mock',
      repos,
    });
    const tiered = tierProfiles(profiles);
    const completedAt = new Date().toISOString();
    const payload: ResponsivenessPayload = {
      from: from ?? describeReplay({ repo: 'zcash/halo2' }).from,
      to: to ?? describeReplay({ repo: 'zcash/halo2' }).to,
      mode,
      tierFilter: tier,
      profiles: tiered,
      completedAt,
    };

    const memKey = memoryKey(mode, from, to, tier);
    cacheSet(memKey, payload, SWEEP_TTL_MS);
    await writeRedisState(
      mode,
      { status: 'ready', mode, tierFilter: tier, startedAt, completedAt, payload },
      tier,
    );
    invalidateRepoTierCache();
    logger.info(
      {
        mode,
        tierFilter: tier ?? 'all',
        repos: tiered.map((p) => p.repo),
        aTier: tiered.filter((p) => p.tier === 'A').map((p) => p.repo),
      },
      'responsiveness sweep complete',
    );
  } catch (err) {
    const message = (err as Error).message;
    await writeRedisState(
      mode,
      { status: 'error', mode, tierFilter: tier, startedAt, error: message },
      tier,
    );
    logger.error({ err, mode, tier }, 'responsiveness sweep failed');
    await notifySweepFailure(mode, message, tier);
    throw err;
  }
}

async function notifySweepFailure(
  mode: SweepMode,
  message: string,
  tier?: SweepTierFilter,
): Promise<void> {
  const operatorChatId = config.telegram.operatorChatId;
  if (!operatorChatId || !config.telegram.botToken) return;
  const scope = tier ? `${mode}, tier ${tier}` : mode;
  await sendTelegram(
    operatorChatId,
    `⚠️ LENITNES · responsiveness sweep failed (${scope})\n\n${message.slice(0, 400)}`,
  ).catch((err) => logger.error({ err }, 'responsiveness sweep: operator telegram failed'));
}

function runSweepTracked(mode: SweepMode, options: SweepRunOptions): Promise<void> {
  const key = inFlightKey(mode, options.tier);
  if (inFlight.has(key)) return inFlight.get(key)!;
  const job = runSweep(mode, options)
    .catch(() => {})
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, job);
  return job;
}

/** Enqueue sweep for worker execution (API path). */
async function enqueueResponsivenessSweep(
  mode: SweepMode = 'mock',
  options: SweepRunOptions = {},
): Promise<void> {
  const { from, to, tier } = options;
  const state = await getResponsivenessSweepState(mode, from, to, tier);
  if (state.status === 'ready' || state.status === 'pending') return;

  const startedAt = new Date().toISOString();
  await writeRedisState(mode, { status: 'pending', mode, tierFilter: tier, startedAt }, tier);
  await enqueueSweepJob({ mode, from, to, tier, enqueuedAt: startedAt });
  logger.info({ mode, tier: tier ?? 'all' }, 'responsiveness sweep enqueued for worker');
}

/** Worker drains one queued sweep at a time. */
export async function drainResponsivenessQueue(): Promise<void> {
  if (!isResponsivenessSweepWorker() || drainingQueue) return;
  drainingQueue = true;
  try {
    const raw = await withRedis(async (client) => client.lPop(SWEEP_QUEUE_KEY));
    if (!raw) return;
    const job = JSON.parse(raw) as SweepQueueJob;
    logger.info({ mode: job.mode, tier: job.tier ?? 'all' }, 'draining responsiveness sweep queue');
    await runSweepTracked(job.mode, { from: job.from, to: job.to, tier: job.tier });
  } finally {
    drainingQueue = false;
  }
}

/** Schedule sweep — worker runs inline; API enqueues to Redis. */
export function scheduleResponsivenessSweep(
  mode: SweepMode = 'mock',
  options: SweepRunOptions = {},
): void {
  if (isResponsivenessSweepWorker()) {
    void runSweepTracked(mode, options);
    return;
  }
  void enqueueResponsivenessSweep(mode, options).catch((err) => {
    logger.error({ err, mode }, 'responsiveness sweep enqueue failed');
  });
}

export async function ensureResponsivenessSweep(
  mode: SweepMode = 'mock',
  options: SweepRunOptions = {},
): Promise<SweepState> {
  const { from, to, tier } = options;
  const state = await getResponsivenessSweepState(mode, from, to, tier);
  if (state.status === 'ready' && state.payload) return state;
  if (state.status === 'pending') return state;

  scheduleResponsivenessSweep(mode, options);
  return { status: 'pending', mode, tierFilter: tier, startedAt: new Date().toISOString() };
}

export function warmResponsivenessCacheOnBoot(): void {
  void ensureResponsivenessSweep('mock').catch((err) => {
    logger.warn({ err }, 'responsiveness warm on boot failed');
  });
}

export function profilesFromState(state: SweepState): ReplayResponsiveness[] | null {
  return state.payload?.profiles ?? null;
}

const SWEEP_SCOPES: Array<{ mode: SweepMode; tier?: SweepTierFilter }> = [
  { mode: 'mock' },
  { mode: 'live' },
  { mode: 'live', tier: 'A' },
  { mode: 'live', tier: 'B' },
  { mode: 'live', tier: 'C' },
];

async function recoverStalePending(mode: SweepMode, tier?: SweepTierFilter): Promise<boolean> {
  const state = await getResponsivenessSweepState(mode, undefined, undefined, tier);
  if (state.status !== 'pending' || !state.startedAt) return false;
  const ageMs = Date.now() - new Date(state.startedAt).getTime();
  if (ageMs < PENDING_STALE_MS) return false;

  logger.warn({ mode, tier, ageMs }, 'responsiveness sweep pending stale — resetting');
  await writeRedisState(
    mode,
    {
      status: 'error',
      mode,
      tierFilter: tier,
      startedAt: state.startedAt,
      error: 'sweep timed out (pending > 20m)',
    },
    tier,
  );
  scheduleResponsivenessSweep(mode, { tier });
  return true;
}

const lastSweepHealthAlertAt = { error: 0, stale: 0 };
const SWEEP_HEALTH_ALERT_COOLDOWN_MS = 12 * 3_600_000;

export async function checkResponsivenessSweepHealth(): Promise<void> {
  const operatorChatId = config.telegram.operatorChatId;

  for (const scope of SWEEP_SCOPES) {
    await recoverStalePending(scope.mode, scope.tier);
  }

  const state = await getResponsivenessSweepState('mock');

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

/** Weekly live A-tier validation sweep (worker cron). */
export function scheduleWeeklyLiveATierSweep(): void {
  scheduleResponsivenessSweep('live', { tier: 'A' });
}
