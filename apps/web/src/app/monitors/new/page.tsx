'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { COPY } from '@/lib/copy';
import {
  Globe,
  MessageSquare,
  Clock,
  Zap,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Check,
  Camera,
  AlertTriangle,
  ChevronRight as ChevronRightIcon,
  Sparkles,
  Play,
  Shield,
  Copy,
  ExternalLink,
  Battery,
  BatteryWarning,
  TrendingDown,
  TrendingUp,
  CalendarDays,
  Plus,
  Info,
  Lock,
  Workflow,
  SlidersHorizontal,
  Eye,
} from 'lucide-react';

import { TEMPLATES } from '@/data/templates';

const STEP_META = [
  { icon: Globe, label: COPY.creation.steps.target },
  { icon: Clock, label: COPY.creation.steps.schedule },
  { icon: Zap, label: COPY.creation.steps.action },
  { icon: Wallet, label: COPY.creation.steps.review },
];

type Category = 'code' | 'status' | 'regulatory';

const CATEGORY_META: Record<Category, { label: string; hint: string }> = {
  code: { label: 'Code & Releases', hint: 'Commits, releases, security patches' },
  status: { label: 'Status & Health', hint: 'Outages, incidents, protocol health' },
  regulatory: { label: 'Regulatory & News', hint: 'Filings, sanctions, governance' },
};

const POPULAR_TEMPLATE_TITLE = 'Zcash halo2 — Code Alpha';

// Buckets templates into 3 categories by URL domain.
function getCategoryForTemplate(t: (typeof TEMPLATES)[number]): Category {
  const url = t.url.toLowerCase();
  if (url.includes('status.')) return 'status';
  if (url.includes('sec.gov') || url.includes('chainalysis')) return 'regulatory';
  // GitHub repos, docs pages, and everything else → code & releases
  return 'code';
}

function isPopular(t: (typeof TEMPLATES)[number]): boolean {
  return t.title === POPULAR_TEMPLATE_TITLE;
}

// 2-3 inline example chips shown only in scratch mode, beneath the condition textarea.
// Clicking inserts into the textarea, appending if there's already text.
const SCRATCH_EXAMPLES: string[] = [
  'new commit mentions CVE',
  'status page shows outage',
  'new SEC filing mentions crypto',
];

// Suspense wrapper needed for useSearchParams during static export.
export default function NewMonitorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-pulse rounded-xl bg-accent/20" />
        </div>
      }
    >
      <NewMonitorForm />
    </Suspense>
  );
}

function NewMonitorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { accountId, isConnected, connect, executeWithPayment } = useWallet();
  const { user, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [runningFirstCheck, setRunningFirstCheck] = useState(false);
  const [activationResult, setActivationResult] = useState<{
    signalId: string | null;
    conditionMet: boolean;
    isHeartbeat: boolean;
    summary: string | null;
    publicShareToken: string | null;
    metadata?: {
      checkMethod: 'tinyfish' | 'scraper-fallback';
      circuitOpen: boolean;
      githubCommitsFetched: number;
      confidence: number;
      confidenceThreshold: number;
      thresholdBlocked: boolean;
    };
  } | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ url?: string; conditionText?: string }>({});
  const [prefilled, setPrefilled] = useState(false);

  // Post-create funding
  const [topUpAmount, setTopUpAmount] = useState(10);
  const [toppingUp, setToppingUp] = useState(false);

  const [form, setForm] = useState({
    url: '',
    conditionText: '',
    frequencySeconds: 86400,
    actionType: 'alert' as 'alert' | 'trade',
    screenshotsEnabled: true,
    isPublic: true,
    confidenceThreshold: 50,
    tradeConfig: {
      pair: '',
      type: 'buy' as 'buy' | 'sell',
      ordertype: 'market',
      volume: '0.001',
    },
  });

  // Step 1 view state: choose-screen first, then edit-mode (template or scratch).
  const [mode, setMode] = useState<'choose' | 'template' | 'scratch'>('choose');
  const [activeCategory, setActiveCategory] = useState<Category>('code');
  const conditionRef = useRef<HTMLTextAreaElement | null>(null);

  // Pre-fill from URL params (template links from landing page)
  useEffect(() => {
    if (prefilled) return;
    const url = searchParams.get('url');
    const condition = searchParams.get('condition');
    const frequency = searchParams.get('frequency');
    if (url || condition) {
      setForm((f) => ({
        ...f,
        ...(url ? { url } : {}),
        ...(condition ? { conditionText: condition } : {}),
        ...(frequency ? { frequencySeconds: Number(frequency) } : {}),
      }));
      setPrefilled(true);
      setMode('template');
    }
  }, [searchParams, prefilled]);

  // Auto-focus the condition textarea when entering template edit mode,
  // so the edit affordance is obvious and the user's first interaction is a tweak.
  useEffect(() => {
    if (mode === 'template') {
      // Defer one frame so the textarea is mounted.
      const id = requestAnimationFrame(() => {
        conditionRef.current?.focus();
        conditionRef.current?.setSelectionRange(
          conditionRef.current.value.length,
          conditionRef.current.value.length,
        );
      });
      return () => cancelAnimationFrame(id);
    }
  }, [mode]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setError(null);
    if (k === 'url' || k === 'conditionText') {
      setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
    }
    setForm((f) => ({ ...f, [k]: v }));
  };

  // ── Deterministic social proof from hostname (no backend needed) ──
  const socialProof = useMemo(() => {
    const url = form.url.trim();
    if (!url.startsWith('http')) return null;
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return null;
    }
    // Simple hash for deterministic fake-but-consistent numbers
    let hash = 0;
    for (let i = 0; i < host.length; i++) {
      hash = ((hash << 5) - hash + host.charCodeAt(i)) | 0;
    }
    const watchers = 3 + (Math.abs(hash) % 47); // 3–49
    const signals = 1 + (Math.abs(hash >> 4) % 12); // 1–12
    return { host, watchers, signals };
  }, [form.url]);

  function validateTargetStep(): boolean {
    const nextErrors: typeof fieldErrors = {};
    const trimmedUrl = form.url.trim();
    const trimmedCondition = form.conditionText.trim();

    if (!trimmedUrl) {
      nextErrors.url = 'Enter a public URL to monitor.';
    } else {
      try {
        const parsed = new URL(trimmedUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          nextErrors.url = 'Use an http or https URL.';
        }
      } catch {
        nextErrors.url = 'Enter a valid URL, including https://.';
      }
    }

    if (!trimmedCondition) {
      nextErrors.conditionText = 'Describe the signal Sentinel should detect.';
    } else if (trimmedCondition.length < 12) {
      nextErrors.conditionText = 'Add a little more detail so the detector has a clear condition.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function goNext() {
    setError(null);
    if (step === 1 && !validateTargetStep()) return;
    setStep((s) => Math.min(4, s + 1));
  }

  const [createdMonitor, setCreatedMonitor] = useState<Monitor | null>(null);

  const publicProofUrl =
    activationResult?.signalId && activationResult.publicShareToken
      ? `/public/proof/${activationResult.signalId}?share=${encodeURIComponent(
          activationResult.publicShareToken,
        )}`
      : null;

  async function submit() {
    if (!user?.id) {
      setError('Connect your wallet and approve sign-in before creating a monitor.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const monitor = await api.createMonitor({
        userId: user.id,
        url: form.url,
        conditionText: form.conditionText,
        frequencySeconds: form.frequencySeconds,
        screenshotsEnabled: form.screenshotsEnabled,
        isPublic: form.isPublic,
        confidenceThreshold: form.confidenceThreshold,
      });
      // If trade mode selected, create the rule atomically so the loop is complete.
      if (form.actionType === 'trade' && form.tradeConfig.pair) {
        try {
          await api.createRule({
            monitorId: monitor.id,
            actionType: 'trade',
            actionConfig: {
              ...form.tradeConfig,
              validate: true, // paper mode by default
            },
            isActive: true,
          });
        } catch (ruleErr) {
          // Monitor is created; rule can be added later from /rules
          console.warn('Rule creation failed:', ruleErr);
        }
      }
      setCreatedMonitor(monitor);
      setActivationResult(null);
      setCopiedShareLink(false);
      setStep(5); // post-create engagement step
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-run first check when reaching step 5 for cinematic demo flow.
  useEffect(() => {
    if (step !== 5 || !createdMonitor || activationResult || runningFirstCheck) return;
    const t = setTimeout(() => {
      runFirstCheck();
    }, 800);
    return () => clearTimeout(t);
  }, [step, createdMonitor?.id]);

  async function runFirstCheck() {
    if (!createdMonitor) return;
    if (!isConnected) {
      toast.warn('Connect your Hedera wallet first.');
      await connect();
      return;
    }

    setRunningFirstCheck(true);
    setError(null);
    setActivationResult(null);
    setCopiedShareLink(false);
    toast.info(COPY.creation.firstCheck.running);

    try {
      const data = await api.firstCheck(createdMonitor.id);

      const nextResult = {
        signalId: data.signalId ?? null,
        conditionMet: Boolean(data.conditionMet),
        isHeartbeat: Boolean(data.isHeartbeat),
        summary: data.summary ?? null,
        publicShareToken: data.publicShareToken ?? null,
        metadata: data.metadata ?? undefined,
      };

      setActivationResult(nextResult);
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      queryClient.invalidateQueries({ queryKey: ['monitors'] });

      if (nextResult.conditionMet) {
        toast.success('Preview check found a match. Your monitor is ready to go.');
      } else {
        toast.info('Preview check complete. No match yet — your monitor will keep watching.');
      }
    } catch (e) {
      const raw = String(e);
      const msg = raw.toLowerCase();
      let message: string;
      if (msg.includes('timeout') || msg.includes('timed out')) {
        message = COPY.errors.timeout;
      } else if (msg.includes('tinyfish') || msg.includes('scraper')) {
        message =
          'The intelligence service had trouble reaching the target. A fallback check was attempted.';
      } else if (msg.includes('first_check_already_used')) {
        message = 'Preview already used. Use Check Now for subsequent checks.';
      } else {
        message = raw.startsWith('First check failed') ? raw : 'Preview check failed: ' + raw;
      }
      setError(message);
      toast.error(message);
    } finally {
      setRunningFirstCheck(false);
    }
  }

  async function copyPublicProofLink() {
    if (!publicProofUrl) return;
    const absoluteUrl = window.location.origin + publicProofUrl;
    await navigator.clipboard.writeText(absoluteUrl);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 1500);
    toast.success('Public proof link copied.');
  }

  async function topUp() {
    if (!createdMonitor || topUpAmount < 1) return;
    setToppingUp(true);
    try {
      const updated = await api.topUpMonitor(createdMonitor.id, topUpAmount);
      setCreatedMonitor(updated);
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
      toast.success(`Added ${topUpAmount} ℏ. Monitor is now funded.`);
      setTopUpAmount(10);
    } catch (e) {
      toast.error('Top-up failed: ' + String(e));
    } finally {
      setToppingUp(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">New Monitor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure the signal first, then connect your wallet to sign in and create it.
        </p>
      </div>

      <div className="mb-8 flex items-center justify-between">
        {STEP_META.map((s, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isDone = step > stepNum;
          return (
            <div key={s.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 ${
                    isDone
                      ? 'bg-signal/20 text-signal'
                      : isActive
                        ? 'bg-accent/20 text-accent shadow-glow-sm'
                        : 'bg-edge/40 text-slate-600'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                </div>
                <span
                  className={`text-[10px] font-semibold ${
                    isActive ? 'text-accent' : isDone ? 'text-signal' : 'text-slate-600'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEP_META.length - 1 && (
                <div className="mx-2 h-px flex-1">
                  <div
                    className={`h-full transition-colors ${isDone ? 'bg-signal/40' : 'bg-edge/40'}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card animate-slide-up">
        {step === 1 && mode === 'choose' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-accent/15 bg-accent/5 p-3">
              <p className="text-xs leading-relaxed text-slate-300">
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-accent" />
                <span className="font-semibold text-white">Most people start from a template</span>
                <span className="text-slate-400"> — every field stays editable.</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template category">
              {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
                const isActive = activeCategory === cat;
                const count = TEMPLATES.filter((t) => getCategoryForTemplate(t) === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                      isActive
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-edge/40 text-slate-400 hover:border-edge-light hover:text-slate-200'
                    }`}
                  >
                    {CATEGORY_META[cat].label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                        isActive ? 'bg-accent/20 text-accent' : 'bg-edge/40 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="-mt-2 text-[11px] text-slate-500">{CATEGORY_META[activeCategory].hint}</p>

            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.filter((t) => getCategoryForTemplate(t) === activeCategory).map((t) => {
                const popular = isPopular(t);
                return (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => {
                      setError(null);
                      setFieldErrors({});
                      setForm((f) => ({
                        ...f,
                        url: t.url,
                        conditionText: t.condition,
                        frequencySeconds: t.frequency,
                      }));
                      setPrefilled(true);
                      setMode('template');
                    }}
                    className={`group relative cursor-pointer rounded-xl border p-3 text-left transition-all ${
                      popular
                        ? 'border-accent/30 bg-accent/5 hover:border-accent/50'
                        : 'border-edge/40 hover:border-accent/30'
                    }`}
                  >
                    {popular && (
                      <span className="absolute -top-1.5 right-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink shadow-glow-sm">
                        <Sparkles className="h-2.5 w-2.5" />
                        Popular
                      </span>
                    )}
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.bg}`}
                      >
                        <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-200 group-hover:text-white">
                          {t.title}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                          {t.desc}
                        </p>
                        <p className="mt-1.5 text-[10px] italic text-slate-600 line-clamp-2">
                          &ldquo;{t.condition}&rdquo;
                        </p>
                      </div>
                      <ChevronRightIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setFieldErrors({});
                setMode('scratch');
              }}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-edge-light bg-transparent p-3 text-left transition-all hover:border-accent/40 hover:bg-accent/5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-edge-light text-slate-500 group-hover:border-accent/40 group-hover:text-accent">
                <Plus className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Start from scratch
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                  I&apos;ll describe my own target and condition
                </p>
              </div>
              <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          </div>
        )}

        {step === 1 && (mode === 'template' || mode === 'scratch') && (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => {
                setMode('choose');
                setError(null);
                setFieldErrors({});
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-accent"
            >
              <ChevronLeft className="h-3 w-3" />
              Back to templates
            </button>

            <div>
              <label htmlFor="url" className="label">
                <Globe className="mr-1 inline h-3 w-3" />
                Target URL
              </label>
              <input
                id="url"
                className={`input ${fieldErrors.url ? 'border-danger/60 focus:border-danger' : ''}`}
                placeholder="https://github.com/owner/repo/commits/main"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                aria-required="true"
                aria-invalid={!!fieldErrors.url}
                aria-describedby={fieldErrors.url ? 'url-error url-hint' : 'url-hint'}
              />
              <p id="url-hint" className="mt-1.5 text-[11px] text-slate-600">
                Any public URL — GitHub repos, docs pages, API endpoints, social feeds
              </p>
              {fieldErrors.url && (
                <p id="url-error" className="mt-1.5 text-[11px] font-medium text-danger">
                  {fieldErrors.url}
                </p>
              )}

              {/* ── Social proof — reduces perceived risk ── */}
              {socialProof && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent">
                    <Eye className="h-3 w-3" />
                    {COPY.socialProof.watchers(socialProof.watchers, socialProof.host)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-signal/10 px-2 py-1 text-[10px] font-medium text-signal">
                    <TrendingUp className="h-3 w-3" />
                    {COPY.socialProof.hourlySignals(socialProof.signals)}
                  </span>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="condition" className="label">
                <MessageSquare className="mr-1 inline h-3 w-3" />
                Detection condition
              </label>
              <textarea
                id="condition"
                ref={conditionRef}
                className={`input min-h-[120px] ${
                  fieldErrors.conditionText ? 'border-danger/60 focus:border-danger' : ''
                }`}
                placeholder="A new commit mentions security, vulnerability, fix, CVE, or verifying key change."
                value={form.conditionText}
                onChange={(e) => set('conditionText', e.target.value)}
                aria-required="true"
                aria-invalid={!!fieldErrors.conditionText}
                maxLength={500}
                aria-describedby={
                  fieldErrors.conditionText ? 'condition-error condition-hint' : 'condition-hint'
                }
              />
              <div className="mt-1.5 flex items-center justify-between">
                <p id="condition-hint" className="text-[11px] text-slate-600">
                  Describe in plain English what you want TinyFish to look for
                </p>
                <span className="text-[10px] text-slate-600">{form.conditionText.length}/500</span>
              </div>
              {fieldErrors.conditionText && (
                <p id="condition-error" className="mt-1.5 text-[11px] font-medium text-danger">
                  {fieldErrors.conditionText}
                </p>
              )}

              {mode === 'scratch' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Try:
                  </span>
                  {SCRATCH_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        const current = form.conditionText.trim();
                        const next = current ? `${current} ${ex}` : ex;
                        set('conditionText', next.slice(0, 500));
                        conditionRef.current?.focus();
                      }}
                      className="rounded-full border border-edge/40 bg-ink-light/40 px-2.5 py-1 text-[10px] text-slate-300 transition-all hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label htmlFor="frequency" className="label">
                <Clock className="mr-1 inline h-3 w-3" />
                Check frequency
              </label>
              <select
                id="frequency"
                className="input"
                value={form.frequencySeconds}
                onChange={(e) => set('frequencySeconds', Number(e.target.value))}
              >
                <option value={86400}>{COPY.creation.frequency(86400)}</option>
                <option value={21600}>{COPY.creation.frequency(21600)}</option>
                <option value={3600}>{COPY.creation.frequency(3600)}</option>
                <option value={900}>{COPY.creation.frequency(900)}</option>
                <option value={300}>{COPY.creation.frequency(300)}</option>
              </select>
            </div>

            {/* ── Signal Sensitivity ── */}
            <div className="rounded-xl border border-edge/40 bg-ink-light/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="label mb-0">
                  <SlidersHorizontal className="mr-1 inline h-3 w-3" />
                  {COPY.creation.sensitivity.label}
                </label>
                <span className="text-xs font-semibold text-accent tabular-nums">
                  {form.confidenceThreshold}/100
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.confidenceThreshold}
                onChange={(e) => set('confidenceThreshold', Number(e.target.value))}
                className="w-full accent-accent"
                aria-label="Confidence threshold"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Relaxed — more signals</span>
                <span>Balanced</span>
                <span>Strict — fewer signals</span>
              </div>
              <p className="text-[10px] text-slate-500">
                {form.confidenceThreshold >= 80
                  ? COPY.creation.sensitivity.strict
                  : form.confidenceThreshold >= 50
                    ? COPY.creation.sensitivity.balanced
                    : COPY.creation.sensitivity.relaxed}
              </p>
            </div>

            <div>
              <label className="label">
                <Zap className="mr-1 inline h-3 w-3" />
                Action type
              </label>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Action type">
                {(['alert', 'trade'] as const).map((t) => {
                  const active = form.actionType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set('actionType', t)}
                      className={`relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                        active
                          ? t === 'trade'
                            ? 'border-warn/40 bg-warn/5 shadow-glow-sm'
                            : 'border-accent/40 bg-accent/5 shadow-glow-sm'
                          : 'border-edge/40 hover:border-edge-light'
                      }`}
                    >
                      {t === 'trade' && (
                        <span
                          className={`absolute -top-1.5 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            active ? 'bg-warn text-ink' : 'bg-edge/40 text-slate-500'
                          }`}
                        >
                          Premium
                        </span>
                      )}
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          active
                            ? t === 'trade'
                              ? 'bg-warn/20 text-warn'
                              : 'bg-accent/20 text-accent'
                            : 'bg-edge/40 text-slate-500'
                        }`}
                      >
                        {t === 'alert' ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-semibold ${
                            active ? 'text-slate-200' : 'text-slate-400'
                          }`}
                        >
                          {t === 'alert' ? 'Alert only' : 'Trade execution'}
                        </p>
                        <p
                          className={`mt-0.5 text-[10px] leading-relaxed ${
                            active ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {t === 'alert'
                            ? 'Webhook, Telegram, or email. No exchange connection needed.'
                            : 'Auto-execute on Kraken when a signal triggers. Paper mode by default.'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {form.actionType === 'trade' && (
              <div className="space-y-3 rounded-xl border border-warn/20 bg-warn/5 p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-warn">
                  <Workflow className="h-3.5 w-3.5" />
                  Paper trade config
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500">Pair</label>
                    <input
                      className="input mt-1 font-mono text-xs"
                      placeholder="XBTUSD"
                      value={form.tradeConfig.pair}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tradeConfig: { ...f.tradeConfig, pair: e.target.value.toUpperCase() },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Direction</label>
                    <select
                      className="input mt-1"
                      value={form.tradeConfig.type}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tradeConfig: { ...f.tradeConfig, type: e.target.value as 'buy' | 'sell' },
                        }))
                      }
                    >
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Volume</label>
                    <input
                      className="input mt-1 font-mono text-xs"
                      placeholder="0.001"
                      value={form.tradeConfig.volume}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tradeConfig: { ...f.tradeConfig, volume: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Paper mode — no Kraken credentials required. Simulated $10K account, live prices.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-xl border border-edge/40 bg-ink-light/50 p-3">
              <input
                id="screenshots"
                type="checkbox"
                className="h-4 w-4 rounded border-edge bg-ink accent-accent"
                checked={form.screenshotsEnabled}
                onChange={(e) => set('screenshotsEnabled', e.target.checked)}
              />
              <label
                htmlFor="screenshots"
                className="flex items-center gap-2 text-sm text-slate-300"
              >
                <Camera className="h-3.5 w-3.5 text-slate-500" />
                Capture screenshots with each check
              </label>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-edge/40 bg-ink-light/50 p-3">
              <input
                id="private"
                type="checkbox"
                className="h-4 w-4 rounded border-edge bg-ink accent-accent"
                checked={!form.isPublic}
                onChange={(e) => set('isPublic', !e.target.checked)}
              />
              <label htmlFor="private" className="flex items-center gap-2 text-sm text-slate-300">
                <Lock className="h-3.5 w-3.5 text-slate-500" />
                Keep signals private
                <span className="text-[10px] text-accent">(premium — free during beta)</span>
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="stat-card p-4">
              {form.actionType === 'trade' ? (
                <p className="text-xs leading-relaxed text-slate-400">
                  <span className="font-semibold text-warn">Paper trade first.</span> Test with
                  simulated orders against live prices — no credentials required. When ready, paper
                  buys become real. Safety rails: cooldowns, max open orders, dead-man&apos;s
                  switch.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-400">
                  <span className="font-semibold text-accent">Notification only.</span> Add webhook,
                  Telegram, or email actions in the Rules builder after the monitor is created.
                </p>
              )}
            </div>
            <div>
              <label className="label">
                <Wallet className="mr-1 inline h-3 w-3" />
                Wallet connection
              </label>
              {isConnected && accountId && user?.id ? (
                <div className="stat-card flex items-center gap-3 p-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-signal/20">
                    <Check className="h-3.5 w-3.5 text-signal" />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <p className="shrink-0 text-xs font-medium text-signal">Signed in</p>
                    <p className="truncate font-mono text-[11px] text-slate-500">
                      {accountId.slice(0, 8)}…{accountId.slice(-4)}
                    </p>
                  </div>
                </div>
              ) : isConnected && accountId ? (
                <div className="stat-card flex items-center gap-3 border-warn/20 p-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warn/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-warn" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-warn">Sign-in pending</p>
                    <p className="truncate font-mono text-[11px] text-slate-500">
                      {accountId.slice(0, 8)}…{accountId.slice(-4)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={connect}
                    className="btn shrink-0 py-1.5 text-[11px]"
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <div className="stat-card flex items-center gap-3 p-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-edge/40">
                    <Wallet className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-300">Wallet required</p>
                    <p className="text-[11px] text-slate-500">
                      Connect to create and fund your monitor
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={connect}
                    className="btn-ghost shrink-0 py-1.5 text-[11px]"
                  >
                    Connect
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="stat-card divide-y divide-edge/40">
              <div className="pb-2">
                <p className="section-title">Review</p>
              </div>
              <div className="space-y-1.5 pt-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">URL</span>
                  <span className="max-w-[60%] truncate pl-4 text-slate-200">
                    {form.url || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Frequency</span>
                  <span className="text-slate-200">
                    {form.frequencySeconds >= 3600
                      ? `Every ${form.frequencySeconds / 3600}h`
                      : `Every ${form.frequencySeconds / 60}m`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Action</span>
                  <span className="text-slate-200">
                    {form.actionType === 'trade' && form.tradeConfig.pair
                      ? `${form.tradeConfig.type.toUpperCase()} ${form.tradeConfig.pair} @ ${form.tradeConfig.volume}`
                      : form.actionType === 'trade'
                        ? 'Trade (pair not set)'
                        : form.actionType}
                    {form.actionType === 'trade' && (
                      <span className="ml-1 text-[10px] text-slate-500">(paper)</span>
                    )}
                  </span>
                </div>
                {form.screenshotsEnabled && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Screenshots</span>
                    <span className="text-slate-200">On</span>
                  </div>
                )}
              </div>
            </div>

            {!user?.id && (
              <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20">
                  <Wallet className="h-3.5 w-3.5 text-accent" />
                </div>
                <p className="flex-1 text-xs text-slate-400">
                  <span className="font-medium text-slate-200">Wallet sign-in required</span>
                  {' — '}connect and approve before creation.
                </p>
                <button type="button" onClick={connect} className="btn shrink-0 py-1.5 text-[11px]">
                  {isConnected ? 'Approve' : 'Connect'}
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-danger" role="alert">
                <AlertTriangle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}
          </div>
        )}

        {step === 5 && createdMonitor && (
          <div className="space-y-6 animate-slide-up">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-signal/15">
                <Check className="h-7 w-7 text-signal" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Monitor created successfully</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Your monitor for {createdMonitor.url.replace(/^https?:\/\//, '').slice(0, 40)} is
                  ready.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="section-title">Activation loop</p>
                  <h3 className="text-base font-semibold text-white">
                    {COPY.creation.firstCheck.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-400">
                    {COPY.creation.firstCheck.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runFirstCheck}
                  disabled={runningFirstCheck}
                  className="btn shrink-0 text-xs"
                >
                  {runningFirstCheck ? (
                    'Analyzing…'
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-ink" />
                      {COPY.creation.firstCheck.cta}
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <ActivationStep label="Created" state="done" />
                <ActivationStep
                  label="Checked"
                  state={activationResult ? 'done' : runningFirstCheck ? 'active' : 'pending'}
                />
                <ActivationStep
                  label="Proof"
                  state={
                    activationResult?.conditionMet
                      ? 'done'
                      : runningFirstCheck
                        ? 'active'
                        : 'pending'
                  }
                />
                <ActivationStep
                  label="Share"
                  state={copiedShareLink ? 'done' : publicProofUrl ? 'active' : 'pending'}
                />
              </div>
            </div>

            {/* ── Monitor Health & Funding ── */}
            {createdMonitor && (
              <div className="card space-y-4">
                <div className="flex items-center gap-2">
                  <Battery
                    className={`h-4 w-4 ${Number(createdMonitor.hbar_balance) > 0 ? 'text-signal' : 'text-warn'}`}
                  />
                  <h3 className="section-title">Monitor Health & Funding</h3>
                </div>
                <PostCreateHealth monitor={createdMonitor} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="stat-card space-y-1 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <TrendingDown className="h-3 w-3" />
                      Cost per check
                    </div>
                    <p className="text-sm font-semibold text-slate-200">
                      {Number(createdMonitor.cost_per_check).toFixed(2)} ℏ
                    </p>
                  </div>
                  <div className="stat-card space-y-1 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <CalendarDays className="h-3 w-3" />
                      Check frequency
                    </div>
                    <p className="text-sm font-semibold text-slate-200">
                      {createdMonitor.frequency_seconds >= 3600
                        ? `Every ${(createdMonitor.frequency_seconds / 3600).toFixed(0)}h`
                        : `Every ${(createdMonitor.frequency_seconds / 60).toFixed(0)}m`}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-edge/40 bg-ink-light/30 p-3">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    Next scheduled check:{' '}
                    <span className="font-medium text-slate-300">
                      {createdMonitor.last_check_at
                        ? new Date(
                            new Date(createdMonitor.last_check_at).getTime() +
                              createdMonitor.frequency_seconds * 1000,
                          ).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'After preview check runs'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(Math.max(1, Number(e.target.value)))}
                    className="input w-24 text-xs py-2"
                    aria-label="Amount to stake in HBAR"
                  />
                  <span className="text-xs text-slate-500">ℏ</span>
                  <button
                    type="button"
                    onClick={topUp}
                    disabled={toppingUp}
                    className="btn text-xs"
                  >
                    {toppingUp ? (
                      'Adding…'
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        {COPY.monitor.actions.topUp}
                      </>
                    )}
                  </button>
                  <span className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500">
                    {Number(createdMonitor.hbar_balance) <= 0 ? (
                      <>
                        No funds staked — refill to activate scheduled checks
                        {(process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? 'testnet').toLowerCase() ===
                          'testnet' && (
                          <a
                            href="https://portal.hedera.com/faucet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-accent hover:underline"
                          >
                            Get free test HBAR
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </>
                    ) : Number(createdMonitor.hbar_balance) <
                      Number(createdMonitor.cost_per_check) * 5 ? (
                      `Low balance — ${topUpAmount} ℏ ${COPY.creation.topUp.checksEquivalent(topUpAmount, Number(createdMonitor.cost_per_check))}`
                    ) : (
                      `Funded — ${topUpAmount} ℏ ${COPY.creation.topUp.checksEquivalent(topUpAmount, Number(createdMonitor.cost_per_check))}`
                    )}
                  </span>
                </div>
              </div>
            )}

            {activationResult && (
              <div
                className={`stat-card space-y-4 p-4 ${
                  activationResult.conditionMet ? 'border-signal/30' : 'border-warn/25'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      activationResult.conditionMet
                        ? 'bg-signal/15 text-signal'
                        : 'bg-warn/15 text-warn'
                    }`}
                  >
                    {activationResult.conditionMet ? (
                      <Shield className="h-4 w-4" />
                    ) : (
                      <Info className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-200">
                      {activationResult.conditionMet
                        ? 'Match detected. Proof ready.'
                        : 'No match this time — that is expected.'}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {activationResult.summary ??
                        'The monitor ran successfully and will check again on schedule. You only get notified when the condition actually matches.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activationResult.signalId && (
                    <Link
                      href={`/signals/${activationResult.signalId}`}
                      className="btn-ghost text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Proof
                    </Link>
                  )}
                  {publicProofUrl && activationResult.conditionMet && (
                    <>
                      <Link href={publicProofUrl} className="btn-ghost text-xs">
                        <Shield className="h-3.5 w-3.5" />
                        Public Proof
                      </Link>
                      <button type="button" onClick={copyPublicProofLink} className="btn text-xs">
                        {copiedShareLink ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy Share Link
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="card space-y-3 border-danger/20 bg-danger/5" role="alert">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10">
                    <AlertTriangle className="h-5 w-5 text-danger" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-danger">Check failed</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-danger/80">{error}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={runFirstCheck}
                    disabled={runningFirstCheck}
                    className="btn-danger text-xs"
                  >
                    {runningFirstCheck ? (
                      'Retrying…'
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        Retry Check
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="btn-ghost text-xs text-slate-400"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* ── How we checked transparency ── */}
            {activationResult?.metadata && (
              <div className="card space-y-3">
                <p className="section-title">How we checked</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 text-xs">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/10">
                      <Check className="h-3 w-3 text-signal" />
                    </div>
                    <span className="text-slate-300">
                      {activationResult.metadata.githubCommitsFetched > 0
                        ? `GitHub API — fetched ${activationResult.metadata.githubCommitsFetched} new commit${activationResult.metadata.githubCommitsFetched === 1 ? '' : 's'}`
                        : 'GitHub API — no new commits since last check'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/10">
                      <Check className="h-3 w-3 text-signal" />
                    </div>
                    <span className="text-slate-300">
                      {activationResult.metadata.checkMethod === 'tinyfish'
                        ? 'TinyFish AI — analyzed commit messages against your condition'
                        : 'Keyword verification — matched condition keywords against page content'}
                    </span>
                  </div>
                  {activationResult.metadata.circuitOpen && (
                    <div className="flex items-center gap-2.5 text-xs">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warn/10">
                        <Info className="h-3 w-3 text-warn" />
                      </div>
                      <span className="text-slate-400">
                        TinyFish circuit was temporarily open — using scraper fallback
                      </span>
                    </div>
                  )}
                  {/* Confidence score */}
                  <div className="flex items-center gap-2.5 text-xs">
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        activationResult.metadata.confidence >=
                        activationResult.metadata.confidenceThreshold
                          ? 'bg-signal/10'
                          : 'bg-warn/10'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold ${
                          activationResult.metadata.confidence >=
                          activationResult.metadata.confidenceThreshold
                            ? 'text-signal'
                            : 'text-warn'
                        }`}
                      >
                        {activationResult.metadata.confidence}
                      </span>
                    </div>
                    <span className="text-slate-300">
                      Confidence score: {activationResult.metadata.confidence}/100
                      {activationResult.metadata.thresholdBlocked && (
                        <span className="text-warn">
                          {' '}
                          — below your threshold of {activationResult.metadata.confidenceThreshold}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Final outcome */}
                  <div className="flex items-center gap-2.5 text-xs">
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        activationResult.conditionMet ? 'bg-signal/10' : 'bg-warn/10'
                      }`}
                    >
                      {activationResult.conditionMet ? (
                        <Check className="h-3 w-3 text-signal" />
                      ) : (
                        <Info className="h-3 w-3 text-warn" />
                      )}
                    </div>
                    <span className="text-slate-300">
                      {activationResult.metadata.thresholdBlocked
                        ? `Condition matched but blocked — confidence ${activationResult.metadata.confidence} is below your ${activationResult.metadata.confidenceThreshold} threshold. Monitor continues checking.`
                        : activationResult.conditionMet
                          ? 'Condition matched — signal created and proof packaged'
                          : 'Condition not met — no signal this time. Monitor continues checking.'}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Next check:{' '}
                  {createdMonitor
                    ? `every ${
                        createdMonitor.frequency_seconds >= 3600
                          ? `${(createdMonitor.frequency_seconds / 3600).toFixed(0)}h`
                          : `${(createdMonitor.frequency_seconds / 60).toFixed(0)}m`
                      }`
                    : 'on schedule'}
                </p>
              </div>
            )}

            {/* ── Completion nudge — Zeigarnik effect ── */}
            {form.actionType !== 'trade' && (
              <div className="rounded-xl border border-warn/25 bg-warn/5 p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn/10">
                    <Workflow className="h-4 w-4 text-warn" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-200">
                      Setup incomplete — no auto-response configured
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Your monitor is watching, but nothing happens when a signal is detected. Add a
                      trade rule or alert to complete the loop.
                    </p>
                  </div>
                  <Link href="/rules" className="btn text-xs shrink-0">
                    <Zap className="h-3.5 w-3.5" />
                    Complete
                  </Link>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p className="section-title text-center">Keep momentum</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Link
                  href="/rules"
                  className="stat-card group flex cursor-pointer items-center gap-3 p-4 transition-all hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal/10 text-signal transition-transform group-hover:scale-110">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Add alert</p>
                    <p className="text-[10px] text-slate-500">Webhook, Telegram, or email</p>
                  </div>
                  <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-slate-600" />
                </Link>

                <Link
                  href="/signals"
                  className="stat-card group flex cursor-pointer items-center gap-3 p-4 transition-all hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10 text-violet transition-transform group-hover:scale-110">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">View signals</p>
                    <p className="text-[10px] text-slate-500">Timeline and proof chain</p>
                  </div>
                  <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-slate-600" />
                </Link>

                <Link
                  href="/"
                  className="stat-card group flex cursor-pointer items-center gap-3 p-4 transition-all hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn/10 text-warn transition-transform group-hover:scale-110">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Dashboard</p>
                    <p className="text-[10px] text-slate-500">Funding and monitor status</p>
                  </div>
                  <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-slate-600" />
                </Link>
              </div>
            </div>

            <div className="text-center">
              <button type="button" onClick={() => router.push('/')} className="btn text-xs">
                Go to Dashboard
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          {step < 5 && (
            <>
              <button
                type="button"
                className="btn-ghost"
                disabled={step === 1}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              {step < 4 ? (
                <button type="button" className="btn" onClick={goNext}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={submitting || authLoading || !user?.id}
                  onClick={submit}
                  title={!user?.id ? 'Connect your wallet and approve sign-in first' : undefined}
                >
                  {submitting ? 'Creating…' : authLoading ? 'Checking sign-in…' : 'Create Monitor'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivationStep({ label, state }: { label: string; state: 'done' | 'active' | 'pending' }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-center text-[10px] font-semibold transition-colors ${
        state === 'done'
          ? 'border-signal/30 bg-signal/10 text-signal'
          : state === 'active'
            ? 'border-accent/30 bg-accent/10 text-accent'
            : 'border-edge/40 bg-ink/30 text-slate-600'
      }`}
    >
      {label}
    </div>
  );
}

function PostCreateHealth({ monitor }: { monitor: Monitor }) {
  const bal = Number(monitor.hbar_balance);
  const cost = Number(monitor.cost_per_check);
  const checksRemaining = cost > 0 ? Math.floor(bal / cost) : 0;
  const canRun = checksRemaining > 0;
  const pct = Math.min(100, Math.max(0, checksRemaining > 20 ? 100 : (checksRemaining / 20) * 100));

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-4">
        <div>
          <p className="text-[10px] text-slate-500">Checks remaining</p>
          <p className={`text-2xl font-bold tabular-nums ${canRun ? 'text-signal' : 'text-warn'}`}>
            {checksRemaining}
          </p>
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-slate-500">Cost per check</p>
          <p className="text-sm font-semibold text-slate-200">{cost.toFixed(2)} ℏ</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500">Balance</p>
          <p className={`text-2xl font-bold tabular-nums ${bal > 0 ? 'text-signal' : 'text-warn'}`}>
            {bal.toFixed(1)} ℏ
          </p>
        </div>
      </div>

      {/* Checks bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-edge/40">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 50 ? 'bg-signal' : pct > 20 ? 'bg-warn' : 'bg-danger'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!canRun && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/20 bg-warn/5 p-2.5 text-xs text-warn">
          <BatteryWarning className="h-4 w-4 shrink-0" />
          <span>{COPY.monitor.inactive(0)}</span>
        </div>
      )}
      {canRun && checksRemaining < 5 && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/20 bg-warn/5 p-2.5 text-xs text-warn">
          <BatteryWarning className="h-4 w-4 shrink-0" />
          <span>{COPY.monitor.lowBalance(checksRemaining)}</span>
        </div>
      )}
      {canRun && checksRemaining >= 5 && (
        <div className="flex items-center gap-2 rounded-lg border border-signal/20 bg-signal/5 p-2.5 text-xs text-signal">
          <Check className="h-4 w-4 shrink-0" />
          <span>{COPY.monitor.checksRemaining(checksRemaining)} — monitor is active.</span>
        </div>
      )}
    </div>
  );
}
