// Centralized React Query keys + refetch cadence.
//
// Every component that pulls scorecard or signal data MUST use these
// helpers so the cache stays coherent (one entity = one key prefix).
// Previously three components hit /scorecard/recent with three keys
// and three intervals; invalidation only fired for one of them.

export const qk = {
  scorecard: () => ['scorecard', 'summary'] as const,
  scorecardRecent: (limit?: number) => ['scorecard', 'recent', limit ?? 'default'] as const,
  responsiveness: () => ['backtest', 'responsiveness'] as const,
  signal: (id: string) => ['signal', id] as const,
  publicProof: (id: string) => ['public-proof', id] as const,
  monitors: () => ['monitors'] as const,
  portfolio: () => ['portfolio'] as const,
  adminStatus: () => ['admin', 'status'] as const,
};

// Single source of truth for poll intervals. Components opt into one
// of these instead of inventing their own cadence.
export const REFETCH = {
  // Ambient: agent activity panel, live feed strip
  fast: 20_000,
  // Default for index pages and detail screens
  medium: 60_000,
  // Slowly-changing data (monitor configuration)
  slow: 120_000,
  // Expensive backtest sweep (server caches 30m)
  backtest: 30 * 60_000,
} as const;
