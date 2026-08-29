import { describe, expect, it } from 'vitest';
import {
  OSS_CORPUS,
  OSS_CORPUS_VERSION,
  OSS_PACKAGE_MAPPINGS,
  validateCorpus,
} from '../src/services/oss-adoption/corpus.js';
import {
  buildQualityReport,
  normalizeDependencyEvents,
} from '../src/services/oss-adoption/normalize.js';
import {
  diffDependencySnapshots,
  parseDependencyManifest,
} from '../src/services/oss-adoption/manifests.js';

describe('OSS adoption G0 corpus', () => {
  it('has a valid, deduplicated starter corpus', () => {
    expect(OSS_CORPUS_VERSION).toBe('2026-08-29-pilot-v3');
    expect(validateCorpus()).toEqual([]);
    expect(new Set(OSS_CORPUS.map((repo) => repo.slug)).size).toBe(OSS_CORPUS.length);
  });

  it('does not mark mappings without a public ticker as tradable', () => {
    expect(
      OSS_PACKAGE_MAPPINGS.every((mapping) => mapping.tradable === Boolean(mapping.ticker)),
    ).toBe(true);
  });
});

describe('OSS adoption manifest parsing', () => {
  it('parses npm dependency sections and diffs additions/removals', () => {
    const before = parseDependencyManifest(
      'package.json',
      JSON.stringify({ dependencies: { '@azure/core': '1.0.0', lodash: '4.0.0' } }),
    );
    const after = parseDependencyManifest(
      'package.json',
      JSON.stringify({ dependencies: { '@azure/core': '1.1.0', axios: '1.0.0' } }),
    );
    expect(diffDependencySnapshots(before, after)).toEqual([
      expect.objectContaining({ packageName: '@azure/core', change: 'upgraded' }),
      expect.objectContaining({ packageName: 'axios', change: 'added' }),
      expect.objectContaining({ packageName: 'lodash', change: 'removed' }),
    ]);
  });

  it('parses Go modules and ignores comments', () => {
    const dependencies = parseDependencyManifest(
      'go.mod',
      'module example.com/app\n\nrequire (\n  cloud.google.com/go v1.2.3\n  // ignored.example v1.0.0\n)',
    );
    expect(dependencies).toEqual([
      { ecosystem: 'go', packageName: 'cloud.google.com/go', version: 'v1.2.3' },
    ]);
  });
});

describe('OSS adoption event normalization', () => {
  it('maps namespaced packages and removes duplicate events deterministically', () => {
    const raw = [
      {
        repository: 'example/app',
        commitSha: 'abc',
        committedAt: '2026-01-01T00:00:00Z',
        manifestPath: 'package.json',
        ecosystem: 'npm' as const,
        packageName: '@azure/identity',
        change: 'added' as const,
        versionAfter: '4.0.0',
        sourceUrl: 'https://github.com/example/app/commit/abc',
      },
      {
        repository: 'example/app',
        commitSha: 'abc',
        committedAt: '2026-01-01T00:00:00Z',
        manifestPath: 'package.json',
        ecosystem: 'npm' as const,
        packageName: '@azure/identity',
        change: 'added' as const,
        versionAfter: '4.0.0',
        sourceUrl: 'https://github.com/example/app/commit/abc',
      },
    ];
    const result = normalizeDependencyEvents(raw, OSS_PACKAGE_MAPPINGS);
    expect(result.duplicateEventsRemoved).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ companyTicker: 'MSFT', mappingConfidence: 'high' });
  });

  it('keeps unmapped events visible in the quality report', () => {
    const raw = [
      {
        repository: 'example/app',
        commitSha: 'def',
        committedAt: '2026-01-01T00:00:00Z',
        manifestPath: 'go.mod',
        ecosystem: 'go' as const,
        packageName: 'example.com/unknown',
        change: 'added' as const,
        sourceUrl: 'https://github.com/example/app/commit/def',
      },
    ];
    const { events, duplicateEventsRemoved } = normalizeDependencyEvents(raw, OSS_PACKAGE_MAPPINGS);
    const report = buildQualityReport({
      corpusVersion: OSS_CORPUS_VERSION,
      runStartedAt: '2026-08-28T00:00:00Z',
      runFinishedAt: '2026-08-28T00:01:00Z',
      repositories: [
        {
          slug: 'example/app',
          status: 'completed',
          defaultBranch: 'main',
          manifestsFound: ['go.mod'],
          commitsExamined: 1,
          eventsExtracted: events.length,
          error: null,
        },
      ],
      events,
      duplicateEventsRemoved,
    });
    expect(report.mappedEvents).toBe(0);
    expect(report.unmappedEvents).toBe(1);
  });
});
