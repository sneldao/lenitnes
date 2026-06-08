'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Zap,
  GitCommit,
  Globe,
  FileText,
  Bell,
  ChevronRight,
  ChevronLeft,
  Clock,
  Sparkles,
  ArrowRight,
  Check,
  Wallet,
} from 'lucide-react';
import { TEMPLATES } from '@/data/templates';

// ─── Types ───

type WatchCategory = 'github' | 'exchange' | 'protocol' | 'custom';
type InterestArea = 'security' | 'price' | 'regulatory' | 'all';
type SpeedPreference = 'realtime' | 'hourly' | 'daily';

interface OnboardingState {
  category: WatchCategory | null;
  interest: InterestArea | null;
  speed: SpeedPreference | null;
}

interface OnboardingWizardProps {
  onComplete: () => void;
  onClose: () => void;
  isWalletConnected: boolean;
  onConnectWallet: () => void | Promise<void>;
}

// ─── Step Indicator ───

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            i === current
              ? 'w-8 bg-accent shadow-glow-sm'
              : i < current
                ? 'w-4 bg-accent/40'
                : 'w-4 bg-edge'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Mascot Speech Bubble ───

function MascotBubble({
  message,
  mood,
}: {
  message: string;
  mood: 'curious' | 'excited' | 'proud';
}) {
  const moodColor =
    mood === 'curious'
      ? 'border-accent/30 bg-accent/5'
      : mood === 'excited'
        ? 'border-signal/30 bg-signal/5'
        : 'border-violet/30 bg-violet/5';

  const moodIcon = mood === 'curious' ? '👁️' : mood === 'excited' ? '⚡' : '🎯';

  return (
    <div
      className={`relative mx-auto max-w-md rounded-2xl border px-6 py-4 ${moodColor} animate-fade-slide-up`}
    >
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">{moodIcon}</div>
      <p className="mt-1 text-center text-sm leading-relaxed text-slate-300">{message}</p>
    </div>
  );
}

// ─── Sentinel Eye (inline, compact version for wizard) ───

