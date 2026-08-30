#!/usr/bin/env node
/**
 * OSS adoption — wide-corpus collection for the `added`-only experiment.
 *
 * The pilot corpus (29 repos) is dominated by routine maintenance: ~90% of
 * mapped events are Renovate/Dependabot bumps. The `added`-only experiment
 * tests whether FIRST-TIME adoption of a vendor SDK (nobody runs
 * `npm install @aws-sdk/client-s3` by accident) carries a cleaner signal.
 *
 * This script collects a WIDE corpus (40+ repos discovered via namespace
 * code search: `@aws-sdk/`, `@azure/`, `@google-cloud/` in root
 * package.json) with a shallow per-manifest page cap, so the run stays
 * cheap while covering enough history to catch `added` events. It reuses
 * the collector's per-repo machinery via a custom corpus array.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx npx tsx scripts/collect-oss-adoption-wide.ts \
 *     --out /tmp/oss-adoption-wide
 */
import fs from 'node:fs';
import path from 'node:path';
import { collectAdoptionHistory } from '../src/services/oss-adoption/collector.js';
import type { CorpusRepository } from '../src/services/oss-adoption/types.js';

/** Wide corpus: repos with a mapped SDK namespace in their root package.json. */
export const WIDE_CORPUS: CorpusRepository[] = [
  // ── AMZN consumers (@aws-sdk/*) ────────────────────────────────────────
  {
    slug: 'supabase/supabase',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/supabase/supabase',
    defaultBranch: 'master',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'remotion-dev/remotion',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/remotion-dev/remotion',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'elastic/kibana',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/elastic/kibana',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'nodemailer/nodemailer',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/nodemailer/nodemailer',
    defaultBranch: 'master',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'botpress/botpress',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/botpress/botpress',
    defaultBranch: 'master',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'highcharts/highcharts',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/highcharts/highcharts',
    defaultBranch: 'master',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'openai/openai-node',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/openai/openai-node',
    defaultBranch: 'master',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'mongodb/node-mongodb-native',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/mongodb/node-mongodb-native',
    defaultBranch: 'master',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'webdriverio/webdriverio',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/webdriverio/webdriverio',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'anomalyco/opencode',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/anomalyco/opencode',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  // ── MSFT consumers (@azure/*) ──────────────────────────────────────────
  {
    slug: 'formbricks/formbricks',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/formbricks/formbricks',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'nitrojs/nitro',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/nitrojs/nitro',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'aquasecurity/cloudsploit',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/aquasecurity/cloudsploit',
    defaultBranch: 'master',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'bytebase/dbhub',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/bytebase/dbhub',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'trycompai/comp',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/trycompai/comp',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'pnp/cli-microsoft365',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/pnp/cli-microsoft365',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'microsoft/vscode-vsce',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/microsoft/vscode-vsce',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'context-labs/uwu',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @azure in root package.json',
    sourceUrl: 'https://github.com/context-labs/uwu',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  // ── GOOGL consumers (@google-cloud/*) ──────────────────────────────────
  {
    slug: 'civitai/civitai',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud in root package.json',
    sourceUrl: 'https://github.com/civitai/civitai',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'cla-assistant/cla-assistant',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud in root package.json',
    sourceUrl: 'https://github.com/cla-assistant/cla-assistant',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'molstar/molstar',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud in root package.json',
    sourceUrl: 'https://github.com/molstar/molstar',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'google/santa-tracker-web',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud in root package.json',
    sourceUrl: 'https://github.com/google/santa-tracker-web',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'bitrise-io/bitrise-workflow-editor',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud in root package.json',
    sourceUrl: 'https://github.com/bitrise-io/bitrise-workflow-editor',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'hotovo/aider-desk',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud in root package.json',
    sourceUrl: 'https://github.com/hotovo/aider-desk',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'mozilla/blurts-server',
    companyTargets: ['GOOGL', 'AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud + @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/mozilla/blurts-server',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node', 'aws-sdk-js-v3'],
  },
  {
    slug: 'julianpoy/RecipeSage',
    companyTargets: ['GOOGL', 'AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud + @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/julianpoy/RecipeSage',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node', 'aws-sdk-js-v3'],
  },
  {
    slug: 'ShieldBattery/ShieldBattery',
    companyTargets: ['GOOGL', 'AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Wide corpus: @google-cloud + @aws-sdk in root package.json',
    sourceUrl: 'https://github.com/ShieldBattery/ShieldBattery',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node', 'aws-sdk-js-v3'],
  },
];

/** Deduplicate (keep first occurrence). */
export function dedupeWideCorpus(): CorpusRepository[] {
  const seen = new Set<string>();
  return WIDE_CORPUS.filter((r) => {
    if (seen.has(r.slug)) return false;
    seen.add(r.slug);
    return true;
  });
}

interface Args {
  out: string;
  maxPages: number;
}

function parseArgs(argv: string[]): Args {
  let out = 'data/oss-adoption-wide';
  let maxPages = 3;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--out' && value) out = value;
    else if (key === '--max-pages' && value) maxPages = Number(value);
    else if (key === '--help') {
      console.log(
        'Usage: npx tsx scripts/collect-oss-adoption-wide.ts [--out DIR] [--max-pages N]',
      );
      process.exit(0);
    }
  }
  return { out, maxPages };
}

function authFetch(token: string): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    headers.set('User-Agent', 'lenitnes/1.0');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  return wrapped;
}

async function main(): Promise<void> {
  const { out, maxPages } = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? '';
  const corpus = dedupeWideCorpus();
  const outDir = path.resolve(out);

  console.log(`OSS adoption wide collection (added-only experiment)`);
  console.log(`  corpus: ${corpus.length} repositories (deduped)`);
  console.log(`  max pages/manifest: ${maxPages}`);

  const result = await collectAdoptionHistory({
    corpus,
    corpusVersion: '2026-08-30-wide-v1',
    sinceIso: undefined,
    untilIso: undefined,
    maxPages,
    fetchImpl: authFetch(token),
    onProgress: (msg) => console.log(`  ${msg}`),
  });
  result.runManifest.githubTokenConfigured = Boolean(token);

  fs.mkdirSync(outDir, { recursive: true });
  const runId = result.runManifest.runId;
  const outFile = path.join(outDir, `${runId}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        runManifest: result.runManifest,
        events: result.events,
        qualityReport: result.qualityReport,
      },
      null,
      2,
    ) + '\n',
  );

  const q = result.qualityReport;
  console.log(`\n✓ run ${runId} complete`);
  console.log(`  file: ${outFile}`);
  console.log(
    `  repositories: ${q.repositoriesCompleted}/${q.repositoriesRequested} completed, ${q.repositoriesFailed} failed`,
  );
  console.log(`  commits examined: ${q.commitsExamined}`);
  console.log(
    `  events: ${q.eventsExtracted} (${q.mappedEvents} mapped, ${q.unmappedEvents} unmapped)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
