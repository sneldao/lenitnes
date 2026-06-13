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
  50%      { r: 1.2; opacity: 1 }
}
@keyframes sentinel-iris-contract {
  0%, 100% { r: 1; }
  50%      { r: .5; }
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
  0%   { transform: rotate(0deg) translateX(1px) rotate(0deg) opacity: 0.7 }
  50%  { transform: rotate(180deg) translateX(1.8px) rotate(-180deg) opacity: 1 }
  100% { transform: rotate(360deg) translateX(1px) rotate(-360deg) opacity: 0.7 }
}
@keyframes sentinel-alert-glow {
  0%, 100% { opacity: 0; transform: scale(1) }
  50%      { opacity: .65; transform: scale(1.05) }
}
@keyframes sentinel-rainbow {
  0%   { stop-color: #06b6d4 }
  25%  { stop-color: #8b5cf6 }
  50%  { stop-color: #10b981 }
  75%  { stop-color: #f59e0b }
  100% { stop-color: #06b6d4 }
}
@keyframes sentinel-scan-fast {
  0%   { transform: rotate(0deg); opacity: 0.6 }
  25%  { opacity: 1 }
  50%  { opacity: 0.6 }
  75%  { opacity: 1 }
  100% { transform: rotate(360deg); opacity: 0.6 }
}
@keyframes sentinel-particle-pop {
  0%, 100% { opacity: 0; transform: scale(0) }
  20%      { opacity: 0.9; transform: scale(1) }
  80%      { opacity: 0.9; transform: scale(1) }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes sentinel-pulse      { 0%, 100% { r: 1; opacity: .8 } }
  @keyframes sentinel-iris-contract { 0%, 100% { r: 1 } }
  @keyframes sentinel-sweep      { from { transform: rotate(0deg) } to { transform: rotate(0deg) } }
  @keyframes sentinel-scan-fast  { from { transform: rotate(0deg) } to { transform: rotate(0deg) } }
  @keyframes sentinel-orbit      { from { transform: none } to { transform: none } }
  @keyframes sentinel-orbit-expand { from { transform: none } to { transform: none } }
  @keyframes sentinel-alert-glow { 0%, 100% { opacity: 0 } }
  @keyframes sentinel-rainbow    { 0%, 100% { stop-color: #06b6d4 } }
  @keyframes sentinel-particle-pop { 0%, 100% { opacity: 0.3; transform: scale(1) } }
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
  const cx = 50;
  const cy = 50;

  const cfg = useMemo(() => {
    switch (mood) {
      case 'scanning':
        return {
          irisAnim: 'sentinel-pulse 2s ease-in-out infinite',
          sweepAnim: 'sentinel-scan-fast 3s linear infinite',
          particleAnim: 'sentinel-orbit 4s linear infinite',
          glowColor: 'rgba(6,182,212,0.15)',
          irisGrad: ['#06b6d4', '#22d3ee'],
          alertGlow: false,
          outerRingOpacity: 0.6,
        };
      case 'alert':
        return {
          irisAnim: 'sentinel-iris-contract 0.8s ease-in-out infinite',
          sweepAnim: 'sentinel-sweep 1.5s linear infinite',
          particleAnim: 'sentinel-orbit 2.5s linear infinite',
          glowColor: 'rgba(239,68,68,0.2)',
          irisGrad: ['#ef4444', '#f59e0b'],
          alertGlow: true,
          outerRingOpacity: 0.8,
        };
      case 'celebrating':
        return {
          irisAnim: 'sentinel-pulse 1.5s ease-in-out infinite',
          sweepAnim: 'sentinel-sweep 2s linear infinite',
          particleAnim: 'sentinel-orbit-expand 3s ease-in-out infinite',
          glowColor: 'rgba(139,92,246,0.18)',
          irisGrad: ['#06b6d4', '#8b5cf6'],
          alertGlow: false,
          outerRingOpacity: 0.7,
          rainbow: true,
        };
      default: // idle
        return {
          irisAnim: 'sentinel-pulse 4s ease-in-out infinite',
          sweepAnim: 'sentinel-sweep 8s linear infinite',
          particleAnim: 'sentinel-orbit 10s linear infinite',
          glowColor: 'rgba(6,182,212,0.08)',
          irisGrad: ['#06b6d4', '#10b981'],
          alertGlow: false,
          outerRingOpacity: 0.4,
        };
    }
  }, [mood]);

  const particles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        angle: (360 / 8) * i,
        delay: `${(i * 0.5).toFixed(1)}s`,
        r: 1.0 + (i % 4) * 0.3,
        color:
          i % 4 === 0 ? '#06b6d4' : i % 4 === 1 ? '#10b981' : i % 4 === 2 ? '#8b5cf6' : '#f59e0b',
      })),
    [],
  );

  const isRainbow = mood === 'celebrating';

  return (
    <div className={className} style={{ width: size, height: size }}>
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
          <radialGradient id="sentinel-iris-grad" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={cfg.irisGrad[0]}
              style={isRainbow ? { animation: 'sentinel-rainbow 2s linear infinite' } : undefined}
            />
            <stop offset="100%" stopColor={cfg.irisGrad[1]} />
          </radialGradient>

          <linearGradient
            id="sentinel-ring-grad"
            x1="0"
            y1="0"
            x2="100"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={cfg.outerRingOpacity} />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity={cfg.outerRingOpacity * 0.5} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={cfg.outerRingOpacity} />
          </linearGradient>

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
            fill="rgba(239,68,68,0.15)"
            style={{ animation: 'sentinel-alert-glow 1s ease-in-out infinite' }}
          />
        )}

        {/* Outer ring */}
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

        {/* Eye shape */}
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
        <circle cx={cx - 1.5} cy={cy - 2.5} r="2" fill="rgba(255,255,255,0.7)" />

        {/* Tick marks */}
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
              fill={p.color}
              opacity="0.8"
              transform={`rotate(${p.angle} ${cx} ${cy})`}
              style={{
                animation:
                  mood === 'alert' ? 'sentinel-particle-pop 1.5s ease-in-out infinite' : undefined,
                animationDelay: p.delay,
              }}
            />
          </g>
        ))}

        {/* Corner brackets */}
        <path d="M 12 18 L 12 12 L 18 12" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
        <path d="M 88 18 L 88 12 L 82 12" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
        <path d="M 12 82 L 12 88 L 18 88" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
        <path d="M 88 82 L 88 88 L 82 88" stroke="#243044" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </div>
  );
}
