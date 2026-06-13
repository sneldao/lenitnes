'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Eye, ArrowDown, ChevronDown, Shield, Zap, CircuitBoard } from 'lucide-react';
import SentinelMascot from './SentinelMascot';
import LiveCounterBar from './LiveCounterBar';
import { useReveal } from '@/lib/useReveal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CinematicHeroProps {
  onStartOnboarding: () => void;
  onScrollToHow: () => void;
}

/* ------------------------------------------------------------------ */
/*  CSS Keyframes injected once                                         */
/* ------------------------------------------------------------------ */

const HERO_KEYFRAMES = `
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
@keyframes cinematic-text-reveal {
  0%   { clip-path: polygon(0 0, 100% 0, 100% 100%, 0% 100%); transform: translateY(20px); opacity: 0; filter: blur(4px) }
  100% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0% 100%); transform: translateY(0); opacity: 1; filter: blur(0) }
}
@keyframes hex-rotate {
  0%   { transform: rotate(0deg) scale(1); opacity: 0.15 }
  50%  { transform: rotate(180deg) scale(1.1); opacity: 0.25 }
  100% { transform: rotate(360deg) scale(1); opacity: 0.15 }
}
@keyframes line-grow {
  0%   { width: 0%; opacity: 0 }
  100% { width: 100%; opacity: 0.6 }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes hero-float   { 0%, 100% { opacity: 0 } }
  @keyframes hero-chevron  { 0%, 100% { transform: none; opacity: .6 } }
  @keyframes cinematic-text-reveal { 0%, 100% { opacity: 1; filter: blur(0); transform: none } }
  @keyframes hex-rotate    { 0%, 100% { opacity: 0.15; transform: none } }
  @keyframes line-grow     { 0%, 100% { width: 100%; opacity: 0.6 } }
}
`;

/* ------------------------------------------------------------------ */
/*  Particle config (CSS-only)                                         */
/* ------------------------------------------------------------------ */

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

/* ── Matrix code characters ── */

const MATRIX_CHARS = '01アイウエオカキクケコサシスセソタチツテト';

interface MatrixDrop {
  id: number;
  left: string;
  length: number;
  duration: string;
  delay: string;
  fontSize: number;
}

function generateMatrixDrops(count: number): MatrixDrop[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    length: 5 + Math.floor(Math.random() * 15),
    duration: `${6 + Math.random() * 8}s`,
    delay: `${Math.random() * 10}s`,
    fontSize: 8 + Math.floor(Math.random() * 6),
  }));
}

/* ── Geometric floating shapes ── */

interface FloatShape {
  id: number;
  type: 'hexagon' | 'triangle' | 'circle' | 'square';
  left: string;
  top: string;
  size: number;
  duration: string;
  delay: string;
  color: string;
}

function generateShapes(count: number): FloatShape[] {
  const shapes: FloatShape['type'][] = ['hexagon', 'triangle', 'circle', 'square'];
  const colors = [
    'rgba(6,182,212,0.12)',
    'rgba(16,185,129,0.10)',
    'rgba(139,92,246,0.08)',
    'rgba(34,211,238,0.10)',
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    type: shapes[i % shapes.length],
    left: `${5 + Math.random() * 90}%`,
    top: `${5 + Math.random() * 90}%`,
    size: 20 + Math.floor(Math.random() * 40),
    duration: `${15 + Math.random() * 15}s`,
    delay: `${Math.random() * 8}s`,
    color: colors[i % colors.length],
  }));
}

/* ── Typewriter text ── */