function SentinelEyeCompact({ mood }: { mood: 'curious' | 'excited' | 'proud' }) {
  const irisColor = mood === 'curious' ? '#06b6d4' : mood === 'excited' ? '#10b981' : '#8b5cf6';

  return (
    <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
      <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
        <defs>
          <radialGradient id="wizard-iris-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={irisColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={irisColor} stopOpacity="0" />
          </radialGradient>
          <filter id="wizard-blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        {/* Outer ring */}
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke={irisColor}
          strokeWidth="1.5"
          strokeOpacity="0.3"
          className="animate-pulse-slow"
        />
        {/* Inner ring */}
        <circle
          cx="40"
          cy="40"
          r="28"
          fill="none"
          stroke={irisColor}
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        {/* Glow */}
        <circle cx="40" cy="40" r="18" fill="url(#wizard-iris-glow)" filter="url(#wizard-blur)" />
        {/* Iris */}
        <circle cx="40" cy="40" r="12" fill={irisColor} fillOpacity="0.15" />
        <circle
          cx="40"
          cy="40"
          r="6"
          fill={irisColor}
          fillOpacity="0.8"
          className="animate-pulse-slow"
        />
        {/* Pupil */}
        <circle cx="40" cy="40" r="3" fill="#06090f" />
        {/* Highlight */}
        <circle cx="43" cy="37" r="1.5" fill="white" fillOpacity="0.6" />
        {/* Scan lines */}
        {mood === 'curious' && (
          <>
            <line
              x1="40"
              y1="4"
              x2="40"
              y2="16"
              stroke={irisColor}
              strokeWidth="0.5"
              strokeOpacity="0.3"
            />
            <line
              x1="40"
              y1="64"
              x2="40"
              y2="76"
              stroke={irisColor}
              strokeWidth="0.5"
              strokeOpacity="0.3"
            />
            <line
              x1="4"
              y1="40"
              x2="16"
              y2="40"
              stroke={irisColor}
              strokeWidth="0.5"
              strokeOpacity="0.3"
            />
            <line
              x1="64"
              y1="40"
              x2="76"
              y2="40"
              stroke={irisColor}
              strokeWidth="0.5"
              strokeOpacity="0.3"
            />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── Option Card ───

function OptionCard({
  icon: Icon,
  label,
  description,
  selected,
  onClick,
  accentColor = 'accent',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  accentColor?: string;
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    accent: {
      bg: 'bg-accent/10',
      border: 'border-accent/50',
      text: 'text-accent',
      glow: 'shadow-glow-sm',
    },
    signal: {
      bg: 'bg-signal/10',
      border: 'border-signal/50',
      text: 'text-signal',
      glow: 'shadow-glow-signal',
    },
    violet: {
      bg: 'bg-violet/10',
      border: 'border-violet/50',
      text: 'text-violet',
      glow: 'shadow-glow-violet',
    },
    warn: {
      bg: 'bg-warn/10',
      border: 'border-warn/50',
      text: 'text-warn',
      glow: '',
    },
  };

  const colors = colorMap[accentColor] || colorMap.accent;

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all duration-300 cursor-pointer select-none ${
        selected
          ? `${colors.border} ${colors.bg} ${colors.glow} scale-[1.02]`
          : 'border-edge/60 bg-panel/50 hover:border-edge-light/60 hover:bg-panel/80'
      }`}
    >
      {selected && (
        <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-ink">
          <Check className="h-3 w-3" />
        </div>
      )}
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all ${
          selected
            ? `${colors.bg} ${colors.text}`
            : 'bg-edge/40 text-slate-400 group-hover:bg-edge/60 group-hover:text-slate-200'
        }`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p
          className={`text-sm font-semibold ${selected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}
        >
          {label}
        </p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </button>
  );
}

// ─── Speed Slider ───

function SpeedSelector({
  value,
  onChange,
}: {
  value: SpeedPreference | null;
  onChange: (v: SpeedPreference) => void;
}) {
  const options: { key: SpeedPreference; label: string; freq: string; cost: string }[] = [
    { key: 'realtime', label: 'Real-time', freq: 'Every 5 min', cost: '~144 ℏ/day' },
    { key: 'hourly', label: 'Hourly', freq: 'Every hour', cost: '~12 ℏ/day' },
    { key: 'daily', label: 'Daily', freq: 'Once a day', cost: '~0.5 ℏ/day' },
  ];

  return (
    <div className="mx-auto grid max-w-lg gap-3 sm:grid-cols-3">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`group rounded-2xl border p-5 text-center transition-all duration-300 cursor-pointer select-none ${
            value === opt.key
              ? 'border-accent/50 bg-accent/10 shadow-glow-sm'
              : 'border-edge/60 bg-panel/50 hover:border-edge-light/60'
          }`}
        >
          <p
            className={`text-lg font-bold ${value === opt.key ? 'text-accent' : 'text-slate-200'}`}
          >
            {opt.label}
          </p>
          <p className="mt-1 text-xs text-slate-500">{opt.freq}</p>
          <div
            className={`mt-3 inline-block rounded-full px-3 py-1 text-[10px] font-semibold ${
              value === opt.key
                ? 'bg-accent/20 text-accent'
                : 'bg-edge/40 text-slate-500 group-hover:bg-edge/60'
            }`}
          >
            {opt.cost}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Template Recommendation Card ───

function RecommendedTemplate({
  template,
  frequency,
  index,
  onSelect,
}: {
  template: (typeof TEMPLATES)[number];
  frequency: number;
  index: number;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="card group cursor-pointer space-y-3 text-left transition-all hover:border-accent/30 hover:scale-[1.02] active:scale-[0.98]"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${template.bg} transition-transform group-hover:scale-110`}
        >
          <template.icon className={`h-5 w-5 ${template.color}`} />
        </div>
        <ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-100 group-hover:text-white">
          {template.title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{template.desc}</p>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-600">
        <Clock className="h-3 w-3" />
        {frequency >= 86400
          ? `Every ${frequency / 86400}d`
          : frequency >= 3600
            ? `Every ${frequency / 3600}h`
            : `Every ${frequency / 60}m`}
        <span className="text-edge-light">·</span>
        <Sparkles className="h-3 w-3" />
        Pre-configured
      </div>
    </button>
  );
}

// ─── Main Wizard ───

export function OnboardingWizard({
  onComplete,
  onClose,
  isWalletConnected,
  onConnectWallet,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>({
    category: null,
    interest: null,
    speed: null,
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const totalSteps = 5;
  const selectedFrequency =
    state.speed === 'realtime'
      ? 300
      : state.speed === 'hourly'
        ? 3600
        : state.speed === 'daily'
          ? 86400
          : undefined;

  const goNext = useCallback(() => {
    if (step >= totalSteps - 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setIsTransitioning(false);
    }, 300);
  }, [step]);

  const goBack = useCallback(() => {
    if (step <= 0) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setStep((s) => s - 1);
      setIsTransitioning(false);
    }, 300);
  }, [step]);

  // Auto-advance when selection is made (with delay for visual feedback)
  const selectCategory = useCallback(
    (cat: WatchCategory) => {
      setState((s) => ({ ...s, category: cat }));
      setTimeout(goNext, 400);
    },
    [goNext],
  );

  const selectInterest = useCallback(
    (interest: InterestArea) => {
      setState((s) => ({ ...s, interest }));
      setTimeout(goNext, 400);
    },
    [goNext],
  );

  const selectSpeed = useCallback(
    (speed: SpeedPreference) => {
      setState((s) => ({ ...s, speed }));
      setTimeout(goNext, 400);
    },
    [goNext],
  );

  // Filter templates based on selections
  const recommendedTemplates = TEMPLATES.filter((t) => {
    if (state.category === 'github' && t.url.includes('github.com')) return true;
    if (state.category === 'exchange' && (t.url.includes('status.') || t.url.includes('kraken')))
      return true;
    if (
      state.category === 'protocol' &&
      (t.url.includes('docs.') || t.url.includes('hedera') || t.url.includes('updates'))
    )
      return true;
    if (state.category === 'custom') return true;
    if (state.interest === 'security' && t.condition.toLowerCase().includes('security'))
      return true;
    if (state.interest === 'regulatory' && t.url.includes('sec.gov')) return true;
    if (state.interest === 'all') return true;
    return false;
  }).slice(0, 3);

  // Fallback if filtering returns nothing
  const displayTemplates =
    recommendedTemplates.length > 0 ? recommendedTemplates : TEMPLATES.slice(0, 3);

  function handleSelectTemplate(t: (typeof TEMPLATES)[number]) {
    const params = new URLSearchParams({
      url: t.url,
      condition: t.condition,
      frequency: String(selectedFrequency ?? t.frequency),
    });
    router.push(`/monitors/new?${params.toString()}`);
    onComplete();
  }

  function handleCreateMonitor() {
    router.push('/monitors/new');
    onComplete();
  }

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const previousActive = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const shellElements = Array.from(
      document.querySelectorAll<HTMLElement>('body > a[href="#main-content"], header, footer'),
    );
    const previousShellState = shellElements.map((el) => ({
      el,
      ariaHidden: el.getAttribute('aria-hidden'),
      hadInert: el.hasAttribute('inert'),
    }));

    document.body.style.overflow = 'hidden';
    shellElements.forEach((el) => {
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('inert', '');
    });
    closeButtonRef.current?.focus();
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      previousShellState.forEach(({ el, ariaHidden, hadInert }) => {
        if (ariaHidden === null) {
          el.removeAttribute('aria-hidden');
        } else {
          el.setAttribute('aria-hidden', ariaHidden);
        }
        if (!hadInert) {
          el.removeAttribute('inert');
        }
      });
      previousActive?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={handleDialogKeyDown}
    >
      {/* Close button */}
      <button
        ref={closeButtonRef}
        onClick={onClose}
        className="absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-full border border-edge/40 text-slate-500 transition-colors hover:border-edge-light hover:text-slate-200 cursor-pointer"
        aria-label="Close onboarding"
      >
        ✕
      </button>

      <div
        ref={containerRef}
        className={`relative mx-auto max-h-[calc(100svh-4rem)] w-full max-w-2xl overflow-y-auto px-2 py-6 transition-all duration-300 sm:px-6 ${
          isTransitioning ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <h2 id="onboarding-title" className="sr-only">
          Create your first LENITNES monitor
        </h2>
        {/* Step indicator */}
        <div className="mb-8 flex justify-center">
          <StepIndicator current={step} total={totalSteps} />
        </div>

        {/* Step 0: What do you watch? */}
        {step === 0 && (
          <div className="space-y-8">
            <SentinelEyeCompact mood="curious" />
            <MascotBubble
              message="I'm Sentinel. I watch the web so you don't have to. What kind of signals are you looking for?"
              mood="curious"
            />
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
              <OptionCard
                icon={GitCommit}
                label="GitHub Repos"
                description="Commits, releases, security patches"
                selected={state.category === 'github'}
                onClick={() => selectCategory('github')}
                accentColor="accent"
              />
              <OptionCard
                icon={Bell}
                label="Exchanges"
                description="Status pages, outages, maintenance"
                selected={state.category === 'exchange'}
                onClick={() => selectCategory('exchange')}
                accentColor="warn"
              />
              <OptionCard
                icon={FileText}
                label="Protocols"
                description="Docs, governance, upgrades"
                selected={state.category === 'protocol'}
                onClick={() => selectCategory('protocol')}
                accentColor="signal"
              />
              <OptionCard
                icon={Globe}
                label="Custom URL"
                description="Any webpage, any condition"
                selected={state.category === 'custom'}
                onClick={() => selectCategory('custom')}
                accentColor="violet"
              />
            </div>
          </div>
        )}

        {/* Step 1: What matters to you? */}
        {step === 1 && (
          <div className="space-y-8">
            <SentinelEyeCompact mood="curious" />
            <MascotBubble
              message="Great choice! Now, what kind of events should I be scanning for?"
              mood="curious"
            />
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
              <OptionCard
                icon={Shield}
                label="Security"
                description="CVEs, vulnerabilities, critical patches"
                selected={state.interest === 'security'}
                onClick={() => selectInterest('security')}
                accentColor="accent"
              />
              <OptionCard
                icon={Zap}
                label="Price-Moving"
                description="Events that move markets"
                selected={state.interest === 'price'}
                onClick={() => selectInterest('price')}
                accentColor="warn"
              />
              <OptionCard
                icon={FileText}
                label="Regulatory"
                description="SEC filings, sanctions, compliance"
                selected={state.interest === 'regulatory'}
                onClick={() => selectInterest('regulatory')}
                accentColor="violet"
              />
              <OptionCard
                icon={Sparkles}
                label="Everything"
                description="Cast the widest net possible"
                selected={state.interest === 'all'}
                onClick={() => selectInterest('all')}
                accentColor="signal"
              />
            </div>
          </div>
        )}

        {/* Step 2: How fast? */}
        {step === 2 && (
          <div className="space-y-8">
            <SentinelEyeCompact mood="excited" />
            <MascotBubble
              message="Perfect. How quickly do you need to know when something happens?"
              mood="excited"
            />
            <SpeedSelector value={state.speed} onChange={selectSpeed} />
          </div>
        )}

        {/* Step 3: Your personalized watchlist */}
        {step === 3 && (
          <div className="space-y-8">
            <SentinelEyeCompact mood="proud" />
            <MascotBubble
              message="Here's your personalized watchlist. I picked these based on what you told me. Click any to get started!"
              mood="proud"
            />
            <div className="mx-auto grid max-w-lg gap-4 sm:grid-cols-3">
              {displayTemplates.map((t, i) => (
                <RecommendedTemplate
                  key={t.title}
                  template={t}
                  frequency={selectedFrequency ?? t.frequency}
                  index={i}
                  onSelect={() => handleSelectTemplate(t)}
                />
              ))}
            </div>
            <div className="text-center">
              <button
                onClick={goNext}
                className="text-xs text-slate-500 transition-colors hover:text-slate-300 cursor-pointer"
              >
                Or connect your wallet first →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Connect wallet */}
        {step === 4 && (
          <div className="space-y-8 text-center">
            <SentinelEyeCompact mood={isWalletConnected ? 'proud' : 'excited'} />
            {isWalletConnected ? (
              <>
                <MascotBubble
                  message="Wallet connected. Next, create your first monitor so Sentinel has something to watch."
                  mood="proud"
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-signal/10">
                    <Check className="h-8 w-8 text-signal" />
                  </div>
                  <p className="text-sm text-slate-400">Wallet connected successfully</p>
                  <button onClick={handleCreateMonitor} className="btn">
                    <ArrowRight className="h-4 w-4" />
                    Create First Monitor
                  </button>
                </div>
              </>
            ) : (
              <>
                <MascotBubble
                  message="Last step! Connect your Hedera wallet to start monitoring. Pay per signal with HBAR — no subscription needed."
                  mood="excited"
                />
                <div className="flex flex-col items-center gap-6">
                  <button onClick={onConnectWallet} className="btn text-base px-8 py-3.5">
                    <Wallet className="h-5 w-5" />
                    Connect Hedera Wallet
                  </button>
                  <div className="mx-auto max-w-sm space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Check className="h-3 w-3 text-signal" />
                      <span>No credit card required</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Check className="h-3 w-3 text-signal" />
                      <span>Pay ~0.5 ℏ per check (~$0.03)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Check className="h-3 w-3 text-signal" />
                      <span>Withdraw anytime — no lock-in</span>
                    </div>
                  </div>
                  <button
                    onClick={onComplete}
                    className="text-xs text-slate-600 transition-colors hover:text-slate-400 cursor-pointer"
                  >
                    Skip for now — I&apos;ll explore first
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Navigation */}
        {step > 0 && step < 4 && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300 cursor-pointer"
            >
              <ChevronLeft className="h-3 w-3" />
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
