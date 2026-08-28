import type {
  DependencyChange,
  DependencyEvent,
  MappingConfidence,
  OssQualityReport,
  PackageCompanyMapping,
  RepositoryQuality,
} from './types.js';

export interface RawDependencyChange {
  repository: string;
  commitSha: string;
  committedAt: string;
  manifestPath: string;
  ecosystem: DependencyEvent['ecosystem'];
  packageName: string;
  change: DependencyChange;
  versionBefore?: string | null;
  versionAfter?: string | null;
  sourceUrl: string;
}

function mappingFor(
  event: RawDependencyChange,
  mappings: PackageCompanyMapping[],
): PackageCompanyMapping | undefined {
  return mappings.find(
    (m) =>
      m.ecosystem === event.ecosystem &&
      (m.packageName === event.packageName ||
        (m.packageName.endsWith('/*') && event.packageName.startsWith(m.packageName.slice(0, -1)))),
  );
}

export function normalizeDependencyEvents(
  rawEvents: RawDependencyChange[],
  mappings: PackageCompanyMapping[],
): { events: DependencyEvent[]; duplicateEventsRemoved: number } {
  const seen = new Set<string>();
  const events: DependencyEvent[] = [];
  let duplicateEventsRemoved = 0;

  for (const raw of rawEvents) {
    const key = [raw.repository, raw.commitSha, raw.manifestPath, raw.ecosystem, raw.packageName, raw.change].join('|');
    if (seen.has(key)) {
      duplicateEventsRemoved += 1;
      continue;
    }
    seen.add(key);
    const mapping = mappingFor(raw, mappings);
    events.push({
      ...raw,
      versionBefore: raw.versionBefore ?? null,
      versionAfter: raw.versionAfter ?? null,
      companyTicker: mapping?.ticker ?? null,
      mappingRef: mapping?.ref ?? null,
      mappingConfidence: mapping?.mappingConfidence ?? null,
    });
  }
  return { events, duplicateEventsRemoved };
}

export function buildQualityReport(input: {
  corpusVersion: string;
  runStartedAt: string;
  runFinishedAt: string;
  repositories: RepositoryQuality[];
  events: DependencyEvent[];
  duplicateEventsRemoved: number;
  warnings?: string[];
}): OssQualityReport {
  const mappingConfidence: Record<MappingConfidence, number> = { high: 0, medium: 0, low: 0 };
  let mappedEvents = 0;
  for (const event of input.events) {
    if (event.companyTicker) mappedEvents += 1;
    if (event.mappingConfidence) mappingConfidence[event.mappingConfidence] += 1;
  }
  return {
    corpusVersion: input.corpusVersion,
    runStartedAt: input.runStartedAt,
    runFinishedAt: input.runFinishedAt,
    repositoriesRequested: input.repositories.length,
    repositoriesCompleted: input.repositories.filter((r) => r.status === 'completed').length,
    repositoriesFailed: input.repositories.filter((r) => r.status === 'failed').length,
    commitsExamined: input.repositories.reduce((sum, r) => sum + r.commitsExamined, 0),
    eventsExtracted: input.events.length,
    duplicateEventsRemoved: input.duplicateEventsRemoved,
    mappedEvents,
    unmappedEvents: input.events.length - mappedEvents,
    mappingConfidence,
    repositories: input.repositories,
    warnings: input.warnings ?? [],
  };
}
