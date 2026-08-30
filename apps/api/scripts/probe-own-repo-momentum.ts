#!/usr/bin/env node
/**
 * Own-repo momentum probe — the vendor-literal adoption surface.
 *
 * Sherlock/Paradox/GitDealFlow all measure the TARGET's OWN momentum rather
 * than third-party manifest churn or download counts: star velocity,
 * contributor growth, and commit velocity on the vendor's repositories. This
 * probe collects exactly that for the three core SDK repos, maps them to
 * tickers, and overlays weekly momentum vs tokenized-stock prices using the
 * Phase 0/1 overlay machinery.
 *
 *   aws/aws-sdk-js-v3            → AMZN
 *   Azure/azure-sdk-for-js       → MSFT
 *   googleapis/google-cloud-node → GOOGL
 *
 * Data sources (GitHub REST API, GITHUB_TOKEN from env):
 *   - Star history:  GET /repos/{owner}/{repo}/stargazers?per_page=100
 *                    with Accept: application/vnd.github.v3.star+json
 *                    (paginated; each entry has `starred_at`).
 *   - Commit velocity + active contributors:
 *                    GET /repos/{owner}/{repo}/stats/contributors
 *                    (weekly commit counts per contributor, trailing year).
 *
 * Weekly momentum curves (AdoptionWeek shape, so the existing overlay code
 * applies unchanged):
 *   added / netAdd = stars gained that week   (star velocity)
 *   changed        = commits that week        (commit velocity)
 *   activeRepos    = distinct active contributors that week
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx npx tsx scripts/probe-own-repo-momentum.ts \
 *     --out /tmp/oss-momentum [--since 2025-09-14] [--until 2026-08-30]
 */
import fs from 'node:fs';
import path from 'node:path';
import { weekStartOf, fillWeeklyGaps } from '../src/services/oss-adoption/curves.js';
import type { AdoptionWeek } from '../src/services/oss-adoption/curves.js';
import { scoreCurves } from '../src/services/oss-adoption/scoring.js';
import type { ScoreMetric } from '../src/services/oss-adoption/scoring.js';
import {
  fetchTokenizedStockPrices,
  TOKENIZED_STOCK_IDS,
} from '../src/services/oss-adoption/prices.js';
import {
  buildOverlay,
  overlayToCsv,
  summarizeOverlay,
} from '../src/services/oss-adoption/analysis.js';

const GITHUB_API_BASE = 'https://api.github.com';

/** Core SDK repos → ticker. */
export const MOMENTUM_REPOS: Array<{ repo: string; ticker: string; name: string }> = [
  { repo: 'aws/aws-sdk-js-v3', ticker: 'AMZN', name: 'AWS SDK v3' },
  { repo: 'Azure/azure-sdk-for-js', ticker: 'MSFT', name: 'Azure SDK for JS' },
  { repo: 'googleapis/google-cloud-node', ticker: 'GOOGL', name: 'Google Cloud Node' },
];

const VALID_METRICS: ScoreMetric[] = [
  'added',
  'removed',
  'upgraded',
  'downgraded',
  'changed',
  'netAdd',
  'activeRepos',
];

interface Args {
  out: string;
  since: string;
  until: string;
  metric: ScoreMetric;
  window: number;
}

