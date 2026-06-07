'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
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
} from 'lucide-react';

const STEP_META = [
  { icon: Globe, label: 'Target' },
  { icon: Clock, label: 'Schedule' },
  { icon: Zap, label: 'Connect' },
  { icon: Wallet, label: 'Stake' },
];

// Multi-step Create Monitor flow.
export default function NewMonitorPage() {
  const router = useRouter();
  const { accountId, isConnected } = useWallet();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');

  const [form, setForm] = useState({
    url: '',
    conditionText: '',
    frequencySeconds: 3600,
    actionType: 'alert' as 'alert' | 'trade',
    stakeHbar: 10,
    screenshotsEnabled: true,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // WalletConnect auto-logins with Ed25519 signature proof on connect.
  // We just watch for the JWT token to infer user state.
  useEffect(() => {
    if (isConnected && accountId && !userId) {
      // Token is already set by WalletConnect; extract user ID from JWT payload
      const token = localStorage.getItem('lenitnes_token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserId(payload.sub as string);
        } catch {
          setError('Invalid session. Please reconnect your wallet.');
        }
      }
    }
  }, [isConnected, accountId, userId]);

  async function submit() {
    if (!userId) {
      setError('Connect your wallet first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const monitor = await api.createMonitor({
        userId,
        url: form.url,
        conditionText: form.conditionText,
        frequencySeconds: form.frequencySeconds,
        stakeHbar: form.stakeHbar,
        screenshotsEnabled: form.screenshotsEnabled,
      });
      router.push(`/`);
      void monitor;
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
          Set up AI-powered detection for market signals
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
                className="input"
                placeholder="https://github.com/owner/repo/commits/main"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                aria-required="true"
              />
              <p className="mt-1.5 text-[11px] text-slate-600">
                Any public URL — GitHub repos, docs pages, API endpoints, social feeds
              </p>
            </div>
            <div>
              <label htmlFor="condition" className="label">
                <MessageSquare className="mr-1 inline h-3 w-3" />
                Detection condition
              </label>
              <textarea
                id="condition"
                className="input min-h-[120px]"
                placeholder="A new commit mentions security, vulnerability, fix, CVE, or verifying key change."
                value={form.conditionText}
                onChange={(e) => set('conditionText', e.target.value)}
                aria-required="true"
                maxLength={500}
                aria-describedby="condition-hint"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <p id="condition-hint" className="text-[11px] text-slate-600">
                  Describe in plain English what you want TinyFish to look for
                </p>
                <span className="text-[10px] text-slate-600">{form.conditionText.length}/500</span>
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
              {isConnected && accountId ? (
                <div className="stat-card flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal/20">
                    <Check className="h-4 w-4 text-signal" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">Connected</p>
                    <p className="font-mono text-xs text-slate-500">
                      {accountId.slice(0, 8)}…{accountId.slice(-4)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="stat-card flex items-center gap-3 border-danger/20 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/20">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-danger">Wallet Required</p>
                    <p className="text-xs text-slate-500">
                      Connect via the header button to proceed
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label htmlFor="stake" className="label">
                <Wallet className="mr-1 inline h-3 w-3" />
                Stake HBAR
              </label>
              <div className="relative">
                <input
                  id="stake"
                  type="number"
                  className="input pr-12"
                  value={form.stakeHbar}
                  onChange={(e) => set('stakeHbar', Number(e.target.value))}
                  aria-describedby="stake-hint"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                  ℏ
                </span>
              </div>
              <p id="stake-hint" className="mt-1.5 text-[11px] text-slate-600">
                Funds the escrow for background checks. On-demand execution uses x402 micropayments.
              </p>
            </div>

            <div className="stat-card space-y-3 p-5">
              <p className="section-title">Summary</p>
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
                <div className="flex justify-between">
                  <span className="text-slate-500">Stake</span>
                  <span className="font-semibold text-accent">{form.stakeHbar} ℏ</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-danger" role="alert">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex justify-between">
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
            <button type="button" className="btn" onClick={() => setStep((s) => s + 1)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" className="btn" disabled={submitting} onClick={submit}>
              {submitting ? 'Creating…' : 'Stake & Create'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
