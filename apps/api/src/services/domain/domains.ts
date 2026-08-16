import type { MonitorDomain } from '@lenitnes/types';

// ── Domain parameter resolution (single source of truth) ──────
//
// Public URL labels:  markets | research
// Legacy aliases:     code | science | bio
// Internal wire value: 'code' | 'science' (monitors.domain, migration 008).
//
// Every route that reads a `domain` query param MUST go through
// resolveDomainParam so the alias set lives in exactly one place.

/**
 * Resolve a public `domain` query value to the canonical internal wire
 * domain. `markets` (and the legacy `code`) means the price oracle;
 * `research`, `science`, and `bio` all resolve to the record oracle.
 * Unknown/absent values default to `code` (the original vertical).
 */
export function resolveDomainParam(raw: unknown): MonitorDomain {
  const value = String(raw ?? '');
  return value === 'science' || value === 'bio' || value === 'research' ? 'science' : 'code';
}
