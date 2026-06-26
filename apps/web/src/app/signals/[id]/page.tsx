'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import {
  Clock,
  ArrowLeft,
  Copy,
  Check,
  Eye,
  Zap,
  Image as ImageIcon,
  Printer,
  FileCheck2,
  Globe,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import ProofChain from '@/components/ProofChain';
import { getProofChainSteps } from '@/lib/proof-chain';
import { AgentReasoningCard } from '@/components/AgentReasoningCard';
import { CheckItem } from '@/components/signal/CheckItem';
import { SignalRow } from '@/components/signal/SignalRow';
import { ProofProgress } from '@/components/signal/ProofProgress';
import { PageLoader } from '@/components/ui/page-states';

// Public-facing proof explorer for a single signal.
// Supports both authenticated (private) and public (shareable) modes.
export default function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPublic = pathname.startsWith('/public/proof');
  const shareToken = searchParams.get('share') ?? undefined;

  const [copied, setCopied] = useState<'link' | 'receipt' | 'cid' | 'hash' | null>(null);

  const queryKey = isPublic ? qk.publicProof(id) : qk.signal(id);
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

  // (Removed after pivot: the per-user "mark viewed" endpoint is gone.
  // The signal detail page is public; the owner-action celebration is
  // reimplemented in Day 9 alongside the landing-page rewrite.)

  // Inject OG / Twitter meta for public share links
  useEffect(() => {
    if (!signal || !isPublic) return;
    const summary = signal.conditionSummary ?? 'Signal detected';
    const target = signal.monitor?.url ?? '';
    const desc = `LENITNES proof: "${summary}" detected on ${target}. Hedera-timestamped, Grove-stored.`;
    const setMeta = (prop: string, val: string, attr = 'property') => {
      let el = document.querySelector(`meta[${attr}="${prop}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', val);
    };
    document.title = `${summary.slice(0, 60)} — LENITNES Proof`;
    setMeta('og:title', document.title);
    setMeta('og:description', desc);
    setMeta('og:type', 'article');
    setMeta('twitter:card', 'summary', 'name');
    setMeta('twitter:title', document.title, 'name');
    setMeta('twitter:description', desc, 'name');
  }, [signal, isPublic]);

  const proofId = useMemo(() => 'LEN-' + id.slice(0, 8).toUpperCase(), [id]);
  const publicUrl = useMemo(() => {
    const base =
      (typeof window !== 'undefined' ? window.location.origin : '') + '/public/proof/' + id;
    const token = signal?.publicShareToken ?? shareToken;
    return token ? `${base}?share=${encodeURIComponent(token)}` : base;
  }, [id, shareToken, signal?.publicShareToken]);

  const twitterText = useMemo(() => {
    const summary = signal?.conditionSummary ?? 'Signal detected';
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
      'Detected: ' + new Date(signal.detectedAt).toISOString(),
      'Target: ' + (signal.monitor?.url ?? 'unknown'),
      'Condition: ' + (signal.monitor?.conditionText ?? 'unknown'),
      'Summary: ' + (signal.conditionSummary ?? 'Signal detected'),
      'Hedera: ' + (signal.proof?.hashscanUrl ?? 'pending'),
      'Arbitrum: ' +
        (signal.arbTxHash ? `https://sepolia.arbiscan.io/tx/${signal.arbTxHash}` : 'pending'),
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

  // The non-public detail view was reachable from /signals (a
  // per-user list page that was removed in Day 13). For non-public
  // detail pages, fall back to the scorecard's recent-calls list,
  // which is the post-pivot equivalent.
  const backHref = isPublic ? '/' : '/scorecard';
  const backLabel = isPublic ? 'Home' : 'Back to scorecard';

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

  if (isLoading || !signal) return <PageLoader label="Loading proof package\u2026" />;

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
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
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
              <h2 className="text-lg font-semibold text-slate-100">
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
              <h2 className="text-lg font-semibold text-slate-100">Shareable proof package</h2>
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
          <SignalRow
            icon={Clock}
            label="Detected at"
            value={new Date(signal.detectedAt).toLocaleString()}
          />
          <SignalRow icon={Eye} label="Target URL" value={signal.monitor?.url ?? '\u2014'} mono />
        </div>
        <div className="border-t border-edge/40 pt-4">
          <SignalRow
            icon={Eye}
            label="Condition"
            value={signal.monitor?.conditionText ?? '\u2014'}
          />
        </div>
        <div className="border-t border-edge/40 pt-4">
          <SignalRow icon={Zap} label="Summary" value={signal.conditionSummary ?? '\u2014'} />
        </div>
      </div>

      {/* ── Agent Reasoning — combines classification + verdict in one card ── */}
      {signal.agentScore && (
        <AgentReasoningCard
          agentScore={signal.agentScore}
          classifications={signal.classifications}
        />
      )}

      {/* ── Price impact — always shown ── */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-signal" />
            What happened next
          </h2>
          {Array.isArray(signal.outcomes) && signal.outcomes.length > 0 && (
            <span className="font-mono text-[10px] text-slate-600">
              {signal.outcomes[0]?.asset}
            </span>
          )}
        </div>
        {Array.isArray(signal.outcomes) && signal.outcomes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {signal.outcomes.map((o) => {
              const pct = parseFloat(o.pctChange);
              const isUp = pct > 0.5;
              const isDown = pct < -0.5;
              const windowLabel =
                o.windowSeconds < 3600
                  ? `${Math.round(o.windowSeconds / 60)}m`
                  : o.windowSeconds < 86400
                    ? `${Math.round(o.windowSeconds / 3600)}h`
                    : `${Math.round(o.windowSeconds / 86400)}d`;
              return (
                <div
                  key={`${o.asset}-${o.windowSeconds}`}
                  className={`rounded-xl border p-3 ${
                    isUp
                      ? 'border-signal/30 bg-signal/8'
                      : isDown
                        ? 'border-danger/30 bg-danger/8'
                        : 'border-edge/40 bg-ink-light/30'
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
                    {windowLabel} after
                  </p>
                  <p
                    className={`mt-1 text-xl font-bold tabular-nums ${
                      isUp ? 'text-signal' : isDown ? 'text-danger' : 'text-slate-400'
                    }`}
                  >
                    {isUp ? '+' : ''}
                    {pct.toFixed(2)}%
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-slate-600">
                    ${parseFloat(o.priceAtSignal).toFixed(2)} → $
                    {parseFloat(o.priceAfter).toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="font-mono text-sm text-slate-700">
            price outcome data not yet available — backtest runs periodically
          </p>
        )}
      </div>

      {/* ── Proof Chain — single canonical surface.
          Previously this section showed the same artifacts three
          different ways (row list, stepper, checklist). The stepper
          carries the same per-artifact links plus the flow narrative,
          and the verification checklist below answers the orthogonal
          question "what passed verification?". */}
      <div className="card">
        <div className="mb-3 flex items-center justify-end">
          <ProofProgress signal={signal} />
        </div>
        <ProofChain
          steps={getProofChainSteps(signal)}
          title="Proof Chain"
          subtitle="Five steps. Fully automated."
        />
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-signal" />
            What was independently verified
          </h2>
          {signal.verificationChecklist && (
            <span className="badge bg-signal/15 text-signal text-[10px]">
              {signal.verificationChecklist.filter((c) => c.ok).length}/
              {signal.verificationChecklist.length} checks passed
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(signal.verificationChecklist ?? []).map((item) => (
            <CheckItem key={item.name} label={item.name} ok={item.ok} detail={item.detail} />
          ))}
        </div>
      </div>

      {signal.evidenceText && (
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-accent" />
            Evidence
          </h2>
          <pre className="overflow-auto whitespace-pre-wrap rounded-xl bg-ink-light/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
            {signal.evidenceText}
          </pre>
        </div>
      )}

      {signal.screenshotUrls.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <ImageIcon className="h-3.5 w-3.5 text-accent" />
            Screenshots
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {signal.screenshotUrls.map((src, i) => (
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

      {!isPublic && signal.orders.length > 0 && (
        <div className="card border-warn/20 bg-warn/5">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-warn" />
            Action taken
          </h2>
          <div className="space-y-3">
            {signal.orders.map((o) => {
              const params = (o.orderParams ?? {}) as {
                type?: string;
                pair?: string;
                volume?: number | string;
                mode?: string;
                validate?: boolean;
                output?: string;
              };
              const isPaper = params.validate === true || params.mode === 'paper';
              return (
                <div key={o.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-200">
                        {params.type?.toUpperCase()} {params.pair} @ {params.volume}
                      </span>
                      {isPaper && (
                        <span className="badge bg-warn/15 text-warn text-[10px]">Paper</span>
                      )}
                    </div>
                    <span
                      className={
                        'badge text-[10px] ' +
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
                  {params.mode === 'paper' && params.output && (
                    <pre className="overflow-auto rounded-lg bg-ink-light/80 p-3 font-mono text-[10px] leading-relaxed text-slate-400">
                      {params.output}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Public proof footer. The earlier "Create Your Own Monitor"
          CTA pointed at /monitors/new, which doesn't exist post-pivot.
          Send public viewers to the scorecard instead. */}
      {isPublic && (
        <div className="card border-accent/20 bg-accent/5 text-center">
          <p className="text-sm text-slate-300">
            This proof was generated by{' '}
            <Link href="/" className="link-underline font-semibold text-accent">
              LENITNES
            </Link>
            {' \u2014 '}proof-chained signal monitoring.
          </p>
          <Link href="/scorecard" className="btn mt-3 inline-flex text-xs">
            <Eye className="h-3.5 w-3.5" />
            See the live scorecard
          </Link>
        </div>
      )}
    </div>
  );
}
