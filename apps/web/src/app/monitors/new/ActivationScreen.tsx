'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Battery,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Info,
  Play,
  Plus,
  Shield,
  Sparkles,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { api, type Monitor } from '@/lib/api';
import { useWallet } from '@/components/WalletConnect';
import { useToast } from '@/components/Toast';
import { COPY } from '@/lib/copy';

/**
 * Post-create activation screen shown after a monitor is successfully
 * created. Runs a free preview check, surfaces a public proof link if
 * the preview found a match, and lets the user top up their escrow to
 * start scheduled checks.
 *
 * Extracted from `monitors/new/page.tsx` to keep that file under 1100
 * lines. The full step is ~500 lines and has a single responsibility
 * ("celebrate the new monitor and let the user activate it"), which
 * makes it a natural unit.
 */

interface ActivationResult {
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
}

interface ActivationScreenProps {
  monitor: Monitor;
  activationResult: ActivationResult | null;
  runningFirstCheck: boolean;
  onRunFirstCheck: () => void;
  onCreateAnother: () => void;
}

export function ActivationScreen({
  monitor,
  activationResult,
  runningFirstCheck,
  onRunFirstCheck,
  onCreateAnother,
}: ActivationScreenProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isConnected, connect } = useWallet();
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(10);
  const [toppingUp, setToppingUp] = useState(false);

  const publicProofUrl =
    activationResult?.signalId && activationResult.publicShareToken
      ? `/public/proof/${activationResult.signalId}?share=${encodeURIComponent(
          activationResult.publicShareToken,
        )}`
      : null;

  async function copyPublicProofLink() {
    if (!publicProofUrl) return;
    const absoluteUrl = window.location.origin + publicProofUrl;
    await navigator.clipboard.writeText(absoluteUrl);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 1500);
    toast.success('Public proof link copied.');
  }

  async function topUp() {
    if (topUpAmount < 1) return;
    setToppingUp(true);
    try {
      const updated = await api.topUpMonitor(monitor.id, topUpAmount);
      // We don't pass `setCreatedMonitor` back; instead we rely on the
      // parent's query invalidation to refresh the monitor. The
      // caller of this component is responsible for updating its own
      // monitor state if needed.
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
      // Notify via a custom event so the parent can update if it wants.
      window.dispatchEvent(
        new CustomEvent('monitor-topped-up', { detail: { id: monitor.id, monitor: updated } }),
      );
      toast.success(`Added ${topUpAmount} ℏ. Monitor is now funded.`);
      setTopUpAmount(10);
    } catch (e) {
      toast.error('Top-up failed: ' + String(e));
    } finally {
      setToppingUp(false);
    }
  }

  async function ensureWallet() {
    if (!isConnected) {
      toast.warn('Connect your Hedera wallet first.');
      await connect();
    }
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* ── Success header ── */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-signal/15">
          <Check className="h-7 w-7 text-signal" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Monitor created successfully</h2>
          <p className="mt-1 text-sm text-slate-400">
            Your monitor for {monitor.url.replace(/^https?:\/\//, '').slice(0, 40)} is ready.
          </p>
        </div>
      </div>

      {/* ── Free preview check ── */}
      <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="section-title">Activation loop</p>
            <h3 className="text-base font-semibold text-white">{COPY.creation.firstCheck.title}</h3>
            <p className="text-xs leading-relaxed text-slate-400">
              {COPY.creation.firstCheck.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await ensureWallet();
              onRunFirstCheck();
            }}
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
              activationResult?.conditionMet ? 'done' : runningFirstCheck ? 'active' : 'pending'
            }
          />
          <ActivationStep
            label="Share"
            state={copiedShareLink ? 'done' : publicProofUrl ? 'active' : 'pending'}
          />
        </div>
      </div>

      {/* ── Health & funding ── */}
      <HealthAndFunding
        monitor={monitor}
        topUpAmount={topUpAmount}
        toppingUp={toppingUp}
        onTopUpAmountChange={setTopUpAmount}
        onTopUp={topUp}
      />

      {/* ── Preview result ── */}
      {activationResult && <PreviewResult result={activationResult} />}

      {/* ── Public proof link ── */}
      {publicProofUrl && (
        <div
          className={`rounded-2xl border p-4 ${
            activationResult?.conditionMet
              ? 'border-signal/30 bg-signal/5'
              : 'border-warn/20 bg-warn/5'
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Sparkles
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  activationResult?.conditionMet ? 'text-signal' : 'text-warn'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-200">
                  {activationResult?.conditionMet
                    ? 'Preview found a match — share your proof'
                    : 'No match yet — keep watching'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activationResult?.conditionMet
                    ? 'Your public proof is live. Anyone with the link can verify the full chain.'
                    : 'Your monitor is armed. The next scheduled check will run automatically.'}
                </p>
              </div>
            </div>
            <button type="button" onClick={copyPublicProofLink} className="btn shrink-0 text-xs">
              {copiedShareLink ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy public link
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Next-steps card ── */}
      <div className="card space-y-2 p-4">
        <p className="section-title">Next steps</p>
        <ul className="space-y-2 text-xs text-slate-300">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
            Fund your monitor above to start scheduled background checks.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
            <Link href="/rules" className="text-accent hover:underline">
              Connect a rule
            </Link>{' '}
            to fire a webhook, Telegram alert, or Kraken trade when a signal lands.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
            Visit your{' '}
            <Link href="/" className="text-accent hover:underline">
              dashboard
            </Link>{' '}
            to see all monitors and signal activity at a glance.
          </li>
        </ul>
        <div className="pt-2">
          <button type="button" onClick={onCreateAnother} className="btn-ghost text-xs">
            <Plus className="h-3.5 w-3.5" />
            Create another monitor
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function ActivationStep({ label, state }: { label: string; state: 'done' | 'active' | 'pending' }) {
  const colors = {
    done: 'border-signal/30 bg-signal/10 text-signal',
    active: 'border-accent/30 bg-accent/10 text-accent',
    pending: 'border-edge/40 bg-edge/30 text-slate-500',
  } as const;
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 text-center text-[10px] font-semibold ${colors[state]}`}
    >
      {label}
    </div>
  );
}

function HealthAndFunding({
  monitor,
  topUpAmount,
  toppingUp,
  onTopUpAmountChange,
  onTopUp,
}: {
  monitor: Monitor;
  topUpAmount: number;
  toppingUp: boolean;
  onTopUpAmountChange: (n: number) => void;
  onTopUp: () => void;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Battery
          className={`h-4 w-4 ${Number(monitor.hbar_balance) > 0 ? 'text-signal' : 'text-warn'}`}
        />
        <h3 className="section-title">Monitor Health & Funding</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="stat-card space-y-1 p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <TrendingDown className="h-3 w-3" />
            Cost per check
          </div>
          <p className="text-sm font-semibold text-slate-200">
            {Number(monitor.cost_per_check).toFixed(2)} ℏ
          </p>
        </div>
        <div className="stat-card space-y-1 p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <CalendarDays className="h-3 w-3" />
            Check frequency
          </div>
          <p className="text-sm font-semibold text-slate-200">
            {monitor.frequency_seconds >= 3600
              ? `Every ${(monitor.frequency_seconds / 3600).toFixed(0)}h`
              : `Every ${(monitor.frequency_seconds / 60).toFixed(0)}m`}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-edge/40 bg-ink-light/30 p-3">
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <CalendarDays className="h-3 w-3" />
          Next scheduled check:{' '}
          <span className="font-medium text-slate-300">
            {monitor.last_check_at
              ? new Date(
                  new Date(monitor.last_check_at).getTime() + monitor.frequency_seconds * 1000,
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
          onChange={(e) => onTopUpAmountChange(Math.max(1, Number(e.target.value)))}
          className="input w-24 text-xs py-2"
          aria-label="Amount to stake in HBAR"
        />
        <span className="text-xs text-slate-500">ℏ</span>
        <button type="button" onClick={onTopUp} disabled={toppingUp} className="btn text-xs">
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
          {Number(monitor.hbar_balance) <= 0 ? (
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
          ) : Number(monitor.hbar_balance) < Number(monitor.cost_per_check) * 5 ? (
            `Low balance — ${topUpAmount} ℏ ${COPY.creation.topUp.checksEquivalent(topUpAmount, Number(monitor.cost_per_check))}`
          ) : (
            `Funded — ${topUpAmount} ℏ ${COPY.creation.topUp.checksEquivalent(topUpAmount, Number(monitor.cost_per_check))}`
          )}
        </span>
      </div>
    </div>
  );
}

function PreviewResult({ result }: { result: ActivationResult }) {
  return (
    <div
      className={`stat-card space-y-4 p-4 ${
        result.conditionMet ? 'border-signal/30' : 'border-warn/25'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            result.conditionMet ? 'bg-signal/15 text-signal' : 'bg-warn/15 text-warn'
          }`}
        >
          {result.conditionMet ? <Shield className="h-4 w-4" /> : <Info className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-200">
            {result.conditionMet ? 'Match found' : 'No match'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{result.summary}</p>
          {result.metadata && (
            <p className="mt-1 text-[10px] text-slate-600">
              via {result.metadata.checkMethod}
              {result.metadata.circuitOpen && ' (circuit-open fallback)'}
              {result.metadata.githubCommitsFetched > 0 &&
                ` · ${result.metadata.githubCommitsFetched} commits reviewed`}
            </p>
          )}
        </div>
        <Wallet className="h-3.5 w-3.5 text-slate-600" />
      </div>
    </div>
  );
}