const TYPEWRITER_LINES = [
  'Scanning GitHub...',
  'Analyzing commits...',
  'Evaluating risk...',
  'Signal detected.',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CinematicHero({ onStartOnboarding, onScrollToHow }: CinematicHeroProps) {
  const containerRef = useReveal();
  const particles = useMemo(() => generateParticles(26), []);
  const matrixDrops = useMemo(() => generateMatrixDrops(20), []);
  const shapes = useMemo(() => generateShapes(6), []);

  // ── Typewriter state ──
  const [typewriterText, setTypewriterText] = useState('');
  const [typewriterLine, setTypewriterLine] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (typewriterLine >= TYPEWRITER_LINES.length) return;

    const currentLine = TYPEWRITER_LINES[typewriterLine];
    let charIndex = 0;

    const typeInterval = setInterval(
      () => {
        if (charIndex < currentLine.length) {
          setTypewriterText(currentLine.slice(0, charIndex + 1));
          charIndex++;
        } else {
          clearInterval(typeInterval);
          // Pause before next line
          setTimeout(() => {
            setTypewriterLine((prev) => prev + 1);
            setTypewriterText('');
          }, 1200);
        }
      },
      40 + Math.random() * 30,
    );

    return () => clearInterval(typeInterval);
  }, [typewriterLine]);

  // ── Cursor blink ──
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, []);

  // ── Mouse tracking gradient ──
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative flex min-h-[calc(100svh-4.5rem)] flex-col items-center justify-center overflow-hidden px-4 py-8 sm:py-10"
    >
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: HERO_KEYFRAMES }} />

      {/* ---- Background layers ---- */}

      {/* Dark base with subtle radial gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at ${mousePos.x}% ${mousePos.y}%, rgba(6,182,212,0.06) 0%, transparent 40%),
            radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.04) 0%, transparent 30%),
            radial-gradient(ellipse at 20% 80%, rgba(16,185,129,0.03) 0%, transparent 30%)
          `,
        }}
        aria-hidden="true"
      />

      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-20"
        aria-hidden="true"
      />

      {/* Scanning line effect */}
      <div
        className="pointer-events-none absolute left-0 right-0 h-px animate-scan-line"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.4), transparent)',
        }}
        aria-hidden="true"
      />

      {/* Matrix code rain columns */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {matrixDrops.map((drop) => (
          <div
            key={drop.id}
            className="absolute"
            style={{
              left: drop.left,
              top: '-10%',
              animation: `matrix-code ${drop.duration} ${drop.delay} linear infinite`,
            }}
          >
            <div className="flex flex-col" style={{ fontSize: `${drop.fontSize}px` }}>
              {Array.from({ length: drop.length }).map((_, ci) => (
                <span
                  key={ci}
                  className="leading-tight"
                  style={{
                    color: ci === drop.length - 1 ? 'rgba(6,182,212,0.6)' : 'rgba(6,182,212,0.15)',
                    fontFamily: 'monospace',
                  }}
                >
                  {MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Floating geometric shapes */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {shapes.map((shape) => (
          <div
            key={shape.id}
            className="absolute animate-float-shape"
            style={{
              left: shape.left,
              top: shape.top,
              width: shape.size,
              height: shape.size,
              animationDuration: shape.duration,
              animationDelay: shape.delay,
            }}
          >
            {shape.type === 'hexagon' && (
              <svg viewBox="0 0 100 100" width={shape.size} height={shape.size}>
                <polygon
                  points="50 0, 93 25, 93 75, 50 100, 7 75, 7 25"
                  fill="none"
                  stroke={shape.color}
                  strokeWidth="1"
                  className="animate-hex-glow"
                />
              </svg>
            )}
            {shape.type === 'circle' && (
              <circle
                cx={shape.size / 2}
                cy={shape.size / 2}
                r={shape.size / 2 - 2}
                fill="none"
                stroke={shape.color}
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            )}
            {shape.type === 'square' && (
              <rect
                x="2"
                y="2"
                width={shape.size - 4}
                height={shape.size - 4}
                fill="none"
                stroke={shape.color}
                strokeWidth="1"
                rx="4"
                className="animate-hex-glow"
              />
            )}
            {shape.type === 'triangle' && (
              <svg viewBox="0 0 100 100" width={shape.size} height={shape.size}>
                <polygon
                  points="50 5, 95 90, 5 90"
                  fill="none"
                  stroke={shape.color}
                  strokeWidth="1"
                  strokeDasharray="8 4"
                />
              </svg>
            )}
          </div>
        ))}
      </div>

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
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        {/* Top badge */}
        <div
          className="reveal mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5"
          style={{ animation: 'cinematic-text-reveal 1s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          <Shield className="h-3 w-3 text-accent" />
          <span className="text-[11px] font-semibold tracking-wide text-accent">
            Proof-Chained Intelligence
          </span>
        </div>

        {/* Sentinel mascot with glow */}
        <div
          className="relative mb-6"
          style={{ animation: 'cinematic-text-reveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          {/* Animated ring */}
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div
              className="h-32 w-32 animate-ring-expand rounded-full border border-accent/30"
              style={{ animationDuration: '3s' }}
            />
          </div>
          <div
            className="absolute -inset-8 rounded-full opacity-30 blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(6,182,212,0.3) 0%, rgba(139,92,246,0.1) 50%, transparent 70%)',
            }}
            aria-hidden="true"
          />
          <SentinelMascot size={112} mood="scanning" />
        </div>

        {/* Headline with gradient shift */}
        <h1
          className="mb-2 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl"
          style={{ animation: 'cinematic-text-reveal 1.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          <span className="block text-slate-100">While Bloomberg sleeps,</span>
          <span
            className="inline-block bg-gradient-to-r from-accent via-violet to-signal bg-clip-text text-transparent animate-gradient-shift"
            style={{ backgroundSize: '200% 200%' }}
          >
            Sentinel watches.
          </span>
        </h1>

        {/* Animated separator line */}
        <div
          className="mx-auto mb-4 h-px max-w-xs"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.4), transparent)',
            animation: 'line-grow 1.5s ease-out 1.5s both',
          }}
          aria-hidden="true"
        />

        {/* Sub-headline */}
        <p
          className="mb-2 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg"
          style={{ animation: 'cinematic-text-reveal 1.6s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          AI reads commits, docs, and code changes that move markets before the price does. Every
          signal is cryptographically proven on Hedera — timestamped, immutable, trade-ready.
        </p>

        {/* Typewriter terminal simulation */}
        <div
          className="mb-6 flex items-center gap-2 rounded-xl border border-edge/50 bg-ink-light/70 px-4 py-2.5 font-mono text-xs backdrop-blur-sm"
          style={{ animation: 'cinematic-text-reveal 1.8s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          <CircuitBoard className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="text-slate-500">$</span>
          <span className="text-slate-300">{typewriterText}</span>
          <span
            className="h-4 w-[2px] bg-accent"
            style={{ opacity: showCursor && typewriterLine < TYPEWRITER_LINES.length ? 1 : 0 }}
          />
          {typewriterLine >= TYPEWRITER_LINES.length && (
            <span className="text-signal font-semibold">✓ Monitoring active</span>
          )}
        </div>

        {/* Live Counter Bar — animated real-time stats */}
        <LiveCounterBar />

        {/* CTA buttons */}
        <div
          className="flex flex-wrap items-center justify-center gap-4"
          style={{ animation: 'cinematic-text-reveal 2s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          <button className="btn group relative overflow-hidden" onClick={onStartOnboarding}>
            {/* Shimmer overlay */}
            <div
              className="pointer-events-none absolute inset-0 animate-shimmer"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
              }}
            />
            <Eye className="h-4 w-4 relative z-10" />
            <span className="relative z-10">Start Watching</span>
          </button>
          <button className="btn-ghost relative overflow-hidden" onClick={onScrollToHow}>
            <ArrowDown className="h-4 w-4" />
            See How It Works
          </button>
        </div>

        {/* Tech stack chips */}
        <div
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
          style={{ animation: 'cinematic-text-reveal 2.2s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          {['Hedera', 'TinyFish', 'Grove', 'Kraken'].map((tech) => (
            <span
              key={tech}
              className="inline-flex items-center gap-1 rounded-full border border-edge/40 bg-ink-light/50 px-2.5 py-1 text-[10px] font-medium text-slate-500"
            >
              <Zap className="h-2.5 w-2.5 text-accent/60" />
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* ---- Scroll indicator ---- */}
      <div
        className="absolute bottom-4 flex flex-col items-center gap-1 text-slate-600"
        aria-hidden="true"
        style={{ animation: 'cinematic-text-reveal 2.5s cubic-bezier(0.16, 1, 0.3, 1) both' }}
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
