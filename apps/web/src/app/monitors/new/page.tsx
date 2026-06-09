'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
import { useAuth } from '@/lib/useAuth';
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
} from 'lucide-react';

import { TEMPLATES } from '@/data/templates';

const STEP_META = [
  { icon: Globe, label: 'Target' },
  { icon: Clock, label: 'Schedule' },
  { icon: Zap, label: 'Connect' },
  { icon: Wallet, label: 'Review' },
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
  const { accountId, isConnected, connect } = useWallet();
  const { user, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ url?: string; conditionText?: string }>({});
  const [prefilled, setPrefilled] = useState(false);

  const [form, setForm] = useState({
    url: '',
    conditionText: '',
    frequencySeconds: 3600,
    actionType: 'alert' as 'alert' | 'trade',
    screenshotsEnabled: true,
  });

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
    }
  }, [searchParams, prefilled]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setError(null);
    if (k === 'url' || k === 'conditionText') {
      setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
    }
    setForm((f) => ({ ...f, [k]: v }));
  };

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
      });
      setCreatedMonitor(monitor);
      setStep(5); // post-create engagement step
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
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
        {step === 1 && (
          <div className="space-y-5">
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
            </div>
            <div>
              <label htmlFor="condition" className="label">
                <MessageSquare className="mr-1 inline h-3 w-3" />
                Detection condition
              </label>
              <textarea
                id="condition"
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
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-semibold text-slate-300">
                  Need inspiration? Pick a template
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEMPLATES.map((t) => {
                  const isActive = form.url === t.url && form.conditionText === t.condition;
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
                      }}
                      className={`group cursor-pointer rounded-xl border p-3 text-left transition-all ${
                        isActive
                          ? 'border-accent/40 bg-accent/5 shadow-glow-sm'
                          : 'border-edge/40 hover:border-accent/30'
                      }`}
                    >
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
                <option value={300}>Every 5 minutes</option>
                <option value={900}>Every 15 minutes</option>
                <option value={3600}>Every hour</option>
                <option value={21600}>Every 6 hours</option>
                <option value={86400}>Daily</option>
              </select>
            </div>
            <div>
              <label className="label">
                <Zap className="mr-1 inline h-3 w-3" />
                Action type
              </label>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Action type">
                {(['alert', 'trade'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={form.actionType === t}
                    onClick={() => set('actionType', t)}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                      form.actionType === t
                        ? 'border-accent/40 bg-accent/5 shadow-glow-sm'
                        : 'border-edge hover:border-edge-light'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        form.actionType === t
                          ? 'bg-accent/20 text-accent'
                          : 'bg-edge/40 text-slate-500'
                      }`}
                    >
                      {t === 'alert' ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        {t === 'alert' ? 'Alert only' : 'Trade execution'}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {t === 'alert' ? 'Webhook, Telegram, email' : 'Auto-execute on Kraken'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
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
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="stat-card p-5">
              {form.actionType === 'trade' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-200">Trade Execution</p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Connect your Kraken API key in the Rules builder after creating the monitor.
                    Keys are stored encrypted (AES-256-GCM).
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-200">Alert Mode</p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Add webhook, Telegram, or email actions in the Rules builder after creation.
                  </p>
                </div>
              )}
            </div>
            <div>
              <label className="label">
                <Wallet className="mr-1 inline h-3 w-3" />
                Wallet connection
              </label>
              {isConnected && accountId && user?.id ? (
                <div className="stat-card flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal/20">
                    <Check className="h-4 w-4 text-signal" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">Connected and signed in</p>
                    <p className="font-mono text-xs text-slate-500">
                      {accountId.slice(0, 8)}…{accountId.slice(-4)}
                    </p>
                  </div>
                </div>
              ) : isConnected && accountId ? (
                <div className="stat-card flex items-center gap-3 border-warn/20 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warn/20">
                    <AlertTriangle className="h-4 w-4 text-warn" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-warn">
                      Wallet connected, sign-in needed
                    </p>
                    <p className="font-mono text-xs text-slate-500">
                      {accountId.slice(0, 8)}…{accountId.slice(-4)}
                    </p>
                  </div>
                  <button type="button" onClick={connect} className="btn shrink-0 py-2 text-xs">
                    Approve Sign-In
                  </button>
                </div>
              ) : (
                <div className="stat-card flex items-center gap-3 border-danger/20 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/20">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-danger">Wallet Required</p>
                    <p className="text-xs text-slate-500">
                      Connect your Hedera wallet to create a monitor
                    </p>
                  </div>
                  <button type="button" onClick={connect} className="btn shrink-0 py-2 text-xs">
                    Connect
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="stat-card space-y-3 p-5">
              <p className="section-title">Review</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">URL</span>
                  <span className="truncate pl-4 text-slate-200">{form.url || '—'}</span>
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
                  <span className="text-slate-200">{form.actionType}</span>
                </div>
              </div>
            </div>

            {!user?.id && (
              <div className="stat-card flex items-center gap-3 border-accent/20 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                  <Wallet className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">Wallet sign-in required</p>
                  <p className="text-xs text-slate-500">
                    Connect your Hedera wallet and approve the sign-in request before creation.
                  </p>
                </div>
                <button type="button" onClick={connect} className="btn-ghost shrink-0 py-2 text-xs">
                  {isConnected ? 'Approve' : 'Connect'}
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-danger" role="alert">
                <AlertTriangle className="h-4 w-4" />
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

            <div className="space-y-3">
              <p className="section-title text-center">Next steps</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Run first check */}
                <Link
                  href={'/'}
                  className="stat-card group flex cursor-pointer items-center gap-3 p-4 transition-all hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-transform group-hover:scale-110">
                    <Play className="h-4 w-4 fill-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Run first check</p>
                    <p className="text-[10px] text-slate-500">Execute an on-demand check now</p>
                  </div>
                  <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-slate-600" />
                </Link>

                {/* Fund monitor */}
                <Link
                  href={'/'}
                  className="stat-card group flex cursor-pointer items-center gap-3 p-4 transition-all hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn/10 text-warn transition-transform group-hover:scale-110">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Fund monitor</p>
                    <p className="text-[10px] text-slate-500">Stake HBAR for scheduled checks</p>
                  </div>
                  <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-slate-600" />
                </Link>

                {/* Add alert channel */}
                <Link
                  href={'/rules'}
                  className="stat-card group flex cursor-pointer items-center gap-3 p-4 transition-all hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal/10 text-signal transition-transform group-hover:scale-110">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Add alert channel</p>
                    <p className="text-[10px] text-slate-500">Webhook, Telegram, or email action</p>
                  </div>
                  <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-slate-600" />
                </Link>

                {/* Share proof */}
                <Link
                  href={'/'}
                  className="stat-card group flex cursor-pointer items-center gap-3 p-4 transition-all hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10 text-violet transition-transform group-hover:scale-110">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">View signals</p>
                    <p className="text-[10px] text-slate-500">
                      Monitor signal timeline and proof chain
                    </p>
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
