#!/usr/bin/env node
/**
 * SDK download-count collector — the "software adoption data" surface.
 *
 * Prior experiments measured adoption via package-manifest churn in public
 * repos (who changed @aws-sdk/* in their package.json). That surface is
 * bot-dominated and sparse (~17 strategic events/year). The alternative-data
 * industry (Sherlock, Paradox) measures adoption via *downloads* — the
 * actual demand signal. This collector pulls daily download counts from the
 * npm registry API for the mapped SDK packages per ticker, over an explicit
 * window, and writes a run JSON.
 *
 * The npm public API:
 *   GET https://api.npmjs.org/downloads/range/{start}:{end}/{pkg1},{pkg2},...
 *   → { start, end, package, downloads: [{ day, downloads }] }  (per package)
 * Bulk (comma-separated) range queries return a map keyed by package name.
 * The bulk POINT endpoint returns totals: { last-week, last-month, ... }.
 *
 * Note: this is an unsupported public API — documented here so a package
 * mirror or paid feed can be swapped in behind the same output shape.
 *
 * Usage:
 *   npx tsx scripts/collect-sdk-downloads.ts --out /tmp/sdk-downloads
 */
import fs from 'node:fs';
import path from 'node:path';

const NPM_DOWNLOADS_BASE = 'https://api.npmjs.org/downloads';

/** Representative mapped packages per ticker (from OSS_PACKAGE_MAPPINGS). */
export const SDK_DOWNLOAD_PACKAGES: Record<string, string[]> = {
  AMZN: [
    '@aws-sdk/client-s3',
    '@aws-sdk/client-ec2',
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-ecr',
    '@aws-sdk/client-eks',
    '@aws-sdk/client-rds',
    '@aws-sdk/client-codecommit',
    '@aws-sdk/credential-providers',
    '@aws-sdk/lib-storage',
    '@aws-sdk/s3-request-presigner',
  ],
  MSFT: [
    '@azure/identity',
    '@azure/storage-blob',
    '@azure/cosmos',
    '@azure/keyvault-secrets',
    '@azure/service-bus',
    '@azure/msal-node',
    '@azure/storage-queue',
    '@azure/data-tables',
    '@azure/playwright',
  ],
  GOOGL: [
    '@google-cloud/storage',
    '@google-cloud/pubsub',
    '@google-cloud/bigquery',
    '@google-cloud/spanner',
    '@google-cloud/aiplatform',
    '@google-cloud/logging-winston',
    '@google-cloud/speech',
  ],
};

export interface DailyDownloads {
  /** YYYY-MM-DD */
  day: string;
  downloads: number;
}

export interface SdkDownloadsRunManifest {
  runId: string;
  source: 'npm-registry-public-api';
  window: { start: string; end: string };
  runStartedAt: string;
  runFinishedAt: string;
  packages: number;
  packagesFailed: string[];
}

export interface SdkDownloadsRunResult {
  runManifest: SdkDownloadsRunManifest;
  /** package → daily download counts (ascending day). */
  daily: Record<string, DailyDownloads[]>;
}

interface Args {
  out: string;
  since: string;
  until: string;
}

function parseArgs(argv: string[]): Args {
  let out = 'data/sdk-downloads';
  let since = '';
  let until = '';
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--out' && value) out = value;
    else if (key === '--since' && value) since = value;
    else if (key === '--until' && value) until = value;
    else if (key === '--help') {
      console.log(
        'Usage: npx tsx scripts/collect-sdk-downloads.ts [--out DIR] [--since ISO] [--until ISO]',
      );
      process.exit(0);
    }
  }
  if (!until) until = new Date().toISOString().slice(0, 10);
  if (!since) {
    // CoinGecko's public tier limits historical queries to the past 365 days
    // and rejects boundary-exact ranges; keep the window comfortably under.
    const d = new Date(`${until}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 350);
    since = d.toISOString().slice(0, 10);
  }
  return { out, since, until };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch daily downloads for a single package over [start, end] via the range
 * endpoint. Scoped packages (@aws-sdk/*, @azure/*, @google-cloud/*) are NOT
 * supported by the bulk (comma-separated) endpoint, so we fetch per package.
 * Returns package → daily counts; a failed package is returned as absent
 * (caller records it).
 */
async function fetchPackageRange(
  start: string,
  end: string,
  pkg: string,
  fetchImpl: typeof fetch,
): Promise<DailyDownloads[]> {
  const url = `${NPM_DOWNLOADS_BASE}/range/${start}:${end}/${encodeURIComponent(pkg)}`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'lenitnes-research/0.1' } });
  if (!res.ok) throw new Error(`npm range ${res.status} for ${pkg}`);
  const json = (await res.json()) as {
    downloads?: Array<{ day: string; downloads: number }>;
  };
  return (json.downloads ?? [])
    .filter((r) => r && r.day && Number.isFinite(r.downloads))
    .map((r) => ({ day: r.day, downloads: r.downloads }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

async function main(): Promise<void> {
  const { out, since, until } = parseArgs(process.argv.slice(2));
  const runId = `sdk-downloads-${Date.now()}`;
  const fetchImpl = globalThis.fetch;

  const allPackages: string[] = [];
  const byTicker: Record<string, string[]> = {};
  for (const ticker of Object.keys(SDK_DOWNLOAD_PACKAGES)) {
    const pkgs = SDK_DOWNLOAD_PACKAGES[ticker];
    byTicker[ticker] = pkgs;
    allPackages.push(...pkgs);
  }

  console.log(`SDK download collection (${runId})`);
  console.log(`  window: ${since} → ${until}`);
  console.log(`  packages: ${allPackages.length} (${Object.keys(byTicker).join(', ')})`);

  const daily: Record<string, DailyDownloads[]> = {};
  const packagesFailed: string[] = [];

  // Fetch per package (scoped packages aren't supported by the bulk endpoint).
  for (const pkg of allPackages) {
    try {
      const rows = await fetchPackageRange(since, until, pkg, fetchImpl);
      if (rows.length > 0) daily[pkg] = rows;
      else packagesFailed.push(pkg);
    } catch (err) {
      console.log(`  ${pkg}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
      packagesFailed.push(pkg);
    }
    await sleep(250); // pace calls
  }
  for (const ticker of Object.keys(byTicker)) {
    const total = byTicker[ticker].reduce(
      (s, p) => s + (daily[p] ? daily[p].reduce((x, d) => x + d.downloads, 0) : 0),
      0,
    );
    console.log(
      `  ${ticker}: ${byTicker[ticker].length} pkgs, total downloads ≈ ${total.toLocaleString()}`,
    );
  }

  const result: SdkDownloadsRunResult = {
    runManifest: {
      runId,
      source: 'npm-registry-public-api',
      window: { start: since, end: until },
      runStartedAt: new Date().toISOString(),
      runFinishedAt: new Date().toISOString(),
      packages: allPackages.length,
      packagesFailed,
    },
    daily,
  };

  fs.mkdirSync(path.resolve(out), { recursive: true });
  const outFile = path.join(path.resolve(out), `${runId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');

  console.log(`\n✓ run complete`);
  console.log(`  file: ${outFile}`);
  console.log(`  packages with data: ${Object.keys(daily).length}/${allPackages.length}`);
  if (packagesFailed.length) console.log(`  failed: ${packagesFailed.join(', ')}`);
}

// Only run when invoked directly (not when imported).
const isMain =
  process.argv[1] &&
  (process.argv[1] === import.meta.filename ||
    process.argv[1].replace(/\.(ts|js)$/, '') === import.meta.filename.replace(/\.(ts|js)$/, ''));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
