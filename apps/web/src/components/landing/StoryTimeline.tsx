'use client';

import { useReveal } from '@/lib/useReveal';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface TimelineEvent {
  date: string;
  title: string;
  body: string;
  isHighlight?: boolean;
}

const EVENTS: TimelineEvent[] = [
  {
    date: 'June 5, 2026',
    title: 'The commit',
    body: 'A security-sensitive change lands in zcash/halo2. Verifying-key language and anchor-related changes become visible in public code before they are broadly discussed.',
  },
  {
    date: 'June 5, 2026',
    title: 'T+0 with Sentinel',
    body: 'A configured LENITNES monitor could detect the public commit, timestamp the observation on Hedera, and store the evidence package for later review.',
    isHighlight: true,
  },
  {
    date: 'Following days',
    title: 'Awareness spreads',
    body: 'If social or press awareness arrives later, the useful question is whether you can prove when your system first saw the signal.',
  },
  {
    date: '',
    title: 'The edge',
    body: 'The edge is not hindsight. It is a verifiable record: target, condition, timestamp, evidence, and the action you chose to take.',
  },
];

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

const TIMELINE_KEYFRAMES = `
@keyframes timeline-glow-border {
  0%, 100% { border-color: rgba(16,185,129,0.35); box-shadow: 0 0 12px rgba(16,185,129,0.1) }
  50%      { border-color: rgba(16,185,129,0.7); box-shadow: 0 0 28px rgba(16,185,129,0.2) }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes timeline-glow-border {
    0%, 100% { border-color: rgba(16,185,129,0.5); box-shadow: none }
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StoryTimeline() {
  const containerRef = useReveal();

  return (
    <section ref={containerRef} className="relative mx-auto max-w-2xl px-4 py-24">
      <style dangerouslySetInnerHTML={{ __html: TIMELINE_KEYFRAMES }} />

      {/* Section title */}
      <h2 className="reveal mb-4 text-center text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
        The{' '}
        <span className="bg-gradient-to-r from-accent to-warn bg-clip-text text-transparent">
          $ZEC
        </span>{' '}
        story
      </h2>
      <p className="reveal reveal-delay-1 mb-14 text-center text-sm text-slate-500">
        Public-code signals can surface before broad market awareness
      </p>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical spine */}
        <div
          className="absolute left-4 top-0 h-full w-px sm:left-6"
          style={{
            background:
              'linear-gradient(to bottom, transparent, #1a2332 10%, #1a2332 90%, transparent)',
          }}
          aria-hidden="true"
        />

        {EVENTS.map((ev, idx) => (
          <div key={idx} className={`reveal reveal-delay-${idx + 1} relative mb-10 pl-12 sm:pl-16`}>
            {/* Dot */}
            <div
              className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full border-2 sm:left-4.5"
              style={{
                borderColor: ev.isHighlight ? '#10b981' : '#243044',
                background: ev.isHighlight ? '#10b981' : '#0f1520',
                boxShadow: ev.isHighlight ? '0 0 10px rgba(16,185,129,0.4)' : 'none',
              }}
              aria-hidden="true"
            />

            {/* Card */}
            <div
              className="rounded-xl border border-edge/60 bg-panel/80 px-5 py-4 backdrop-blur-sm"
              style={
                ev.isHighlight
                  ? {
                      animation: 'timeline-glow-border 3s ease-in-out infinite',
                      borderColor: 'rgba(16,185,129,0.35)',
                    }
                  : undefined
              }
            >
              {ev.date && (
                <span className="mb-1 block font-mono text-[11px] font-medium text-slate-600">
                  {ev.date}
                </span>
              )}
              <h3
                className="text-sm font-bold"
                style={{
                  color: ev.isHighlight ? '#10b981' : '#e2e8f0',
                }}
              >
                {ev.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{ev.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Commit link */}
      <div className="reveal reveal-delay-5 mt-6 text-center">
        <a
          href="https://github.com/zcash/halo2/commit/d8e48efd"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-accent/70 transition-colors hover:text-accent"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          View the real commit →
        </a>
      </div>
    </section>
  );
}
