/**
 * Centralized behavioral microcopy — single source of truth for all UI strings.
 *
 * Every string in the app is either a nudge or dead weight.
 * This module reframes technical facts into emotionally resonant,
 * action-oriented language using behavioral insights:
 *   - Loss aversion: emphasize what users miss, not just system state
 *   - Anchoring: provide familiar reference points (USD, time)
 *   - Social proof: show what others are doing
 *   - Scarcity/urgency: time pressure drives action
 *   - Peak-end rule: celebrate the peak moment (signal detection)
 *   - Zeigarnik effect: incomplete setups feel uncomfortable
 */

const HBAR_USD_RATE = 0.06;

/** Format ℏ with USD equivalent for anchoring. */
export function hbarWithUsd(hbar: number): string {
  const usd = hbar * HBAR_USD_RATE;
  return `${hbar.toFixed(2)} ℏ  (~$${usd.toFixed(2)})`;
}

/** Format per-check cost with USD anchoring. */
export function perCheckUsd(cost: number): string {
  const usd = cost * HBAR_USD_RATE;
  return `${cost.toFixed(2)} ℏ  — about $${usd.toFixed(2)} per check`;
}

/** Format hours/mins remaining for countdowns. */
export function formatTimeLeft(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '< 1m';
}

/** Strip protocol and path from URL for display. */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

export const COPY = {
  monitor: {
    /** Loss aversion: what you missed while inactive. */
    inactive: (missedCount: number) =>
      missedCount > 0
        ? `Monitor paused — ${missedCount} potential ${missedCount === 1 ? 'signal' : 'signals'} missed while inactive`
        : 'Monitor paused — no funds staked. Top up to resume watching.',

    /** Checks remaining with urgency. */
    checksRemaining: (n: number) => `${n} check${n === 1 ? '' : 's'} remaining`,

    /** Scarcity countdown until depletion. */
    expiresIn: (secondsLeft: number) => {
      const tl = formatTimeLeft(secondsLeft);
      return `Expires in ${tl} — top up to keep watching`;
    },

    /** Urgency label for low-balance cards. */
    lowBalance: (checksRemaining: number) =>
      checksRemaining <= 0
        ? 'Out of funds — refill to keep watching'
        : checksRemaining < 3
          ? `Only ${checksRemaining} check${checksRemaining === 1 ? '' : 's'} left — refill now`
          : `${checksRemaining} checks remaining`,

    /** Action labels: what the user GETS, not what we DO. */
    actions: {
      execute: 'Check Now',
      executeSubtitle: 'Instantly verify if the condition is met',
      delete: 'Remove',
      deleteSubtitle: 'Release remaining escrow',
      topUp: 'Refill',
      topUpSubtitle: 'Add ℏ to keep your monitor running',
    },

    /** Status labels: emotional, not technical. */
    statusLabel: (status: string) =>
      (
        ({
          active: 'Watching',
          triggered: 'Signal caught!',
          paused: 'Paused',
          insufficient_balance: 'Needs funds',
        }) as Record<string, string>
      )[status] || status.replace(/_/g, ' '),
  },

  funding: {
    /** USD anchoring for stake display. */
    staked: (hbar: number) => hbarWithUsd(hbar),
    perCheck: (cost: number) => perCheckUsd(cost),
    dailyBurn: (perDay: number) =>
      `${perDay.toFixed(2)} ℏ/day  (~$${(perDay * HBAR_USD_RATE).toFixed(2)})`,
  },

  signals: {
    /** Celebration copy — peak-end rule. */
    detected: (host: string) => ({
      headline: '🎯  Signal detected!',
      body: `Your ${host} monitor caught a match. Sentiment may be shifting.`,
      cta: 'View proof',
      shareCta: 'Share signal',
    }),
  },

  creation: {
    /** Step labels: outcome-oriented. */
    steps: {
      target: 'What to watch',
      schedule: 'How often',
      action: 'What to do',
      review: 'Confirm & start',
    },

    /** First check reframed as preview. */
    firstCheck: {
      title: 'Preview Check',
      subtitle:
        'Run a free check now with TinyFish AI. See exactly what your monitor will detect before staking any ℏ.',
      cta: 'Run Preview',
      running: 'Analyzing with TinyFish…',
    },

    /** Top-up reframed as fuel. */
    topUp: {
      title: 'Fuel your monitor',
      subtitle: (checks: number) =>
        `Stake ℏ to fund ${checks} scheduled check${checks === 1 ? '' : 's'}. You can withdraw anytime by deleting the monitor.`,
      amountLabel: 'Amount to stake',
      checksEquivalent: (amount: number, cost: number) => {
        const checks = Math.floor(amount / cost);
        return `≈ ${checks} check${checks === 1 ? '' : 's'}`;
      },
    },

    /** Sensitivity slider helper. */
    sensitivity: {
      label: 'Signal sensitivity',
      relaxed: 'Relaxed: Catches edge cases. Expect more signals.',
      balanced: 'Balanced: Good mix of precision and recall.',
      strict: 'Strict: Only high-confidence matches. Best for avoiding noise.',
    },

    /** Frequency options with cost framing. */
    frequency: (seconds: number) => {
      const opts: Record<number, string> = {
        86400: 'Daily — most economical',
        21600: 'Every 6 hours',
        3600: 'Every hour',
        900: 'Every 15 minutes',
        300: 'Every 5 minutes — highest coverage',
      };
      return opts[seconds] || `Every ${seconds}s`;
    },
  },

  socialProof: {
    watchers: (count: number, target: string) =>
      `${count} Sentinel${count === 1 ? '' : 's'} watching ${target} right now`,
    hourlySignals: (count: number) => `${count} signal${count === 1 ? '' : 's'} detected this hour`,
  },

  confirmation: {
    execute: {
      title: 'Confirm instant check',
      description: (host: string) =>
        `Run an immediate check on ${host}?\n\nYour wallet will sign a 0.5 HBAR micropayment. Nothing is charged until you approve in your wallet.`,
      confirmLabel: 'Pay & Check Now',
    },
    delete: {
      title: 'Remove monitor',
      description: (host: string, remainingHbar: number) => {
        const usd = (remainingHbar * HBAR_USD_RATE).toFixed(2);
        return `Remove ${host} and forfeit ${remainingHbar.toFixed(2)} ℏ (~$${usd}) in staked balance?\n\nThis cannot be undone. Signal history remains on the public proof chain.`;
      },
      confirmLabel: 'Remove & Release',
    },
  },

  errors: {
    noWallet: 'Connect your Hedera wallet to pay via x402.',
    paymentRejected: 'Payment rejected in wallet. You were not charged.',
    paymentFailed: 'x402 payment setup failed. Check your wallet balance and try again.',
    timeout: 'Request timed out. The network may be congested — try again.',
    serverError: 'Check failed on the server. Try again in a moment.',
    monitorInactive: 'Monitor is paused or has insufficient balance. Top up to re-enable.',
    deleteFailed: 'Remove failed: ',
  },
} as const;
