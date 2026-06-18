// Stub: zero-headcount pivot removed auth. Kept as a no-op so
// downstream components (Nav, layout, backtest, signals) keep
// compiling until Day 9 cleans them up.
'use client';
export function useAuth() {
  return { isAuthenticated: false, isLoading: false };
}
