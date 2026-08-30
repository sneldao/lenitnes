export type ManifestEcosystem = 'npm' | 'go' | 'python' | 'cargo';
/** `changed` = version changed but not semantically comparable (e.g. experimental hash pins). */
export type DependencyChange = 'added' | 'removed' | 'upgraded' | 'downgraded' | 'changed';
export type CorpusRole = 'exposure' | 'control';
export type MappingConfidence = 'high' | 'medium' | 'low';

export interface CorpusRepository {
  slug: string;
  companyTargets: string[];
  role: CorpusRole;
  expectedManifests: string[];
  inclusionReason: string;
  sourceUrl: string;
  defaultBranch?: string;
  mappingRefs: string[];
}

export interface PackageCompanyMapping {
  ref: string;
  ecosystem: ManifestEcosystem;
  packageName: string;
  companyName: string;
  ticker: string | null;
  mappingConfidence: MappingConfidence;
  materiality: 'core' | 'supporting' | 'unknown';
  tradable: boolean;
  rationale: string;
  sourceUrl: string;
}

export interface DependencyEvent {
  repository: string;
  commitSha: string;
  committedAt: string;
  manifestPath: string;
  ecosystem: ManifestEcosystem;
  packageName: string;
  change: DependencyChange;
  versionBefore: string | null;
  versionAfter: string | null;
  companyTicker: string | null;
  mappingRef: string | null;
  mappingConfidence: MappingConfidence | null;
  sourceUrl: string;
  /** Enriched by enrich-oss-adoption.ts (G2). */
  commitMessage?: string | null;
  commitDate?: string | null;
  commitAuthor?: string | null;
}

export interface RepositoryQuality {
  slug: string;
  status: 'completed' | 'failed';
  defaultBranch: string | null;
  manifestsFound: string[];
  commitsExamined: number;
  /** Number of manifest blobs actually fetched and parsed (≤ commits × manifests). */
  manifestsExamined?: number;
  eventsExtracted: number;
  error: string | null;
}

export interface OssQualityReport {
  corpusVersion: string;
  runStartedAt: string;
  runFinishedAt: string;
  repositoriesRequested: number;
  repositoriesCompleted: number;
  repositoriesFailed: number;
  commitsExamined: number;
  eventsExtracted: number;
  duplicateEventsRemoved: number;
  mappedEvents: number;
  unmappedEvents: number;
  mappingConfidence: Record<MappingConfidence, number>;
  repositories: RepositoryQuality[];
  warnings: string[];
}
