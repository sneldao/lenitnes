// ── Public vocabulary ↔ internal wire values ──────────────────
//
// The API speaks internal domains ('code' | 'science') on the wire and in
// storage (monitors.domain, migration 008). Public surfaces display the
// product labels [markets] (price oracle) and [research] (record oracle),
// and URL params accept markets|research plus the legacy code|science|bio
// aliases. Everything that renders a domain tag — nav, home, scorecard,
// monitors, scan, ticker — goes through this module.

export type InternalDomain = 'code' | 'science';
export type PublicDomain = 'markets' | 'research';

/** Internal wire domain → public display label. */
export function domainLabel(domain: InternalDomain | null | undefined): PublicDomain {
  return domain === 'science' ? 'research' : 'markets';
}

/** Public (or legacy) ?domain= param → canonical internal domain. */
export function normalizeDomainParam(raw: string | null | undefined): InternalDomain {
  const v = raw ?? '';
  return v === 'research' || v === 'science' || v === 'bio' ? 'science' : 'code';
}
