'use client';

import { useMemo } from 'react';
import { Eye, ArrowDown, ChevronDown } from 'lucide-react';
import SentinelMascot from './SentinelMascot';
import { useReveal } from '@/lib/useReveal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CinematicHeroProps {
  onStartOnboarding: () => void;
  onScrollToHow: () => void;
}

/* ------------------------------------------------------------------ */
/*  Particle config (CSS-only, no canvas)                              */
/* ------------------------------------------------------------------ */

const PARTICLE_KEYFRAMES = `
@keyframes hero-float {
  0%   { transform: translateY(0)   translateX(0)   scale(1);   opacity: 0 }
  10%  { opacity: 1 }
  90%  { opacity: 1 }
  100% { transform: translateY(-100vh) translateX(40px) scale(0.5); opacity: 0 }
}
@keyframes hero-chevron {
  0%, 100% { transform: translateY(0); opacity: .4 }
  50%      { transform: translateY(8px); opacity: .9 }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes hero-float   { 0%, 100% { opacity: 0 } }
  @keyframes hero-chevron  { 0%, 100% { transform: none; opacity: .6 } }
}
`;

interface Particle {
  left: string;
  size: number;
  duration: string;
  delay: string;
  color: string;
}

function generateParticles(count: number): Particle[] {
  const colors = [
    'rgba(6,182,212,0.35)',
    'rgba(16,185,129,0.3)',
    'rgba(139,92,246,0.25)',
    'rgba(6,182,212,0.2)',
    'rgba(34,211,238,0.2)',
  ];
  return Array.from({ length: count }, (_, i) => ({
    left: `${(i / count) * 100 + (((i * 7 + 3) % 11) - 5)}%`,
    size: 2 + ((i * 3) % 4),
    duration: `${14 + ((i * 5) % 12)}s`,
    delay: `${((i * 1.3) % 10).toFixed(1)}s`,
    color: colors[i % colors.length],
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CinematicHero({ onStartOnboarding, onScrollToHow }: CinematicHeroProps) {
  const containerRef = useReveal();
  const particles = useMemo(() => generateParticles(26), []);

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-[calc(100svh-4.5rem)] flex-col items-center justify-center overflow-hidden px-4 py-8 sm:py-10"
    >
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: PARTICLE_KEYFRAMES }} />

      {/* ---- Background layers ---- */}

      {/* Faint grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 bg-grid-pattern bg-grid opacity-30"
        aria-hidden="true"
      />

      {/* Radial hero gradient */}
      <div className="pointer-events-none absolute inset-0 bg-hero-gradient" aria-hidden="true" />

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute bottom-0 rounded-full"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              background: p.color,
              animation: `hero-float ${p.duration} ${p.delay} linear infinite`,
            }}
          />
        ))}
      </div>

      {/* ---- Content ---- */}
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* Floating glow behind mascot */}
        <div className="reveal relative mb-4">
          <div
            className="absolute -inset-8 rounded-full opacity-40 blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(6,182,212,0.25) 0%, rgba(139,92,246,0.1) 50%, transparent 70%)',
            }}
            aria-hidden="true"
          />
          <SentinelMascot size={112} mood="scanning" />
        </div>

        {/* Headline */}
        <h1 className="reveal reveal-delay-1 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          <span className="block text-slate-100">While Bloomberg sleeps,</span>
          <span className="block bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">
            Sentinel watches.
          </span>
        </h1>

        {/* Sub-headline */}
        <p className="reveal reveal-delay-2 mt-4 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
          AI-powered web monitoring with cryptographic proof. Detect market-moving signals before
          anyone else.
        </p>

        {/* CTA buttons */}
        <div className="reveal reveal-delay-3 mt-6 flex flex-wrap items-center justify-center gap-4">
          <button className="btn" onClick={onStartOnboarding}>
            <Eye className="h-4 w-4" />
            Start Watching
          </button>
          <button className="btn-ghost" onClick={onScrollToHow}>
            <ArrowDown className="h-4 w-4" />
            See How It Works
          </button>
        </div>
      </div>

      {/* ---- Scroll indicator ---- */}
      <div
        className="reveal reveal-delay-5 absolute bottom-4 flex flex-col items-center gap-1 text-slate-600"
        aria-hidden="true"
      >
        <span className="text-[11px] font-medium uppercase tracking-widest">Scroll</span>
        <ChevronDown
          className="h-5 w-5"
          style={{ animation: 'hero-chevron 2s ease-in-out infinite' }}
        />
      </div>
    </section>
  );
}
