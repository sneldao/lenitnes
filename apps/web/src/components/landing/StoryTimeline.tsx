'use client';

import { useReveal } from '@/lib/useReveal';
import { Zap, Shield, AlertTriangle, TrendingUp } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface TimelineEvent {
  date: string;
  title: string;
  body: string;
  isHighlight?: boolean;
  icon?: typeof Zap;
}

const EVENTS: TimelineEvent[] = [
  {
    date: 'June 5, 2026',
    title: 'The commit',
    body: 'A security-sensitive change lands in zcash/halo2. Verifying-key language and anchor-related changes become visible in public code before they are broadly discussed.',
    icon: AlertTriangle,
  },
  {
    date: 'June 5, 2026',
    title: 'T+0 with Sentinel',
    body: 'A configured LENITNES monitor could detect the public commit, timestamp the observation on Hedera, and store the evidence package for later review.',
    isHighlight: true,
    icon: Zap,
  },
  {
    date: 'Following days',
    title: 'Awareness spreads',
    body: 'If social or press awareness arrives later, the useful question is whether you can prove when your system first saw the signal.',
    icon: Shield,
  },
  {
    date: '',
    title: 'The edge',
    body: 'The edge is not hindsight. It is a verifiable record: target, condition, timestamp, evidence, and the action you chose to take.',
    icon: TrendingUp,
  },
];

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

const TIMELINE_KEYFRAMES = `
@keyframes timeline-glow-border {
  0%, 100% { border-color: rgba(16,185,129,0.35); box-shadow: 0 0 12px rgba(16,185,129,0.15), inset 0 0 20px rgba(16,185,129,0.05) }
  50%      { border-color: rgba(16,185,129,0.7); box-shadow: 0 0 28px rgba(16,185,129,0.3), inset 0 0 35px rgba(16,185,129,0.08) }
}
@keyframes timeline-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 1 }
  50%      { transform: scale(1.3); opacity: 0.7 }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes timeline-glow-border {
    0%, 100% { border-color: rgba(16,185,129,0.5); box-shadow: none }
  }
  @keyframes timeline-dot-pulse {
    0%, 100% { transform: scale(1) }
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StoryTimeline() {
  const containerRef = useReveal();

  return (
    <section ref={containerRef} className="relative mx-auto max-w-2xl px-4 py-24" id="zec-story">
      <style dangerouslySetInnerHTML={{ __html: TIMELINE_KEYFRAMES }} />

      {/* Section title */}
      <div className="reveal text-center">
        <span className="badge bg-warn/10 text-warn mb-3">Case Study</span>
        <h2 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl">
          The{' '}
          <span
            className="bg-gradient-to-r from-accent via-warn to-signal bg-clip-text text-transparent animate-gradient-shift"
            style={{ backgroundSize: '200% 200%' }}
          >
            $ZEC
          </span>{' '}
          story
        </h2>
        <p className="text-sm text-slate-500 max-w-lg mx-auto">
          Public-code signals can surface before broad market awareness — if you&apos;re watching.
        </p>
      </div>

      {/* Timeline */}
      <div className="relative mt-16">
        {/* Vertical spine with gradient */}
        <div
          className="absolute left-4 top-0 h-full w-px sm:left-6"
          style={{
            background:
              'linear-gradient(to bottom, transparent, #1a2332 15%, #06b6d4 50%, #1a2332 85%, transparent)',
          }}
          aria-hidden="true"
        />

        {EVENTS.map((ev, idx) => {
          const Icon = ev.icon;
          return (
            <div
              key={idx}
              className={`reveal relative mb-12 pl-12 sm:pl-16`}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              {/* Dot */}
              <div
                className="absolute left-2.5 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 sm:left-4.5 sm:-translate-x-1/2"
                style={{
                  borderColor: ev.isHighlight ? '#10b981' : '#243044',
                  background: ev.isHighlight
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : '#0f1520',
                  boxShadow: ev.isHighlight
                    ? '0 0 12px rgba(16,185,129,0.5), 0 0 0 0 rgba(16,185,129,0.3)'
                    : 'none',
                  animation: ev.isHighlight ? 'timeline-dot-pulse 2s ease-in-out infinite' : 'none',
                }}
                aria-hidden="true"
              >
                {Icon && <Icon className="h-3 w-3 text-white" />}
              </div>

              {/* Card */}
              <div
                className="rounded-xl border border-edge/60 bg-panel/80 px-5 py-4 backdrop-blur-sm transition-all duration-300 hover:border-edge-light"
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
                  <span className="mb-1.5 block font-mono text-[11px] font-medium text-slate-600">
                    {ev.date}
                  </span>
                )}
                <h3
                  className="text-sm font-bold mb-1"
                  style={{
                    color: ev.isHighlight ? '#10b981' : '#e2e8f0',
                  }}
                >
                  {ev.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-400">{ev.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Commit link */}
      <div className="reveal mt-8 text-center">
        <a
          href="https://github.com/zcash/halo2/commit/d8e48efd"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 rounded-xl border border-edge/40 bg-panel/40 px-4 py-2.5 font-mono text-xs text-accent/70 transition-all hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>View the real commit</span>
          <span className="text-accent/40 group-hover:text-accent/70 transition-colors">
            {'\u2192'}
          </span>
        </a>
      </div>
    </section>
  );
}
