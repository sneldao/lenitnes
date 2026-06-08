'use client';

import { useMemo } from 'react';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Mood = 'idle' | 'scanning' | 'alert' | 'celebrating';

interface SentinelMascotProps {
  size?: number;
  mood?: Mood;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Keyframes (injected once via <style>)                               */
/* ------------------------------------------------------------------ */

const KEYFRAMES = `
@keyframes sentinel-pulse {
  0%, 100% { r: 1; opacity: .6 }
  50%      { r: 1.15; opacity: 1 }
}
@keyframes sentinel-iris-contract {
  0%, 100% { r: 1; }
  50%      { r: .7; }
}
@keyframes sentinel-sweep {
  from { transform: rotate(0deg) }
  to   { transform: rotate(360deg) }
}
@keyframes sentinel-orbit {
  from { transform: rotate(0deg) translateX(1px) rotate(0deg) }
  to   { transform: rotate(360deg) translateX(1px) rotate(-360deg) }
}
@keyframes sentinel-orbit-expand {
  0%   { transform: rotate(0deg) translateX(1px) rotate(0deg) }
  50%  { transform: rotate(180deg) translateX(1.5px) rotate(-180deg) }
  100% { transform: rotate(360deg) translateX(1px) rotate(-360deg) }
}
@keyframes sentinel-alert-glow {
  0%, 100% { opacity: 0 }
  50%      { opacity: .55 }
}
@keyframes sentinel-rainbow {
  0%   { stop-color: #06b6d4 }
  33%  { stop-color: #8b5cf6 }
  66%  { stop-color: #10b981 }
  100% { stop-color: #06b6d4 }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes sentinel-pulse      { 0%, 100% { r: 1; opacity: .8 } }
  @keyframes sentinel-iris-contract { 0%, 100% { r: 1 } }
  @keyframes sentinel-sweep      { from { transform: rotate(0deg) } to { transform: rotate(0deg) } }
  @keyframes sentinel-orbit      { from { transform: none } to { transform: none } }
  @keyframes sentinel-orbit-expand { from { transform: none } to { transform: none } }
  @keyframes sentinel-alert-glow { 0%, 100% { opacity: 0 } }
  @keyframes sentinel-rainbow    { 0%, 100% { stop-color: #06b6d4 } }
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SentinelMascot({
  size = 120,
  mood = 'idle',
  className = '',
}: SentinelMascotProps) {
  /* We work in a 0-100 viewBox; real px size is via width/height. */
  const cx = 50;
  const cy = 50;

  /* Derived config per mood */
  const cfg = useMemo(() => {
    switch (mood) {
      case 'scanning':
        return {
          irisAnim: 'sentinel-pulse 3s ease-in-out infinite',
          sweepAnim: 'sentinel-sweep 4s linear infinite',
          particleAnim: 'sentinel-orbit 6s linear infinite',
          glowColor: 'rgba(6,182,212,0.12)',
          irisGrad: ['#06b6d4', '#10b981'],
          alertGlow: false,
        };
      case 'alert':
        return {
          irisAnim: 'sentinel-iris-contract 1s ease-in-out infinite',
          sweepAnim: 'sentinel-sweep 2s linear infinite',
          particleAnim: 'sentinel-orbit 3s linear infinite',
          glowColor: 'rgba(239,68,68,0.18)',
          irisGrad: ['#ef4444', '#f59e0b'],
          alertGlow: true,
        };
      case 'celebrating':
        return {
          irisAnim: 'sentinel-pulse 2s ease-in-out infinite',
          sweepAnim: 'sentinel-sweep 3s linear infinite',
          particleAnim: 'sentinel-orbit-expand 4s ease-in-out infinite',
          glowColor: 'rgba(139,92,246,0.15)',
          irisGrad: ['#06b6d4', '#8b5cf6'],
          alertGlow: false,
          rainbow: true,
        };
      default: // idle
        return {
          irisAnim: 'sentinel-pulse 4s ease-in-out infinite',
          sweepAnim: 'none',
          particleAnim: 'none',
          glowColor: 'rgba(6,182,212,0.08)',
          irisGrad: ['#06b6d4', '#10b981'],
          alertGlow: false,
        };
    }
  }, [mood]);

  const particles = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        angle: (360 / 6) * i,
        delay: `${(i * 1).toFixed(1)}s`,
        r: 1.2 + (i % 3) * 0.3,
      })),
    [],
  );

  const isRainbow = mood === 'celebrating';

  return (
    <div className={className} style={{ width: size, height: size }}>
      {/* Inject keyframes once */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Sentinel mascot — ${mood}`}
      >
        <defs>
          {/* Iris gradient */}
          <radialGradient id="sentinel-iris-grad" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={cfg.irisGrad[0]}
              style={isRainbow ? { animation: 'sentinel-rainbow 3s linear infinite' } : undefined}
            />
            <stop offset="100%" stopColor={cfg.irisGrad[1]} />
          </radialGradient>

          {/* Outer ring gradient */}
          <linearGradient
            id="sentinel-ring-grad"
            x1="0"
            y1="0"
            x2="100"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
          </linearGradient>

          {/* Sweep gradient */}
          <linearGradient id="sentinel-sweep-grad">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background glow */}
        <circle cx={cx} cy={cy} r="46" fill={cfg.glowColor} />

        {/* Alert glow pulse */}
        {cfg.alertGlow && (
          <circle
            cx={cx}
            cy={cy}
            r="44"
            fill="rgba(239,68,68,0.12)"
            style={{ animation: 'sentinel-alert-glow 1.2s ease-in-out infinite' }}
          />
        )}

        {/* Outer geometric ring — hexagonal feel */}
        <circle
          cx={cx}
          cy={cy}
          r="40"
          stroke="url(#sentinel-ring-grad)"
          strokeWidth="1.5"
          strokeDasharray="8 4"
        />
        <circle
          cx={cx}
          cy={cy}
          r="36"
          stroke="url(#sentinel-ring-grad)"
          strokeWidth="0.5"
          strokeOpacity="0.4"
        />

        {/* Radar sweep wedge */}
        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: cfg.sweepAnim,
          }}
        >
          <path
            d={`M ${cx} ${cy} L ${cx} ${cy - 35} A 35 35 0 0 1 ${cx + 35 * Math.sin(Math.PI / 6)} ${cy - 35 * Math.cos(Math.PI / 6)} Z`}
            fill="url(#sentinel-sweep-grad)"
            opacity="0.5"
          />
        </g>

        {/* Eye shape — almond/lens */}
        <path
          d={`M ${cx - 28} ${cy} Q ${cx} ${cy - 20} ${cx + 28} ${cy} Q ${cx} ${cy + 20} ${cx - 28} ${cy} Z`}
          stroke="#06b6d4"
          strokeWidth="1"
          strokeOpacity="0.5"
          fill="rgba(6,182,212,0.04)"
        />

        {/* Iris */}
        <circle
          cx={cx}
          cy={cy}
          r="12"
          fill="url(#sentinel-iris-grad)"
          style={{ animation: cfg.irisAnim }}
        />

        {/* Pupil */}
        <circle cx={cx} cy={cy} r="5" fill="#06090f" />
        {/* Pupil highlight */}
        <circle cx={cx - 1.5} cy={cy - 2} r="1.8" fill="rgba(255,255,255,0.6)" />

        {/* Inner tick marks (clock-like) */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1={cx}
            y1={cy - 32}
            x2={cx}
            y2={cy - 29}
            stroke="#06b6d4"
            strokeWidth="0.6"
            strokeOpacity="0.4"
            transform={`rotate(${deg} ${cx} ${cy})`}
          />
        ))}

        {/* Orbiting particles */}
        {particles.map((p, i) => (
          <g
            key={i}
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              animation: cfg.particleAnim,
              animationDelay: p.delay,
            }}
          >
            <circle
              cx={cx}
              cy={cy - 34}
              r={p.r}
              fill={i % 3 === 0 ? '#06b6d4' : i % 3 === 1 ? '#10b981' : '#8b5cf6'}
              opacity="0.7"
              transform={`rotate(${p.angle} ${cx} ${cy})`}
            />
          </g>
        ))}

        {/* Corner brackets — geometric frame */}
        <path d="M 12 18 L 12 12 L 18 12" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
        <path d="M 88 18 L 88 12 L 82 12" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
        <path d="M 12 82 L 12 88 L 18 88" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
        <path d="M 88 82 L 88 88 L 82 88" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </div>
  );
}
