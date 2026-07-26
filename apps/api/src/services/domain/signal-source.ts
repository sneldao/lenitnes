// ─────────────────────────────────────────────────────────────
// Signal source attribution — turns a signal's origin (which
// monitor + which detector types) into a human-readable label.
//
// The system now generates signals from four distinct surfaces:
//   1. commit — a single monitored repo's commit tripped a detector
//   2. narrative — cross-repo cluster of existing signals
//   3. thesis — aggregated un-triggered commits (thesis synthesis)
//   4. proactive — velocity anomaly or high-impact PR activity
//
// This module is the single source of truth for classifying a
// signal's origin so the UI, Telegram, and scorecard all speak
// the same language. The credibility product is the distinction
// between "one commit matched a keyword" and "15 commits across
// 3 repos collectively telegraph a consensus change."
// ─────────────────────────────────────────────────────────────

export type SignalSourceCategory = 'commit' | 'narrative' | 'thesis' | 'proactive';

export interface SignalSourceLabel {
  category: SignalSourceCategory;
  /** Short badge label, e.g. "Thesis synthesis". */
  label: string;
  /** One-line human explanation of what produced this signal. */
  explanation: string;
  /** Emoji tag for Telegram. */
  tag: string;
}

const SYNTHESIS_MONITOR_URLS: Record<string, SignalSourceCategory> = {
  'narrative:portfolio': 'narrative',
  'synthesis:thesis': 'thesis',
  'proactive:signals': 'proactive',
};

const PROACTIVE_DETECTOR_TYPES = new Set([
  'velocity_anomaly',
  'pr_activity',
  'security_advisory',
  'protocol_release',
  'funding_oi_anomaly',
]);

const SOURCE_META: Record<
  SignalSourceCategory,
  { label: string; explanation: string; tag: string }
> = {
  commit: {
    label: 'Commit signal',
    explanation: 'A monitored repository commit tripped a detector.',
    tag: '🔍',
  },
  narrative: {
    label: 'Narrative synthesis',
    explanation: 'Cross-repo cluster of recent signals formed a tradeable theme.',
    tag: '🌐',
  },
  thesis: {
    label: 'Thesis synthesis',
    explanation:
      'Multiple un-triggered commits across repos collectively formed a tradeable thesis.',
    tag: '🧩',
  },
  proactive: {
    label: 'Proactive scan',
    explanation:
      'Detected by the proactive scanner: commit-velocity anomaly, high-impact PR, security advisory, protocol release, or perp funding/OI structure.',
    tag: '⚡',
  },
};

/**
 * Classify a signal's origin from its monitor URL and/or the
 * detector types that fired. monitorUrl takes precedence for the
 * synthetic monitors; otherwise detector types disambiguate
 * proactive signals created under a shared monitor row.
 */
export function classifySignalSource(
  monitorUrl: string | null | undefined,
  detectorTypes?: string[] | null,
): SignalSourceLabel {
  let category: SignalSourceCategory = 'commit';

  if (monitorUrl && SYNTHESIS_MONITOR_URLS[monitorUrl]) {
    category = SYNTHESIS_MONITOR_URLS[monitorUrl];
  } else if (detectorTypes?.some((d) => PROACTIVE_DETECTOR_TYPES.has(d))) {
    category = 'proactive';
  }

  return { category, ...SOURCE_META[category] };
}

/**
 * A richer, signal-specific explanation. For proactive signals,
 * appends the concrete reason (e.g. "commit rate +2.3σ" or the PR
 * title). Falls back to the generic explanation otherwise.
 */
export function explainSignalSource(
  monitorUrl: string | null | undefined,
  detectorTypes?: string[] | null,
  metadata?: Record<string, unknown> | null,
): string {
  const base = classifySignalSource(monitorUrl, detectorTypes);

  if (base.category === 'proactive' && metadata) {
    if (metadata.direction != null && metadata.deviation != null) {
      const dir = metadata.direction === 'elevated' ? 'spike' : 'drop';
      return `Commit-velocity ${dir}: ${metadata.deviation}σ from the 30-day baseline (${metadata.current7d} commits this week vs ~${metadata.baselineWeekly} normally).`;
    }
    if (metadata.prNumber != null) {
      const labels = Array.isArray(metadata.labels) ? (metadata.labels as string[]).join(', ') : '';
      return `High-impact open PR #${metadata.prNumber} by ${metadata.author} (+${metadata.additions}/−${metadata.deletions} across ${metadata.changedFiles} files${labels ? `, labels: ${labels}` : ''}).`;
    }
    if (metadata.ghsaId != null) {
      const cve = metadata.cveId ? ` (${metadata.cveId})` : '';
      return `${metadata.severity} security advisory ${metadata.ghsaId}${cve} published. ${metadata.summary ?? ''}`.trim();
    }
    if (metadata.tagName != null) {
      return `Release ${metadata.tagName} published${metadata.prerelease ? ' (pre-release)' : ''}: ${metadata.name ?? ''}`.trim();
    }
    if (metadata.suggestedDirection != null) {
      const funding =
        typeof metadata.fundingRateHourly === 'number'
          ? `${(metadata.fundingRateHourly * 100).toFixed(4)}%/hr`
          : 'extreme';
      const oi =
        typeof metadata.openInterestUsd === 'number'
          ? `$${(metadata.openInterestUsd / 1_000_000).toFixed(0)}M OI`
          : '';
      return `Perp funding at ${funding} → contrarian ${metadata.suggestedDirection} bias${oi ? ` on ${oi}` : ''}.`;
    }
  }

  if (base.category === 'thesis' && metadata?.commitCount != null) {
    return `${metadata.commitCount} un-triggered commits across ${metadata.repoCount} repos collectively formed a thesis.`;
  }

  return base.explanation;
}
