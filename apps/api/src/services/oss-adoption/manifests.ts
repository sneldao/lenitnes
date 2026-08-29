import type { DependencyChange, ManifestEcosystem } from './types.js';

export interface DependencySnapshot {
  ecosystem: ManifestEcosystem;
  packageName: string;
  version: string | null;
}

export interface ManifestChange {
  ecosystem: ManifestEcosystem;
  packageName: string;
  change: DependencyChange;
  versionBefore: string | null;
  versionAfter: string | null;
}

function cleanVersion(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function npmSnapshot(manifest: Record<string, unknown>): DependencySnapshot[] {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const output: DependencySnapshot[] = [];
  for (const section of sections) {
    const dependencies = manifest[section];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
    for (const [packageName, version] of Object.entries(dependencies as Record<string, unknown>)) {
      output.push({ ecosystem: 'npm', packageName, version: cleanVersion(version) });
    }
  }
  return output;
}

function parseGoModule(text: string): DependencySnapshot[] {
  const output: DependencySnapshot[] = [];
  let inRequire = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('require (')) {
      inRequire = true;
      continue;
    }
    if (inRequire && trimmed === ')') {
      inRequire = false;
      continue;
    }
    if (inRequire || trimmed.startsWith('require ')) {
      const value = trimmed.replace(/^require\s+/, '').split(/\s+/);
      if (value.length >= 2 && !value[0].startsWith('//')) {
        output.push({ ecosystem: 'go', packageName: value[0], version: cleanVersion(value[1]) });
      }
    }
  }
  return output;
}

function parseRequirements(text: string): DependencySnapshot[] {
  const output: DependencySnapshot[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*(==|~=|>=|<=|>|<)?\s*(.*)$/);
    if (match) output.push({ ecosystem: 'python', packageName: match[1], version: cleanVersion(match[3]) });
  }
  return output;
}

function parseCargoToml(text: string): DependencySnapshot[] {
  const output: DependencySnapshot[] = [];
  let inDependencies = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inDependencies = /^\[(dev-)?dependencies\]$/.test(trimmed);
      continue;
    }
    if (!inDependencies || !trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const packageName = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    const quoted = value.match(/^['"]([^'"]+)['"]/);
    const version = quoted?.[1] ?? value.match(/version\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
    output.push({ ecosystem: 'cargo', packageName, version });
  }
  return output;
}

export function parseDependencyManifest(path: string, content: string): DependencySnapshot[] {
  const file = path.toLowerCase().split('/').pop() ?? path.toLowerCase();
  if (file === 'package.json') {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return npmSnapshot(parsed);
    } catch {
      return [];
    }
  }
  if (file === 'go.mod') return parseGoModule(content);
  if (file === 'requirements.txt') return parseRequirements(content);
  if (file === 'cargo.toml') return parseCargoToml(content);
  return [];
}

/**
 * Numeric semver-ish comparison for version strings. Strips common range
 * prefixes (^ ~ >= < =) and leading "v", splits into numeric parts, and
 * compares numerically. Returns 0 when either side is not parseable
 * (e.g. "latest", "*", or next.js experimental hash pins) — the caller
 * treats a non-zero comparison as a version "change" without a direction.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] | null => {
    const cleaned = value.replace(/^[<>=~^ ]+/, '').replace(/^v/i, '');
    const [core, prerelease] = cleaned.split('-', 2);
    const parts = core.split('.').map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) return null;
    while (parts.length < 3) parts.push(0);
    if (prerelease) {
      const pr = Number(prerelease);
      parts.push(Number.isFinite(pr) ? pr : 0);
    }
    return parts;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function diffDependencySnapshots(
  before: DependencySnapshot[],
  after: DependencySnapshot[],
): ManifestChange[] {
  const beforeMap = new Map(before.map((dependency) => [dependency.packageName, dependency]));
  const afterMap = new Map(after.map((dependency) => [dependency.packageName, dependency]));
  const names = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes: ManifestChange[] = [];

  for (const packageName of names) {
    const previous = beforeMap.get(packageName);
    const current = afterMap.get(packageName);
    if (!previous && current) {
      changes.push({ ...current, change: 'added', versionBefore: null, versionAfter: current.version });
    } else if (previous && !current) {
      changes.push({ ecosystem: previous.ecosystem, packageName, change: 'removed', versionBefore: previous.version, versionAfter: null });
    } else if (previous && current && previous.version !== current.version) {
      // Numeric comparison where possible; unparseable versions (e.g.
      // experimental hash pins) are reported as a neutral 'changed' rather
      // than a misleading upgrade/downgrade from string comparison.
      const cmp = compareVersions(previous.version ?? '', current.version ?? '');
      const change: DependencyChange = cmp < 0 ? 'upgraded' : cmp > 0 ? 'downgraded' : 'changed';
      changes.push({
        ecosystem: current.ecosystem,
        packageName,
        change,
        versionBefore: previous.version,
        versionAfter: current.version,
      });
    }
  }
  return changes.sort((a, b) => a.packageName.localeCompare(b.packageName));
}
