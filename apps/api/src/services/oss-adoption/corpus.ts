import type { CorpusRepository, PackageCompanyMapping } from './types.js';

/**
 * Starter entries plus consumer expansion (2026-08-29). Exposure repos are a
 * mix of SDK sources (which reveal ecosystem changes) and high-signal
 * consumers (which reveal adoption of the mapped packages). Every consumer
 * repo was verified via GitHub code search (root package.json, `path:/`) and
 * — since pilot-v3 — additionally confirmed to have *in-window churn*: the
 * mapped SDK package actually changed versions in the root manifest within the
 * 12-month observation window (fetched via the commits + contents API). This
 * churn filter is what separates repos that produce adoption signal from
 * static roots (e.g. nocodb kept @azure/identity pinned across the window).
 * See docs/oss-adoption-corpus.md for the selection rules.
 */
export const OSS_CORPUS_VERSION = '2026-08-29-pilot-v4';

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
    inclusionReason:
      'Open-source kanban; consumer of @google-cloud/storage and @aws-sdk/client-s3 (dual exposure).',
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
  // ── Second-wave consumer expansion (pilot-v3): verified root-manifest
  //    presence AND in-window churn (mapped package version actually changed
  //    in the root package.json within the 12-month observation window). ──
  // AMZN consumers (AWS SDK churn verified)
  {
    slug: 'outline/outline',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Team knowledge base; verified in-window churn of @aws-sdk/client-s3, lib-storage, s3-presigned-post, s3-request-presigner.',
    sourceUrl: 'https://github.com/outline/outline',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'koodo-reader/koodo-reader',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Open-source e-book reader; verified in-window churn of @aws-sdk/client-s3.',
    sourceUrl: 'https://github.com/koodo-reader/koodo-reader',
    defaultBranch: 'dev',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'Kilo-Org/kilocode',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'AI code editor; verified in-window churn of @aws-sdk/client-s3.',
    sourceUrl: 'https://github.com/Kilo-Org/kilocode',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'fosrl/pangolin',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Self-hosted secure tunnel gateway; verified in-window churn of @aws-sdk/client-s3.',
    sourceUrl: 'https://github.com/fosrl/pangolin',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'renovatebot/renovate',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Dependency-update bot; verified in-window churn of @aws-sdk/client-{codecommit,ec2,ecr,eks,rds,s3} + credential-providers.',
    sourceUrl: 'https://github.com/renovatebot/renovate',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'compiler-explorer/compiler-explorer',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Interactive compiler explorer; verified in-window churn of @aws-sdk/client-{dynamodb,ec2,s3,sqs,ssm}.',
    sourceUrl: 'https://github.com/compiler-explorer/compiler-explorer',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'miurla/morphic',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'AI-powered answer engine; verified in-window churn of @aws-sdk/client-s3.',
    sourceUrl: 'https://github.com/miurla/morphic',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  {
    slug: 'papermark/papermark',
    companyTargets: ['AMZN'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Open-source document sharing; verified in-window churn of @aws-sdk/client-{lambda,s3} + cloudfront-signer + lib-storage.',
    sourceUrl: 'https://github.com/papermark/papermark',
    defaultBranch: 'main',
    mappingRefs: ['aws-sdk-js-v3'],
  },
  // MSFT consumers (Azure SDK churn verified)
  {
    slug: 'microsoft/azure-devops-mcp',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Microsoft-maintained MCP server; verified in-window churn of @azure/identity + @azure/msal-node.',
    sourceUrl: 'https://github.com/microsoft/azure-devops-mcp',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  {
    slug: 'microsoft/opensource-management-portal',
    companyTargets: ['MSFT'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Microsoft open-source management portal; verified in-window churn of @azure/{identity,cosmos,keyvault-secrets,storage-blob,storage-queue,data-tables}.',
    sourceUrl: 'https://github.com/microsoft/opensource-management-portal',
    defaultBranch: 'main',
    mappingRefs: ['azure-sdk-js'],
  },
  // GOOGL consumers (Google Cloud SDK churn verified)
  {
    slug: 'vercel/nft',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Node file trace bundler; verified in-window churn of @google-cloud/bigquery.',
    sourceUrl: 'https://github.com/vercel/nft',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'ducktors/turborepo-remote-cache',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Remote cache for Turborepo; verified in-window churn of @google-cloud/storage.',
    sourceUrl: 'https://github.com/ducktors/turborepo-remote-cache',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'openwebdocs/mdn-bcd-collector',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'MDN browser-compat-data collector; verified in-window churn of @google-cloud/{storage,logging-winston}.',
    sourceUrl: 'https://github.com/openwebdocs/mdn-bcd-collector',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'firefox-devtools/profiler-server',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason: 'Firefox profiler backend; verified in-window churn of @google-cloud/storage.',
    sourceUrl: 'https://github.com/firefox-devtools/profiler-server',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node'],
  },
  // ── Third-wave consumer expansion (pilot-v4): GOOGL density push. ──
  //   Phase 1 multi-metric scan found GOOGL `changed`-velocity is the only
  //   forward-reading > 0.2 (fwd1 r=+0.21, fwd2 r=+0.24, n=50-51). These 5
  //   repos were churn-verified in-window (root package.json + commits API)
  //   and chosen to densify the sparse GOOGL adoption series.
  {
    slug: 'typeorm/typeorm',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Most-starred TypeScript ORM; verified in-window churn of @google-cloud/spanner (^8.0.0 → ^5.18.0||^6.0.0||^7.0.0).',
    sourceUrl: 'https://github.com/typeorm/typeorm',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'firebase/firebase-tools',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Firebase CLI; verified in-window churn of @google-cloud/pubsub (^5.2.0 → ^4.5.0).',
    sourceUrl: 'https://github.com/firebase/firebase-tools',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'TryGhost/ActivityPub',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Ghost ActivityPub server; verified in-window churn of @google-cloud/{pubsub,storage} (6.0.1/8.0.1 → 5.3.1/7.21.0).',
    sourceUrl: 'https://github.com/TryGhost/ActivityPub',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'observablehq/notebook-kit',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'Observable notebook tooling; verified in-window churn of @google-cloud/bigquery (^8.3.0 → ^8.1.1).',
    sourceUrl: 'https://github.com/observablehq/notebook-kit',
    defaultBranch: 'main',
    mappingRefs: ['google-cloud-node'],
  },
  {
    slug: 'Kesin11/CIAnalyzer',
    companyTargets: ['GOOGL'],
    role: 'exposure',
    expectedManifests: ['package.json'],
    inclusionReason:
      'CI log analyzer; verified in-window churn of @google-cloud/{bigquery,storage} (9.0.2/7.22.0 → 7.9.4/7.19.0).',
    sourceUrl: 'https://github.com/Kesin11/CIAnalyzer',
    defaultBranch: 'master',
    mappingRefs: ['google-cloud-node'],
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
    if (!repo.sourceUrl.startsWith('https://github.com/'))
      errors.push(`non-GitHub source: ${repo.slug}`);
    if (!repo.inclusionReason.trim()) errors.push(`missing inclusion reason: ${repo.slug}`);
  }
  return errors;
}
