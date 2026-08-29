import type { CorpusRepository, PackageCompanyMapping } from './types.js';

/**
 * Starter entries plus first-wave consumer expansion (2026-08-29).
 * Exposure repos are a mix of SDK sources (which reveal ecosystem changes)
 * and high-signal consumers (which reveal adoption of the mapped packages).
 * The consumer repos were verified via GitHub code search: each has the
 * mapped package in its ROOT package.json (path:/), is public, non-fork,
 * and non-archived. See docs/oss-adoption-corpus.md for the selection rules.
 */
export const OSS_CORPUS_VERSION = '2026-08-29-pilot-v2';

export const OSS_CORPUS: CorpusRepository[] = [
  {
    slug: 'googleapis/google-cloud-node',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Canonical Google Cloud JavaScript client library repository.',
    sourceUrl: 'https://github.com/googleapis/google-cloud-node',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'Azure/azure-sdk-for-js',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Canonical Azure JavaScript SDK monorepo.',
    sourceUrl: 'https://github.com/Azure/azure-sdk-for-js',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'aws/aws-sdk-js-v3',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Canonical AWS SDK for JavaScript repository.',
    sourceUrl: 'https://github.com/aws/aws-sdk-js-v3',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  // ── First-wave consumer expansion (verified @azure/identity in root package.json) ──
  {
    slug: 'nocodb/nocodb',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Self-hosted Airtable alternative; production consumer of @azure/identity.',
    sourceUrl: 'https://github.com/nocodb/nocodb',
    defaultBranch: 'develop',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'promptfoo/promptfoo',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'LLM evaluation tooling; production consumer of @azure/identity.',
    sourceUrl: 'https://github.com/promptfoo/promptfoo',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  // ── GOOGL consumer (verified @google-cloud/storage in root package.json) ──
  {
    slug: 'wekan/wekan',
    companyTargets: ['GOOGL', 'AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Open-source kanban; consumer of @google-cloud/storage and @aws-sdk/client-s3 (dual exposure).',
    sourceUrl: 'https://github.com/wekan/wekan',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node', 'aws-sdk-js-v3'],
  },
  // ── AMZN consumers (verified @aws-sdk/client-s3 in root package.json) ──
  {
    slug: 'cypress-io/cypress',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'E2E testing framework; production consumer of @aws-sdk/client-s3.',
    sourceUrl: 'https://github.com/cypress-io/cypress',
    defaultBranch: 'develop',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'lobehub/lobehub',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'AI agent platform; production consumer of @aws-sdk/client-s3.',
    sourceUrl: 'https://github.com/lobehub/lobehub',
    defaultBranch: 'canary',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'vercel/next.js',
    companyTargets: [],
    role: 'control',
    expectedManifests: ['package.json'],
    inclusionReason: 'Large JavaScript ecosystem control with independent cloud exposure.',
    sourceUrl: 'https://github.com/vercel/next.js',
    defaultBranch: 'canary',
    mappingRefs: [],
  },
  {
    slug: 'pallets/flask',
    companyTargets: [],
    role: 'control',
    expectedManifests: ['pyproject.toml', 'requirements.txt'],
    inclusionReason: 'Mature Python control repository for coverage and false-positive checks.',
    sourceUrl: 'https://github.com/pallets/flask',
    defaultBranch: 'main',
    mappingRefs: [],
  },
];

export const OSS_PACKAGE_MAPPINGS: PackageCompanyMapping[] = [
  {
    ref: 'google-cloud-node',
    ecosystem: 'npm',
    packageName: '@google-cloud/*',
    companyName: 'Alphabet',
    ticker: 'GOOGL',
    mappingConfidence: 'high',
    materiality: 'supporting',
    tradable: true,
    rationale: 'Official Google Cloud npm namespace and SDK repository.',
    sourceUrl: 'https://github.com/googleapis/google-cloud-node',
  },
  {
    ref: 'azure-sdk-js',
    ecosystem: 'npm',
    packageName: '@azure/*',
    companyName: 'Microsoft',
    ticker: 'MSFT',
    mappingConfidence: 'high',
    materiality: 'supporting',
    tradable: true,
    rationale: 'Official Microsoft Azure SDK namespace and repository.',
    sourceUrl: 'https://github.com/Azure/azure-sdk-for-js',
  },
  {
    ref: 'aws-sdk-js-v3',
    ecosystem: 'npm',
    packageName: '@aws-sdk/*',
    companyName: 'Amazon',
    ticker: 'AMZN',
    mappingConfidence: 'high',
    materiality: 'supporting',
    tradable: true,
    rationale: 'Official AWS SDK namespace and repository.',
    sourceUrl: 'https://github.com/aws/aws-sdk-js-v3',
  },
];

export function validateCorpus(corpus: CorpusRepository[] = OSS_CORPUS): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const repo of corpus) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo.slug)) errors.push(`invalid repository slug: ${repo.slug}`);
    if (seen.has(repo.slug)) errors.push(`duplicate repository: ${repo.slug}`);
    seen.add(repo.slug);
    if (!repo.sourceUrl.startsWith('https://github.com/')) errors.push(`non-GitHub source: ${repo.slug}`);
    if (!repo.inclusionReason.trim()) errors.push(`missing inclusion reason: ${repo.slug}`);
  }
  return errors;
}
