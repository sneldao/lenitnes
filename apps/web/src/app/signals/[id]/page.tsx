'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { api, type AgentScore, type OutcomeWindow } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import {
  Clock,
  ArrowLeft,
  Copy,
  Check,
  ChevronDown,
  Eye,
  Zap,
  Image as ImageIcon,
  Printer,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';
import ProofChain from '@/components/ProofChain';
import { getProofChainSteps } from '@/lib/proof-chain';
import { AgentReasoningCard } from '@/components/AgentReasoningCard';
import { SignalSourceBadge } from '@/components/SignalSourceBadge';
import { CheckItem } from '@/components/signal/CheckItem';
import { SignalRow } from '@/components/signal/SignalRow';
import { ProofProgress } from '@/components/signal/ProofProgress';
import { PageLoader } from '@/components/ui/page-states';
import { Reveal } from '@/components/ui/reveal';
import { Tooltip } from '@/components/ui/tooltip';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { JudgmentCountdown } from '@/components/JudgmentCountdown';
import { convictionColor, shortUrl } from '@/lib/format';

// Public-facing proof explorer for a single signal.
// Layout contract: ANSWER first (the call, entry→now, verdict),
// story second (reasoning, on-chain voice), forensics last
// (detection details, evidence, proof chain). Proof machinery is
// one click deep, never above the fold.
export default function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPublic = pathname?.startsWith('/public/proof') ?? false;
  const shareToken = searchParams?.get('share') ?? undefined;

  const [copied, setCopied] = useState<'link' | 'receipt' | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);

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

  if (isLoading || !signal) return <PageLoader label="Loading proof package…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {/* ── Slim header: provenance + actions, no foreword ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge/40 text-slate-500 transition-colors hover:border-accent/30 hover:text-accent"
            aria-label={backLabel}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-accent">{proofId}</p>
            <p className="truncate text-xs text-slate-500">
              {new Date(signal.detectedAt).toLocaleString()}
              {signal.monitor?.url?.startsWith('http')
                ? ` · ${shortUrl(signal.monitor.url)}`
                : signal.monitor?.url
                  ? ` · ${signal.monitor.url.split(':')[0]} scanner`
                  : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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

      {/* ── THE ANSWER: direction, entry → now, verdict ── */}
      {signal.agentScore ? (
        <VerdictHero
          agentScore={signal.agentScore}
          outcomes={signal.outcomes}
          detectedAt={signal.detectedAt}
        />
      ) : (
        <div className="card border-edge/40 bg-ink-light/30">
          <p className="text-sm leading-relaxed text-slate-300">
            {signal.conditionSummary ?? 'Signal detected'}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            pre-scoring record — archived without agent conviction
          </p>
        </div>
      )}

      {/* ── Slim provenance strip: receipt + auditability ── */}
      <div className="card flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          auditable on Hedera · Arbitrum · IPFS
        </p>
        <button className="btn-ghost shrink-0 text-xs" onClick={() => copyToClipboard('receipt')}>
          {copied === 'receipt' ? (
            <>
              <Check className="h-3.5 w-3.5 text-signal" />
              Receipt Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy Proof Receipt
            </>
          )}
        </button>
      </div>

      {/* ── Signal source attribution (non-commit origins only) ── */}
      {signal.signalSource && signal.signalSource.category !== 'commit' && (
        <Reveal>
          <div className="card border-edge/50 bg-panel/60">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg" aria-hidden="true">
                {signal.signalSource.tag}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SignalSourceBadge
                    category={signal.signalSource.category}
                    label={signal.signalSource.label}
                    showTag={false}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    signal origin
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {signal.signalSource.explanation}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── The why: agent reasoning + detector classifications ── */}
      {signal.agentScore && (
        <Reveal>
          <AgentReasoningCard
            agentScore={signal.agentScore}
            classifications={signal.classifications}
          />
        </Reveal>
      )}

      {/* ── The agent's on-chain dispatch ──}
      The agent.hcs_dispatch field is the agent's first-person
      commitment, written to Hedera HCS via hedera-agent-kit's
      submit_topic_message_tool — permanent, tamper-evident,
      independently verifiable. Dedicated topics are minted only at
      conviction ≥ 90. */}
      {signal.agentScore?.hcsDispatch && (
        <Reveal>
          <div className="card border-violet/25 bg-violet/[0.04]">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="section-title flex items-center gap-2">
                <FileCheck2 className="h-3.5 w-3.5 text-violet" />
                The agent&apos;s words, on Hedera
              </h2>
              {signal.agentScore.proofAction === 'dedicated_topic' && (
                <span className="badge bg-violet/20 text-violet text-[10px] uppercase tracking-wider">
                  dedicated topic
                </span>
              )}
            </div>
            {/* Monologue clamped to ~4 lines; the full first-person
                text sits one click deep unless it is already short. */}
            <blockquote
              className={cn(
                'rounded-xl border-l-2 border-violet/40 bg-ink-light/40 px-4 py-3 text-sm italic leading-relaxed text-slate-200',
                !dispatchOpen && signal.agentScore.hcsDispatch.length > 240 && 'line-clamp-4',
              )}
            >
              &ldquo;{signal.agentScore.hcsDispatch}&rdquo;
            </blockquote>
            {signal.agentScore.hcsDispatch.length > 240 && (
              <button
                onClick={() => setDispatchOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:text-violet"
              >
                <ChevronDown
                  className={cn('h-3 w-3 transition-transform', dispatchOpen && 'rotate-180')}
                />
                {dispatchOpen ? 'less' : 'full text'}
              </button>
            )}
            <div className="mt-3 grid gap-1.5 text-[11px] font-mono text-slate-500">
              <div>
                rubric {signal.agentScore.rubricVersion}
                {signal.hederaTxId && (
                  <>
                    {' · '}
                    <a
                      href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(signal.hederaTxId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:text-accent-glow"
                    >
                      default topic · {signal.hederaTxId.slice(0, 24)}… ↗
                    </a>
                  </>
                )}
              </div>
              {signal.hederaDedicatedTopicId && (
                <a
                  href={`https://hashscan.io/testnet/topic/${encodeURIComponent(signal.hederaDedicatedTopicId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet hover:text-violet-glow"
                >
                  dedicated topic · {signal.hederaDedicatedTopicId} ↗
                </a>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/* ── Orders placed (operator view only) ── */}
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

      {/* ── Proof chain: the brand, one scroll deep ── */}
      <Reveal>
        <div className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title flex items-center gap-2">
              <FileCheck2 className="h-3.5 w-3.5 text-accent" />
              Proof chain
            </h2>
            <ProofProgress signal={signal} />
          </div>
          <ProofChain steps={getProofChainSteps(signal)} title="" subtitle="" />
        </div>
      </Reveal>

      {/* ── Forensics: everything else, one click deep ── */}

      <CollapsibleSection
        title={
          <>
            <Clock className="h-3.5 w-3.5 text-accent" />
            Detection details
          </>
        }
        aside={
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
            target · condition
          </span>
        }
      >
        <div className="space-y-4">
          <SignalRow
            icon={Clock}
            label="Detected at"
            value={new Date(signal.detectedAt).toLocaleString()}
          />
          <SignalRow icon={Eye} label="Target URL" value={signal.monitor?.url ?? '—'} mono />
          <SignalRow icon={Eye} label="Condition" value={signal.monitor?.conditionText ?? '—'} />
          <SignalRow icon={Zap} label="Summary" value={signal.conditionSummary ?? '—'} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={
          <>
            <Check className="h-3.5 w-3.5 text-signal" />
            Independent verification
          </>
        }
        aside={
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
            {signal.verificationChecklist
              ? `${signal.verificationChecklist.filter((c) => c.ok).length}/${signal.verificationChecklist.length} checks`
              : '—'}
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(signal.verificationChecklist ?? []).map((item) => (
            <CheckItem key={item.name} label={item.name} ok={item.ok} detail={item.detail} />
          ))}
        </div>
      </CollapsibleSection>

      {signal.evidenceText && (
        <CollapsibleSection
          title={
            <>
              <Eye className="h-3.5 w-3.5 text-accent" />
              Evidence
            </>
          }
          aside={
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
              raw capture
            </span>
          }
        >
          <pre className="overflow-auto whitespace-pre-wrap rounded-xl bg-ink-light/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
            {signal.evidenceText}
          </pre>
        </CollapsibleSection>
      )}

      {signal.screenshotUrls.length > 0 && (
        <CollapsibleSection
          title={
            <>
              <ImageIcon className="h-3.5 w-3.5 text-accent" />
              Screenshots
            </>
          }
          aside={
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
              {signal.screenshotUrls.length}
            </span>
          }
        >
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
        </CollapsibleSection>
      )}

      {/* ── Public footer CTA ── */}
      {isPublic && (
        <div className="card border-accent/20 bg-accent/5 text-center">
          <p className="text-sm text-slate-300">
            This proof was generated by{' '}
            <Link href="/" className="link-underline font-semibold text-accent">
              LENITNES
            </Link>
            {' — '}proof-chained signal monitoring.
          </p>
          <Link href="/scorecard" className="btn mt-3 inline-flex items-center gap-1.5 text-xs">
            <Eye className="h-3.5 w-3.5" />
            See the live scorecard
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Verdict hero — the page's entire point ─────────────────────
// Direction + asset + entry→latest price + verdict (or a live
// countdown to it), conviction in large type, and every outcome
// window as a chip. Replaces the old triple of verdict hero /
// "what happened next" / verdict card with ONE surface that
// can't contradict itself.
const CANONICAL_WINDOWS: Array<{ seconds: number; label: string }> = [
  { seconds: 3600, label: '1h' },
  { seconds: 14400, label: '4h' },
  { seconds: 86400, label: '1d' },
  { seconds: 604800, label: '7d' },
];

function VerdictHero({
  agentScore,
  outcomes,
  detectedAt,
}: {
  agentScore: AgentScore;
  outcomes: OutcomeWindow[];
  detectedAt: string;
}) {
  const t1d = outcomes.find((o) => o.windowSeconds === 86400);
  const t1h = outcomes.find((o) => o.windowSeconds === 3600);
  const chosen = t1d ?? t1h ?? null;
  const asset = outcomes[0]?.asset ?? null;

  const action = agentScore.recommendedAction;
  const isNoTrade = action === 'none';

  let verdictText = 'Verdict pending';
  let verdictTone = 'text-slate-400';
  if (isNoTrade) {
    verdictText = 'No trade taken — archived as reasoning';
  } else if (chosen) {
    const directional = (action === 'short' ? -1 : 1) * parseFloat(chosen.pctChange);
    if (directional > 0.5) {
      verdictText = `Agent was right`;
      verdictTone = 'text-signal';
    } else if (directional < -0.5) {
      verdictText = 'Agent was wrong';
      verdictTone = 'text-danger';
    } else {
      verdictText = 'Inconclusive so far';
    }
  }

  const convColor = convictionColor(agentScore.conviction);

  return (
    <div className="card border-accent/20 bg-panel/80">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span
              className={`font-display text-4xl font-semibold tracking-tight sm:text-5xl ${
                action === 'long'
                  ? 'text-signal'
                  : action === 'short'
                    ? 'text-danger'
                    : 'text-slate-300'
              }`}
            >
              {isNoTrade ? 'NO TRADE' : action.toUpperCase()}
            </span>
            {asset && (
              <span className="font-display text-2xl font-semibold tracking-tight text-slate-100">
                {asset.replace(/-/g, ' ')}
              </span>
            )}
          </div>

          {/* Price line: entry → latest known, direction-adjusted tone */}
          {chosen && (
            <p
              className={cn(
                'font-mono text-base tabular-nums sm:text-lg',
                (action === 'short' ? -1 : 1) * parseFloat(chosen.pctChange) > 0
                  ? 'text-signal'
                  : 'text-danger',
              )}
            >
              ${parseFloat(chosen.priceAtSignal).toFixed(2)} → $
              {parseFloat(chosen.priceAfter).toFixed(2)}
              <span className="ml-2 font-semibold">
                {(parseFloat(chosen.pctChange) >= 0 ? '+' : '') +
                  parseFloat(chosen.pctChange).toFixed(2) +
                  '%'}
              </span>
              <span className="ml-1 text-xs text-slate-500">
                at T+{chosen.windowSeconds === 86400 ? '1d' : '1h'}
              </span>
            </p>
          )}

          <p className={`text-sm font-semibold ${verdictTone}`}>{verdictText}</p>

          {!isNoTrade && !t1d && <JudgmentCountdown detectedAt={detectedAt} className="block" />}

          {/* Outcome windows as chips — merged from the old
              "what happened next" section. */}
          {outcomes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              {CANONICAL_WINDOWS.map(({ seconds, label }) => {
                const o = outcomes.find((w) => w.windowSeconds === seconds);
                if (!o) return null;
                const pct = parseFloat(o.pctChange);
                const dir = (action === 'short' ? -1 : 1) * pct;
                return (
                  <span
                    key={seconds}
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 font-mono text-[11px] tabular-nums',
                      dir > 0.5
                        ? 'border-signal/30 bg-signal/[0.06] text-signal'
                        : dir < -0.5
                          ? 'border-danger/30 bg-danger/[0.06] text-danger'
                          : 'border-edge/40 bg-ink-light/30 text-slate-400',
                    )}
                  >
                    {label} {pct >= 0 ? '+' : ''}
                    {pct.toFixed(1)}%
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          <Tooltip
            wide
            label="Conviction is the agent's scored confidence (0–100) in the signal, from the rubric. At ≥ 70 it can clear the trade threshold and size scales with it."
            side="bottom"
          >
            <span
              className={cn('font-mono text-6xl font-bold leading-none tabular-nums', convColor)}
            >
              {agentScore.conviction}
            </span>
          </Tooltip>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-500">
            conviction / 100
          </p>
        </div>
      </div>
    </div>
  );
}
