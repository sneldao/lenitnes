// Circuit breaker for external AI / inference services.
// After THRESHOLD consecutive failures within WINDOW_MS, skip calls for COOLDOWN_MS.

interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
  openedAt: number;
}

const circuits = new Map<string, CircuitState>();

export interface CircuitOptions {
  name: string;
  threshold?: number;
  windowMs?: number;
  cooldownMs?: number;
}

export function isCircuitOpen(opts: CircuitOptions): boolean {
  const { name, threshold = 5, windowMs = 60_000, cooldownMs = 300_000 } = opts;
  const now = Date.now();
  const state = circuits.get(name);
  if (!state) return false;

  // If cooldown period has passed since opening, half-open (allow one call).
  if (state.open && now - state.openedAt >= cooldownMs) {
    state.open = false;
    state.failures = 0;
    return false;
  }

  if (state.open) return true;

  // If failures within window exceed threshold, open the circuit.
  if (state.failures >= threshold && now - state.lastFailure <= windowMs) {
    state.open = true;
    state.openedAt = now;
    console.warn(`[circuit] ${name} OPENED after ${threshold} failures`);
    return true;
  }

  // Reset stale failures outside the window.
  if (now - state.lastFailure > windowMs) {
    state.failures = 0;
  }

  return false;
}

export function recordSuccess(opts: CircuitOptions): void {
  const state = circuits.get(opts.name);
  if (state) {
    state.failures = 0;
    state.open = false;
  }
}

export function recordFailure(opts: CircuitOptions): void {
  const { name } = opts;
  const now = Date.now();
  const state = circuits.get(name) ?? { failures: 0, lastFailure: now, open: false, openedAt: 0 };
  state.failures++;
  state.lastFailure = now;
  circuits.set(name, state);
}