function parseArgs(argv: string[]): Args {
  let out = 'data/oss-momentum';
  let since = '';
  let until = '';
  let metric: ScoreMetric = 'added';
  let window = 4;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--out' && value) out = value;
    else if (key === '--since' && value) since = value;
    else if (key === '--until' && value) until = value;
    else if (key === '--metric' && value) {
      if (!(VALID_METRICS as readonly string[]).includes(value)) {
        console.error(`Invalid metric "${value}". Valid: ${VALID_METRICS.join(', ')}`);
        process.exit(1);
      }
      metric = value as ScoreMetric;
    } else if (key === '--window' && value) window = Number(value);
    else if (key === '--help') {
      console.log(
        'Usage: GITHUB_TOKEN=... npx tsx scripts/probe-own-repo-momentum.ts [--out DIR] [--since ISO] [--until ISO] [--metric added] [--window 4]',
      );
      process.exit(0);
    }
  }
  if (!until) until = new Date().toISOString().slice(0, 10);
  if (!since) {
    const d = new Date(`${until}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 350);
    since = d.toISOString().slice(0, 10);
  }
  return { out, since, until, metric, window };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** GitHub fetch with token + retry + rate-limit-reset wait (mirrors collector). */
async function ghFetch(
  url: string,
  token: string,
  accept?: string,
  maxRetries = 5,
): Promise<{ res: Response; json: unknown }> {
  let lastError = '';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const headers: Record<string, string> = {
      'User-Agent': 'lenitnes-research/0.1',
      Authorization: `Bearer ${token}`,
    };
    if (accept) headers.Accept = accept;
    const res = await fetch(url, { headers });
    if (res.status === 403 || res.status === 429) {
      // Since July 2026 GitHub restricts the stargazers listing endpoint to
      // repo admins/collaborators; this is a permanent policy block for
      // third-party repos, not a transient error — fail fast instead of
      // grinding retries.
      const body = (await res.clone().text()).toLowerCase();
      if (res.status === 403 && body.includes('resource not accessible')) {
        throw new Error(`${url}: resource not accessible (permanent policy block)`);
      }
      const remaining = res.headers.get('x-ratelimit-remaining') ?? '';
      const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
      if (remaining === '0' && reset > Date.now() && reset - Date.now() < 3600_000) {
        const wait = Math.min(3600_000, reset - Date.now() + 1000);
        console.log(`    rate-limited; waiting ${Math.round(wait / 1000)}s until reset`);
        await sleep(wait);
        continue;
      }
      await sleep(2_000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      lastError = `HTTP ${res.status}`;
      await sleep(1_000 * (attempt + 1));
      continue;
    }
    return { res, json: await res.json() };
  }
  throw new Error(`${url}: ${lastError || 'exhausted retries'}`);
}

/** Parse rel="next" from a Link header. */
function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

/**
 * Fetch full star history (starred_at per stargazer) paginated, earliest
 * first, returning stars with timestamps within [since, until].
 */
async function fetchStarHistory(
  repo: string,
  token: string,
  since: string,
  until: string,
): Promise<Array<{ day: string }>> {
  const stars: Array<{ day: string }> = [];
  let url = `${GITHUB_API_BASE}/repos/${repo}/stargazers?per_page=100&page=1`;
  const sinceMs = Date.parse(`${since}T00:00:00Z`);
  const untilMs = Date.parse(`${until}T00:00:00Z`);
  let page = 0;
  while (url) {
    page++;
    const { res, json } = await ghFetch(url, token, 'application/vnd.github.v3.star+json');
    const rows = (json as Array<{ starred_at?: string | null }>) ?? [];
    for (const r of rows) {
      const ts = r.starred_at ? Date.parse(r.starred_at) : NaN;
      if (Number.isFinite(ts) && ts >= sinceMs && ts <= untilMs) {
        stars.push({ day: r.starred_at!.slice(0, 10) });
      }
    }
    // Stargazers are returned newest-first; stop when we've passed the window.
    const oldestInPage = rows.length ? rows[rows.length - 1]?.starred_at : null;
    if (oldestInPage && Date.parse(oldestInPage) < sinceMs) break;
    url = nextLink(res.headers.get('link')) ?? '';
    if (page % 10 === 0) console.log(`    stars page ${page} (${stars.length} in window)`);
    await sleep(150);
  }
  return stars;
}

/** Fetch weekly per-contributor commit stats (trailing ~1 year). */
async function fetchContributorStats(
  repo: string,
  token: string,
): Promise<{
  weeks: Array<{ week: string; commits: number }>;
  activeByWeek: Map<string, number>;
}> {
  const url = `${GITHUB_API_BASE}/repos/${repo}/stats/contributors`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { json } = await ghFetch(url, token);
    if (Array.isArray(json) && json.length > 0) {
      // Sum commits per ISO week across contributors; count distinct
      // contributors with ≥1 commit in each week (contributor growth).
      const weekly = new Map<string, number>();
      const activeByWeek = new Map<string, Set<string>>();
      for (const c of json as Array<{
        author?: { login?: string | null };
        weeks?: Array<{ w?: number; c?: number }>;
      }>) {
        const login = c.author?.login ?? null;
        for (const w of c.weeks ?? []) {
          if (!w.w || !w.c || w.c <= 0) continue;
          const day = new Date(w.w * 1000).toISOString().slice(0, 10);
          const week = weekStartOf(day);
          weekly.set(week, (weekly.get(week) ?? 0) + w.c);
          if (login) {
            const set = activeByWeek.get(week) ?? new Set<string>();
            set.add(login);
            activeByWeek.set(week, set);
          }
        }
      }
      return {
        weeks: [...weekly.entries()]
          .map(([week, commits]) => ({ week, commits }))
          .sort((a, b) => a.week.localeCompare(b.week)),
        activeByWeek: new Map([...activeByWeek.entries()].map(([week, set]) => [week, set.size])),
      };
    }
    // 202 Accepted = GitHub is still computing; retry with backoff.
    await sleep(3_000 * (attempt + 1));
  }
  throw new Error(`${repo}: contributor stats not ready after retries`);
}

/** Build weekly momentum AdoptionWeek rows per ticker. */
function momentumToWeeks(
  stars: Map<string, Array<{ day: string }>>,
  commits: Map<string, Array<{ week: string; commits: number }>>,
  activeByWeek: Map<string, Map<string, number>>,
  since: string,
  until: string,
): AdoptionWeek[] {
  const weeks: AdoptionWeek[] = [];

  for (const { repo, ticker } of MOMENTUM_REPOS) {
    const starList = stars.get(repo) ?? [];
    const commitList = commits.get(repo) ?? [];
    const active = activeByWeek.get(repo) ?? new Map<string, number>();

    // Bucket stars by ISO week.
    const starWeeks = new Map<string, number>();
    for (const s of starList) {
      const week = weekStartOf(s.day);
      if (!week) continue;
      starWeeks.set(week, (starWeeks.get(week) ?? 0) + 1);
    }
    const commitWeeks = new Map(commitList.map((c) => [c.week, c.commits]));

    const fromWeek = weekStartOf(since) || since;
    const toWeek = weekStartOf(until) || until;
    const cursor = new Date(`${fromWeek}T00:00:00Z`);
    const end = new Date(`${toWeek}T00:00:00Z`);
    while (cursor <= end) {
      const week = cursor.toISOString().slice(0, 10);
      const starCount = starWeeks.get(week) ?? 0;
      const commitCount = commitWeeks.get(week) ?? 0;
      weeks.push({
        weekStart: week,
        companyTicker: ticker,
        added: starCount,
        removed: 0,
        upgraded: 0,
        downgraded: 0,
        changed: commitCount,
        netAdd: starCount,
        activeRepos: active.get(week) ?? 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }
  return weeks.sort(
    (a, b) =>
      a.companyTicker.localeCompare(b.companyTicker) || a.weekStart.localeCompare(b.weekStart),
  );
}

async function main(): Promise<void> {
  const { out, since, until, metric, window } = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? '';
  if (!token) {
    console.error('GITHUB_TOKEN is required (fine-grained PAT with repo read).');
    process.exit(1);
  }
  const runId = `oss-momentum-${Date.now()}`;
  console.log(`Own-repo momentum probe (${runId})`);
  console.log(
    `  window: ${since} → ${until} | repos: ${MOMENTUM_REPOS.length} | metric: ${metric} (window ${window})`,
  );

  // 1) Collect star history + commit stats per repo.
  const stars = new Map<string, Array<{ day: string }>>();
  const commits = new Map<string, Array<{ week: string; commits: number }>>();
  const activeByWeek = new Map<string, Map<string, number>>();
  for (const { repo, name } of MOMENTUM_REPOS) {
    console.log(`\n  ${name} (${repo})`);
    try {
      console.log('    fetching star history...');
      const s = await fetchStarHistory(repo, token, since, until);
      stars.set(repo, s);
      console.log(`    stars in window: ${s.length}`);
    } catch (err) {
      console.log(`    stars FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      console.log('    fetching contributor/commit stats...');
      const c = await fetchContributorStats(repo, token);
      commits.set(repo, c.weeks);
      activeByWeek.set(repo, c.activeByWeek);
      const total = c.weeks.reduce((x, row) => x + row.commits, 0);
      console.log(`    weekly rows: ${c.weeks.length}, total commits: ${total}`);
    } catch (err) {
      console.log(`    commits FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2) Weekly momentum curves.
  const weeks = momentumToWeeks(stars, commits, activeByWeek, since, until);
  const tickers = [...new Set(weeks.map((w) => w.companyTicker))].sort();
  let filled: AdoptionWeek[] = [];
  for (const ticker of tickers) {
    const fromWeek = weekStartOf(since) || since;
    const toWeek = weekStartOf(until) || until;
    filled = filled.concat(
      fillWeeklyGaps(
        weeks.filter((w) => w.companyTicker === ticker),
        ticker,
        fromWeek,
        toWeek,
      ),
    );
  }

  // 3) Score velocity/acceleration.
  console.log('\nscoring curves...');
  const scored = scoreCurves(filled, { metric, window });

  // 4) Prices.
  console.log('fetching tokenized-stock price series (CoinGecko)...');
  const priceByTicker = new Map<
    string,
    Awaited<ReturnType<typeof fetchTokenizedStockPrices>>['points']
  >();
  for (const ticker of tickers) {
    if (!(ticker in TOKENIZED_STOCK_IDS)) continue;
    try {
      const s = await fetchTokenizedStockPrices(
        ticker,
        weekStartOf(since) || since,
        weekStartOf(until) || until,
      );
      priceByTicker.set(ticker, s.points);
      console.log(`  ${ticker.padEnd(5)} ${s.coingeckoId.padEnd(22)} points=${s.points.length}`);
    } catch (err) {
      console.log(
        `  ${ticker}: price fetch failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 5) Overlay + correlations.
  const rows = buildOverlay(scored, priceByTicker);
  const summary = summarizeOverlay(rows);

  fs.mkdirSync(path.resolve(out), { recursive: true });
  const prefix = path.join(path.resolve(out), runId);
  fs.writeFileSync(`${prefix}.csv`, overlayToCsv(rows));
  fs.writeFileSync(
    `${prefix}.summary.json`,
    JSON.stringify(
      {
        runId,
        source: 'github-rest-api',
        repos: MOMENTUM_REPOS.map((r) => ({
          repo: r.repo,
          ticker: r.ticker,
          starsInWindow: (stars.get(r.repo) ?? []).length,
          weeklyCommitRows: (commits.get(r.repo) ?? []).length,
          activeContributorWeeks: (activeByWeek.get(r.repo) ?? new Map()).size,
        })),
        limitations: [
          'Star history (stargazers listing) is BLOCKED for third-party repos since GitHub restricted that endpoint to repo admins/collaborators (July 2026). starsInWindow=0 means the star-velocity metric could not be measured; added/netAdd/velocity are therefore degenerate and should be ignored.',
          'Contributor counts are per-week distinct authors with >=1 commit (from /stats/contributors).',
        ],
        window: { start: since, end: until },
        note: `Own-repo momentum overlay. added/netAdd = stars/week (star velocity); changed = commits/week (commit velocity); velocity = ${window}-window trailing slope of ${metric}; acceleration = slope of velocity. Tests whether the vendor repo's own momentum leads its stock price.`,
        summary,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`\n✓ probe complete → ${prefix}.csv`);
  console.log('\nper-ticker correlations (r):');
  for (const s of summary) {
    const row = (arr: typeof s.correlations.fwd1) =>
      arr.length
        ? arr.map((c) => `  ${c.metric}=${c.r.toFixed(3)}(n=${c.n})`).join('\n')
        : '  (no pairs)';
    console.log(`\n${s.ticker} (${s.activeWeeks}/${s.weeks} active weeks)`);
    console.log(`  same-week return:\n${row(s.correlations.weekReturn)}`);
    console.log(`  next-week return (fwd1):\n${row(s.correlations.fwd1)}`);
    console.log(`  2-week return (fwd2):\n${row(s.correlations.fwd2)}`);
    console.log(`  4-week return (fwd4):\n${row(s.correlations.fwd4)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
