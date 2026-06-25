import type { Config } from 'tailwindcss';

import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#06090f',
        'ink-light': '#0c1018',
        panel: '#0f1520',
        'panel-hover': '#141c2a',
        edge: '#1a2332',
        'edge-light': '#243044',
        rust: '#c84a1f',
        'rust-glow': '#e05a2e',
        cream: '#f4efe5',
        accent: '#06b6d4',
        'accent-glow': '#22d3ee',
        signal: '#10b981',
        'signal-glow': '#34d399',
        violet: '#8b5cf6',
        'violet-glow': '#a78bfa',
        warn: '#f59e0b',
        danger: '#ef4444',
        'danger-glow': '#f87171',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(to right, rgba(26,35,50,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,35,50,0.3) 1px, transparent 1px)',
        'glow-radial':
          'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.08) 0%, transparent 60%)',
        'hero-gradient':
          'linear-gradient(135deg, rgba(6,182,212,0.05) 0%, rgba(16,185,129,0.03) 50%, transparent 100%)',
      },
      backgroundSize: {
        grid: '40px 40px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(6,182,212,0.15)',
        'glow-sm': '0 0 10px rgba(6,182,212,0.1)',
        'glow-signal': '0 0 20px rgba(16,185,129,0.15)',
        'glow-danger': '0 0 20px rgba(239,68,68,0.15)',
        card: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(26,35,50,0.5)',
        'glow-violet': '0 0 20px rgba(139,92,246,0.15)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(6,182,212,0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite alternate',
        'fade-slide-up': 'fadeSlideUp 0.5s ease-out both',
        'proof-reveal': 'proofReveal 0.4s ease-out both',
        'cinematic-entrance': 'cinematicEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
        'bounce-down': 'bounceDown 2s ease-in-out infinite',
        'timeline-glow': 'timelineGlow 2s ease-in-out infinite',
        'glitch-text': 'glitchText 3s ease-in-out infinite',
        shimmer: 'shimmer 3s ease-in-out infinite',
        'gradient-shift': 'gradientShift 4s ease infinite',
        'typing-cursor': 'typingCursor 0.8s step-end infinite',
        'ring-expand': 'ringExpand 2s ease-out infinite',
        'data-pulse': 'dataPulse 2s ease-in-out infinite',
        'scan-line': 'scanLine 4s linear infinite',
        'hex-glow': 'hexGlow 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%': { boxShadow: '0 0 5px rgba(6,182,212,0.1)' },
          '100%': { boxShadow: '0 0 20px rgba(6,182,212,0.2)' },
        },
        fadeSlideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        proofReveal: {
          '0%': { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        cinematicEntrance: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(20px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        bounceDown: {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '50%': { transform: 'translateY(6px)', opacity: '0.8' },
        },
        timelineGlow: {
          '0%, 100%': {
            boxShadow: '0 0 10px rgba(16,185,129,0.2), 0 0 30px rgba(16,185,129,0.1)',
          },
          '50%': {
            boxShadow: '0 0 20px rgba(16,185,129,0.4), 0 0 60px rgba(16,185,129,0.2)',
          },
        },
        glitchText: {
          '0%, 90%, 100%': { transform: 'translate(0)', opacity: '1' },
          '92%': { transform: 'translate(-2px, 1px)', opacity: '0.8' },
          '94%': { transform: 'translate(2px, -1px)', opacity: '0.9' },
          '96%': { transform: 'translate(-1px, -1px)', opacity: '0.85' },
          '98%': { transform: 'translate(1px, 1px)', opacity: '0.95' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%) skewX(-15deg)' },
          '60%': { transform: 'translateX(200%) skewX(-15deg)' },
          '100%': { transform: 'translateX(200%) skewX(-15deg)' },
        },
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        typingCursor: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        ringExpand: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        dataPulse: {
          '0%': { strokeDashoffset: '100', opacity: '0.2' },
          '50%': { strokeDashoffset: '0', opacity: '1' },
          '100%': { strokeDashoffset: '-100', opacity: '0.2' },
        },
        scanLine: {
          '0%': { top: '-10%' },
          '100%': { top: '110%' },
        },
        hexGlow: {
          '0%, 100%': {
            strokeOpacity: '0.3',
            filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.2))',
          },
          '50%': {
            strokeOpacity: '0.8',
            filter: 'drop-shadow(0 0 12px rgba(6, 182, 212, 0.5))',
          },
        },
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.delay-1': { 'animation-delay': '150ms' },
        '.delay-2': { 'animation-delay': '300ms' },
        '.delay-3': { 'animation-delay': '450ms' },
        '.delay-4': { 'animation-delay': '600ms' },
        '.delay-5': { 'animation-delay': '750ms' },
        '.delay-6': { 'animation-delay': '900ms' },
      });
    }),
  ],
};

export default config;
