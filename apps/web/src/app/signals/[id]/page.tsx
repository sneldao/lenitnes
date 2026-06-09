'use client';

import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Shield,
  Clock,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Eye,
  Link as LinkIcon,
  Zap,
  Image as ImageIcon,
  Printer,
  FileCheck2,
  Globe,
  Hash,
  Fingerprint,
  X,
  Loader2,
  Info,
  AlertTriangle,
} from 'lucide-react';
import ProofChain from '@/components/ProofChain';
import { getProofChainSteps } from '@/lib/proof-chain';

// Public-facing proof explorer for a single signal.
// Supports both authenticated (private) and public (shareable) modes.
export default function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPublic = pathname.startsWith('/public/proof');
  const shareToken = searchParams.get('share') ?? undefined;

  const [copied, setCopied] = useState<'link' | 'receipt' | 'cid' | 'hash' | null>(null);

  const queryKey = isPublic ? ['public-proof', id] : ['signal', id];
  const queryFn = isPublic ? () => api.getPublicProof(id, shareToken) : () => api.getSignal(id);

  const {
    data: signal,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn,
    retry: 1,
  });

  const proofId = useMemo(() => 'LEN-' + id.slice(0, 8).toUpperCase(), [id]);
  const publicUrl = useMemo(() => {
    const base =
      (typeof window !== 'undefined' ? window.location.origin : '') + '/public/proof/' + id;
    const token = signal?.public_share_token ?? shareToken;
    return token ? `${base}?share=${encodeURIComponent(token)}` : base;
  }, [id, shareToken, signal?.public_share_token]);

  const twitterText = useMemo(() => {
    const summary = signal?.condition_summary ?? 'Signal detected';
    const target = signal?.monitor?.url ?? 'a web signal';
    return encodeURIComponent(
      '\u{1F6E1}\uFE0F LENITNES proof: "' +
        summary +
        '" detected on ' +
        target +
        '\n\nVerify the full proof chain:',
    );
  }, [signal]);

  const receiptText = useMemo(() => {
    if (!signal) return '';
    return [
      'LENITNES proof receipt: ' + proofId,
      'Detected: ' + new Date(signal.detected_at).toISOString(),
      'Target: ' + (signal.monitor?.url ?? 'unknown'),
      'Condition: ' + (signal.monitor?.condition_text ?? 'unknown'),
      'Summary: ' + (signal.condition_summary ?? 'Signal detected'),
      'Hedera: ' + (signal.proof?.hashscanUrl ?? 'pending'),
      'Grove: ' + (signal.proof?.ipfsUrl ?? 'pending'),
      'Receipt URL: ' + publicUrl,
    ].join('\n');
  }, [proofId, signal, publicUrl]);

  function copyToClipboard(kind: 'link' | 'receipt') {
    const value = kind === 'link' ? publicUrl : receiptText;
    navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  const backHref = isPublic ? '/' : '/signals';
  const backLabel = isPublic ? 'Home' : 'Back to Signals';

  if (error)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-glow"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
        <div className="card space-y-4 border-danger/20 bg-danger/5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-danger/10">
              <AlertTriangle className="h-6 w-6 text-danger" />
            </div>
            <div>
              <p className="text-base font-semibold text-danger">Proof link unavailable</p>
              <p className="mt-1 text-sm leading-relaxed text-danger/80">
                {isPublic
                  ? 'This proof link may have expired or the token is invalid. Ask the owner for a fresh link.'
                  : 'Failed to load signal: ' +
                    (error instanceof Error ? error.message : String(error))}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.location.reload()} className="btn-danger text-xs">
              Try Again
            </button>
            <Link href="/" className="btn-ghost text-xs text-slate-400">
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );

  if (isLoading || !signal)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-pulse rounded-xl bg-accent/20" />
          <p className="text-sm text-slate-500">Loading proof package\u2026</p>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge/40 text-slate-500 transition-colors hover:border-accent/30 hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {isPublic ? 'Public Proof' : 'Signal Proof'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isPublic
                ? 'Shareable cryptographic proof of a detected web signal'
                : 'Immutable detection record with cryptographic verification'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Share on X/Twitter */}
          <a
            href={
              'https://twitter.com/intent/tweet?text=' +
              twitterText +
              '&url=' +
              encodeURIComponent(publicUrl)
            }
            target="_blank"
            rel="noreferrer"
            className="btn-ghost shrink-0 text-xs"
            aria-label="Share on X"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share
          </a>
          <button className="btn-ghost shrink-0 text-xs" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button className="btn-ghost shrink-0 text-xs" onClick={() => copyToClipboard('link')}>
            {copied === 'link' ? (
              <>
                <Check className="h-3.5 w-3.5 text-signal" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Link
              </>
            )}
          </button>
        </div>
      </div>

      {!isPublic && (
        <div className="card border-accent/20 bg-accent/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-accent" />
                <span className="font-mono text-xs font-semibold text-accent">{proofId}</span>
              </div>
              <h2 className="text-lg font-semibold text-white">
                Proof receipt for a detected web signal
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-slate-400">
                This receipt ties the target, condition, detection time, evidence package, and
                external verification links into one auditable artifact. Share the public proof link
                to let anyone verify.
              </p>
            </div>
            <button className="btn shrink-0 text-xs" onClick={() => copyToClipboard('receipt')}>
              {copied === 'receipt' ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Receipt Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Receipt
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {isPublic && (
        <div className="card border-accent/20 bg-accent/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-accent" />
                <span className="font-mono text-xs font-semibold text-accent">{proofId}</span>
              </div>
              <h2 className="text-lg font-semibold text-white">Shareable proof package</h2>
              <p className="max-w-xl text-sm leading-relaxed text-slate-400">
                This is a publicly verifiable proof of a detected web signal. The target, condition,
                timestamp, and evidence links are all independently auditable.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={
                  'https://twitter.com/intent/tweet?text=' +
                  twitterText +
                  '&url=' +
                  encodeURIComponent(publicUrl)
                }
                target="_blank"
                rel="noreferrer"
                className="btn shrink-0 text-xs"
                aria-label="Share on X"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share on X
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row
            icon={Clock}
            label="Detected at"
            value={new Date(signal.detected_at).toLocaleString()}
          />
          <Row icon={Eye} label="Target URL" value={signal.monitor?.url ?? '\u2014'} mono />
        </div>
        <div className="border-t border-edge/40 pt-4">
          <Row icon={Eye} label="Condition" value={signal.monitor?.condition_text ?? '\u2014'} />
        </div>
        <div className="border-t border-edge/40 pt-4">
          <Row icon={Zap} label="Summary" value={signal.condition_summary ?? '\u2014'} />
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-signal" />
          Proof Chain
        </h2>
        <div className="space-y-3">
          {/* HCS transaction status */}
          <div className="flex items-center gap-3 rounded-xl border border-edge/40 bg-ink-light/30 p-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${signal.hedera_tx_id ? 'bg-signal/10 text-signal' : 'bg-warn/10 text-warn'}`}
            >
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200">Hedera Consensus</p>
              <p className="text-[10px] text-slate-500">
                {signal.hedera_tx_id
                  ? 'Transaction recorded on HashScan'
                  : 'Pending on-chain submission'}
              </p>
            </div>
            {signal.proof?.hashscanUrl ? (
              <a
                href={signal.proof.hashscanUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-signal/10 px-2.5 py-1.5 text-[10px] font-semibold text-signal transition-colors hover:bg-signal/20"
              >
                <ExternalLink className="h-3 w-3" />
                View
              </a>
            ) : (
              <span className="flex items-center gap-1 rounded-lg bg-edge/40 px-2.5 py-1.5 text-[10px] text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Pending
              </span>
            )}
          </div>

          {/* Grove CID with copy */}
          {signal.ipfs_cid && (
            <div className="flex items-center gap-3 rounded-xl border border-edge/40 bg-ink-light/30 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
                <Fingerprint className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200">Grove CID</p>
                <p className="truncate font-mono text-[10px] text-slate-500">{signal.ipfs_cid}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(signal.ipfs_cid!);
                  setCopied('cid');
                  setTimeout(() => setCopied(null), 1500);
                }}
                className="flex items-center gap-1 rounded-lg bg-cyan-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-400 transition-colors hover:bg-cyan-400/20"
              >
                {copied === 'cid' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === 'cid' ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {/* Evidence hash */}
          {signal.evidence_hash && (
            <div className="flex items-center gap-3 rounded-xl border border-edge/40 bg-ink-light/30 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Hash className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200">Evidence SHA-256</p>
                <p className="truncate font-mono text-[10px] text-slate-500">
                  {signal.evidence_hash}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(signal.evidence_hash!);
                  setCopied('hash');
                  setTimeout(() => setCopied(null), 1500);
                }}
                className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                {copied === 'hash' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === 'hash' ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {/* Source URL */}
          <div className="flex items-center gap-3 rounded-xl border border-edge/40 bg-ink-light/30 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200">Source URL</p>
              <p className="truncate text-[10px] text-slate-500">{signal.monitor?.url ?? '—'}</p>
            </div>
            {signal.monitor?.url && (
              <a
                href={signal.monitor.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                <ExternalLink className="h-3 w-3" />
                Visit
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Interactive Proof Chain ── */}
      <div className="card">
        <ProofChain
          steps={getProofChainSteps(signal)}
          title="Proof Chain"
          subtitle="Four steps. Fully automated."
        />
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-signal" />
            What was independently verified
          </h2>
          {signal.verification_checklist && (
            <span className="badge bg-signal/15 text-signal text-[10px]">
              {signal.verification_checklist.filter((c) => c.ok).length}/
              {signal.verification_checklist.length} checks passed
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {signal.verification_checklist ? (
            signal.verification_checklist.map((item) => (
              <CheckItem key={item.name} label={item.name} ok={item.ok} detail={item.detail} />
            ))
          ) : (
            <>
              <CheckItem
                label="Detection timestamp"
                ok={Boolean(signal.detected_at)}
                detail={new Date(signal.detected_at).toLocaleString()}
              />
              <CheckItem
                label="Monitor condition"
                ok={Boolean(signal.monitor?.condition_text)}
                detail={signal.monitor?.condition_text ?? 'Missing monitor condition'}
              />
              <CheckItem
                label="Hedera timestamp"
                ok={Boolean(signal.proof?.hashscanUrl)}
                detail={signal.proof?.hashscanUrl ? 'HashScan link available' : 'Pending HCS link'}
              />
              <CheckItem
                label="Grove evidence package"
                ok={Boolean(signal.proof?.ipfsUrl)}
                detail={signal.proof?.ipfsUrl ? 'Proof package available' : 'Pending proof package'}
              />
            </>
          )}
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
                alt={'screenshot ' + (i + 1)}
                className="rounded-xl border border-edge/40 shadow-card transition-shadow hover:shadow-card-hover"
              />
            ))}
          </div>
        </div>
      )}

      {!isPublic && Array.isArray((signal as any).orders) && (signal as any).orders.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-warn" />
            Kraken Orders
          </h2>
          <div className="space-y-2">
            {(signal as any).orders.map((o: any) => (
              <div key={o.id} className="stat-card flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-mono text-xs text-slate-300">
                    {o.kraken_order_id ?? '\u2014'}
                  </p>
                  <p className="text-[10px] text-slate-500">Order ID</p>
                </div>
                <span
                  className={
                    'badge ' +
                    (o.status === 'placed'
                      ? 'bg-signal/15 text-signal'
                      : o.status === 'failed'
                        ? 'bg-danger/15 text-danger'
                        : 'bg-slate-500/15 text-slate-400')
                  }
                >
                  {o.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public proof footer — CTA to create own monitor */}
      {isPublic && (
        <div className="card border-accent/20 bg-accent/5 text-center">
          <p className="text-sm text-slate-300">
            This proof was generated by{' '}
            <Link href="/" className="font-semibold text-accent hover:underline">
              LENITNES
            </Link>
            {' \u2014 '}proof-chained signal monitoring.
          </p>
          <Link href="/monitors/new" className="btn mt-3 inline-flex text-xs">
            <Eye className="h-3.5 w-3.5" />
            Create Your Own Monitor
          </Link>
        </div>
      )}
    </div>
  );
}

function CheckItem({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="stat-card flex items-start gap-3">
      <div
        className={
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ' +
          (ok ? 'bg-signal/15 text-signal' : 'bg-danger/10 text-danger')
        }
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className={`mt-0.5 line-clamp-2 text-xs ${ok ? 'text-slate-500' : 'text-danger/70'}`}>
          {detail}
        </p>
      </div>
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
      <span className={'text-sm text-slate-200 ' + (mono ? 'font-mono text-xs' : '')}>{value}</span>
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
        <Icon className={'h-4 w-4 ' + color} />
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
