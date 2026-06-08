'use client';

import { Sparkles, Shield, Zap, GitBranch } from 'lucide-react';
import { useReveal } from '@/lib/useReveal';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface Stat {
  icon: typeof Sparkles;
  text: string;
}

const STATS: Stat[] = [
  { icon: Sparkles, text: '10+ Templates' },
  { icon: Shield, text: 'Hedera Powered' },
  { icon: Zap, text: '< 60s Detection' },
  { icon: GitBranch, text: 'Open Source' },
];

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

const MARQUEE_KEYFRAMES = `
@keyframes social-marquee {
  0%   { transform: translateX(0) }
  100% { transform: translateX(-50%) }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes social-marquee {
    0%, 100% { transform: translateX(0) }
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SocialProof() {
  const containerRef = useReveal();

  return (
    <section ref={containerRef} className="relative px-4 py-12">
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_KEYFRAMES }} />

      <div className="reveal mx-auto max-w-3xl">
        {/* Glassmorphism strip */}
        <div className="glass rounded-2xl px-2 py-4 sm:px-6">
          {/* Desktop: centered row */}
          <div className="hidden items-center justify-center gap-6 sm:flex">
            {STATS.map((stat) => (
              <StatPill key={stat.text} stat={stat} />
            ))}
          </div>

          {/* Mobile: auto-scrolling marquee */}
          <div className="relative overflow-hidden sm:hidden">
            <div
              className="flex w-max gap-6"
              style={{
                animation: 'social-marquee 20s linear infinite',
              }}
            >
              {/* Duplicate for seamless loop */}
              {[...STATS, ...STATS].map((stat, i) => (
                <StatPill key={`${stat.text}-${i}`} stat={stat} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat pill sub-component                                            */
/* ------------------------------------------------------------------ */

function StatPill({ stat }: { stat: Stat }) {
  const Icon = stat.icon;

  return (
    <div className="badge border border-edge/60 bg-ink-light/60 px-3.5 py-1.5 text-xs font-medium text-slate-300">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <span>{stat.text}</span>
    </div>
  );
}
