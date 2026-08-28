import type { CorpusRepository, PackageCompanyMapping } from './types.js';

/**
 * Starter entries only. Expand to 30–50 repositories after each entry has
 * been manually checked and its provenance recorded in docs/oss-adoption-corpus.md.
 */
export const OSS_CORPUS_VERSION = '2026-08-28-pilot-v1';

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
