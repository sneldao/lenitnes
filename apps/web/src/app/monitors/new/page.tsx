'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';

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
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (isConnected && accountId && !userId) {
      api
        .login(accountId)
        .then((data) => setUserId(data.user.id))
        .catch((e) => {
          console.error('Auth failed:', e);
          setError('Wallet auth failed. Please try again.');
        });
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
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">New Monitor</h1>
      <p className="mb-6 text-sm text-slate-400">Step {step} of 4</p>

      <div className="card">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="label">Target URL</label>
              <input
                className="input"
                placeholder="https://github.com/owner/repo/commits/main"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Condition (plain English)</label>
              <textarea
                className="input min-h-[100px]"
                placeholder="A new commit mentions security, vulnerability, fix, CVE, or verifying key change."
                value={form.conditionText}
                onChange={(e) => set('conditionText', e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="label">Check frequency</label>
              <select
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
              <label className="label">Action type</label>
              <div className="flex gap-3">
                {(['alert', 'trade'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('actionType', t)}
                    className={form.actionType === t ? 'btn' : 'btn-ghost'}
                  >
                    {t === 'alert' ? 'Alert only' : 'Trade execution'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {form.actionType === 'trade' ? (
              <p className="text-sm text-slate-400">
                Connect your Kraken API key in the Rules builder after creating the monitor. Keys
                are stored encrypted (AES-256-GCM).
              </p>
            ) : (
              <p className="text-sm text-slate-400">
                Alert-only monitor. Add webhook / Telegram / email actions in the Rules builder.
              </p>
            )}
            <div>
              <label className="label">Wallet</label>
              {isConnected && accountId ? (
                <p className="text-sm text-slate-200">
                  Connected: {accountId.slice(0, 8)}…{accountId.slice(-4)}
                </p>
              ) : (
                <p className="text-sm text-danger">
                  Connect your wallet via the header button to proceed.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="label">Stake HBAR</label>
              <input
                type="number"
                className="input"
                value={form.stakeHbar}
                onChange={(e) => set('stakeHbar', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-slate-500">
                Funds the escrow for background checks. On-demand execution uses x402 micropayments.
              </p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            className="btn-ghost"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            Back
          </button>
          {step < 4 ? (
            <button type="button" className="btn" onClick={() => setStep((s) => s + 1)}>
              Next
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
