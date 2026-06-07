'use client';

import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Shield,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Eye,
  Link as LinkIcon,
  Zap,
  Image as ImageIcon,
} from 'lucide-react';

// Public-facing proof explorer for a single signal.
export default function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [signal, setSignal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getSignal(id)
      .then(setSignal)
      .catch((e) => setError(String(e)));
  }, [id]);

  function shareProof() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error)
    return (
      <div className="card border-danger/30 bg-danger/5 text-danger">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5" />
          <span>{error}</span>
        </div>
      </div>
    );

  if (!signal)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-pulse rounded-xl bg-accent/20" />
          <p className="text-sm text-slate-500">Loading proof package…</p>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Signal Proof</h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable detection record with cryptographic verification
          </p>
        </div>
        <button className="btn-ghost text-xs" onClick={shareProof}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-signal" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Share Proof
            </>
          )}
        </button>
      </div>

      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row
            icon={Clock}
            label="Detected at"
            value={new Date(signal.detected_at).toLocaleString()}
          />
          <Row icon={Eye} label="TinyFish run" value={signal.tinyfish_run_id ?? '—'} mono />
        </div>
        <div className="border-t border-edge/40 pt-4">
          <Row icon={Eye} label="Condition" value={signal.monitor?.condition_text ?? '—'} />
        </div>
        <div className="border-t border-edge/40 pt-4">
          <Row icon={Zap} label="Summary" value={signal.condition_summary ?? '—'} />
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-signal" />
          Proof Chain
        </h2>
        <div className="space-y-3">
          <ProofLink
            icon={Shield}
            label="Hedera Consensus (HashScan)"
            href={signal.proof?.hashscanUrl}
            color="text-signal"
          />
          <ProofLink
            icon={LinkIcon}
            label="Grove proof package"
            href={signal.proof?.ipfsUrl}
            color="text-cyan-400"
          />
        </div>
      </div>

      {signal.evidence_text && (
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-accent" />
            Evidence
          </h2>
          <pre className="overflow-auto whitespace-pre-wrap rounded-xl bg-ink-light/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
            {signal.evidence_text}
          </pre>
        </div>
      )}

      {Array.isArray(signal.screenshot_urls) && signal.screenshot_urls.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <ImageIcon className="h-3.5 w-3.5 text-accent" />
            Screenshots
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {signal.screenshot_urls.map((src: string, i: number) => (
              <img
                key={i}
                src={src}
                alt={`screenshot ${i + 1}`}
                className="rounded-xl border border-edge/40 shadow-card transition-shadow hover:shadow-card-hover"
              />
            ))}
          </div>
        </div>
      )}

      {Array.isArray(signal.orders) && signal.orders.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-warn" />
            Kraken Orders
          </h2>
          <div className="space-y-2">
            {signal.orders.map((o: any) => (
              <div key={o.id} className="stat-card flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-mono text-xs text-slate-300">{o.kraken_order_id ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">Order ID</p>
                </div>
                <span
                  className={`badge ${
                    o.status === 'placed'
                      ? 'bg-signal/15 text-signal'
                      : o.status === 'failed'
                        ? 'bg-danger/15 text-danger'
                        : 'bg-slate-500/15 text-slate-400'
                  }`}
                >
                  {o.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="section-title flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={`text-sm text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function ProofLink({
  icon: Icon,
  label,
  href,
  color,
}: {
  icon: typeof Shield;
  label: string;
  href: string | null;
  color: string;
}) {
  return (
    <div className="stat-card flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-glow"
        >
          Verify
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-xs text-slate-600">pending</span>
      )}
    </div>
  );
}
