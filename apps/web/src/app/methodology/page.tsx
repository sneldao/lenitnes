// Public-facing methodology. Visual-first: diagrams, grids, and
// timelines instead of prose. Sister surface to /scorecard.

import Link from 'next/link';
import {
  GitCommit,
  Brain,
  Shield,
  TrendingUp,
  Target,
  AlertTriangle,
  Eye,
  Zap,
  ArrowRight,
  Newspaper,
  Lock,
  CheckCircle2,
  FileText,
  type LucideIcon,
} from 'lucide-react';

export const metadata = {
  title: 'How it works — LENITNES',
  description:
    'How LENITNES turns public commits to consensus-critical code into scored trades, gated by a versioned safety layer.',
};

export default function MethodologyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-10 pb-16">
      <header className="space-y-2 reveal in-view">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">methodology</p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          How LENITNES turns commits into trades
        </h1>
      </header>

      {/* ── Pipeline overview ── */}
      <section className="reveal reveal-delay-1 in-view">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-edge/40 bg-panel/60 p-4">
          {PIPELINE.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-ink-light/60 px-3 py-2">
                <step.icon className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-slate-200">{step.label}</span>
              </div>
              {i < PIPELINE.length - 1 && <ArrowRight className="h-4 w-4 text-slate-600" />}
            </div>
          ))}
        </div>
      </section>

      {/* ── The watchlist ── */}
      <Section id="watchlist" icon={Eye} title="What we watch">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WATCHLIST.map((repo) => (
            <a
              key={repo.url}
              href={`https://github.com/${repo.url}`}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-edge/30 bg-ink-light/40 p-3 transition-all duration-200 hover:border-accent/30 hover:bg-ink-light/60"
            >
              <div className="font-mono text-xs text-slate-300 group-hover:text-accent">
                {repo.url}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{repo.why}</div>
            </a>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          Admin-curated. The agent can&apos;t expand its own watchlist.{' '}
          <Link href="/monitors" className="link-underline text-accent">
            Full list →
          </Link>
        </p>
      </Section>

      {/* ── The detectors ── */}
      <Section id="detectors" icon={GitCommit} title="9 typed detectors">
        <p className="text-sm text-slate-400">
          Fast classification pass before the LLM. Each returns a score (0-100) + confidence. The
          agent sees detector output, not raw commits — plus a cross-signal narrative of what every
          other repo + the SoSoValue news feed did in the same 24h window.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DETECTORS.map((d) => (
            <div
              key={d.name}
              className="rounded-lg border border-edge/30 bg-ink-light/40 p-3 transition-colors duration-200 hover:border-edge/50"
            >
              <div className="flex items-center gap-1.5">
                {d.icon === 'newspaper' ? (
                  <Newspaper className="h-3 w-3 text-accent" />
                ) : (
                  <GitCommit className="h-3 w-3 text-accent" />
                )}
                <span className="font-mono text-[11px] uppercase tracking-wider text-accent">
                  {d.name}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{d.what}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Not binary — a commit can trip multiple detectors. The agent reads all scores + commit
          message + 7-day price context + past outcomes, then forms its own verdict.
        </p>
      </Section>

      {/* ── The agent ── */}
      <Section id="agent" icon={Brain} title="How the agent scores">
        <div className="flex items-center gap-3 rounded-xl border border-edge/30 bg-ink-light/40 p-4">
          <Brain className="h-5 w-5 text-accent" />
          <div>
            <div className="text-sm font-medium text-slate-200">Llama 3.1 70B via NVIDIA API</div>
            <div className="text-xs text-slate-500">Versioned rubric (v3) · conviction 0-100</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {AGENT_OUTPUTS.map((o) => (
            <div key={o.label} className="rounded-lg bg-ink-light/40 p-3 text-center">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {o.label}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-200">{o.value}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Every score (including sub-threshold) stored in{' '}
          <code className="rounded bg-ink-light px-1 py-0.5 font-mono text-[11px]">
            agent_scores
          </code>{' '}
          with timestamp + rubric version. The{' '}
          <Link href="/scorecard" className="link-underline text-accent">
            scorecard
          </Link>{' '}
          reads from that table — every public claim traces to a verifiable row.
        </p>
        <CalloutAside>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Why a versioned rubric
          </p>
          <p className="mt-1 text-sm text-slate-300">
            When the prompt or model changes, the version bumps. The scorecard slices performance by
            version — &quot;v3 added narrative context and T+1d avg moved from −0.5% to +0.8%&quot;.
          </p>
        </CalloutAside>
      </Section>

      {/* ── The safety layer ── */}
      <Section id="safety" icon={Shield} title="Safety gates">
        <p className="text-sm text-slate-400">
          Failing any gate downgrades to paper — the signal still ships, no on-chain action.
        </p>
        <div className="space-y-0">
          {SAFETY_GATES.map((g, i) => (
            <div key={g.title} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-xs font-mono text-accent">
                  {i + 1}
                </div>
                {i < SAFETY_GATES.length - 1 && <div className="w-px flex-1 bg-edge/30" />}
              </div>
              <div className="flex-1 pb-4">
                <h3 className="text-sm font-semibold text-slate-200">{g.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{g.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Position lifecycle ── */}
      <Section id="lifecycle" icon={Target} title="Position lifecycle">
        <div className="grid grid-cols-3 gap-3">
          {LIFECYCLE.map((phase, i) => (
            <div key={phase.label} className="rounded-xl border border-edge/30 bg-ink-light/40 p-3">
              <phase.icon className="h-4 w-4 text-accent" />
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                Step {i + 1}
              </div>
              <div className="text-sm font-semibold text-slate-200">{phase.label}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{phase.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          All three milestones recorded — the{' '}
          <Link href="/portfolio" className="link-underline text-accent">
            portfolio
          </Link>{' '}
          shows realized + unrealized P&amp;L from the same tables.
        </p>
      </Section>

      {/* ── Paper first ── */}
      <Section id="paper-first" icon={AlertTriangle} title="Why paper first">
        <div className="flex items-center gap-3 rounded-xl border border-warn/20 bg-warn/[0.04] p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warn" />
          <p className="text-sm text-slate-300">
            Every trade today is paper. That&apos;s the strategy, not a placeholder. Live trading
            flips on only after the{' '}
            <Link href="/scorecard" className="link-underline text-accent">
              calibration table
            </Link>{' '}
            shows higher conviction = better outcomes (target: n ≥ 30 closed positions).
          </p>
        </div>
      </Section>

      {/* ── Calibration loop ── */}
      <Section id="calibration" icon={TrendingUp} title="Calibration loop">
        <div className="flex items-center gap-2 rounded-xl border border-edge/30 bg-ink-light/40 p-4">
          {['Change', 'Measure', 'Compare', 'Keep/Rollback'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-slate-300">
                {label}
              </span>
              {i < 3 && <ArrowRight className="h-3 w-3 text-slate-600" />}
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {OPEN_QUESTIONS.map((q) => (
            <div key={q} className="flex items-start gap-2 text-sm text-slate-400">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/50" />
              {q}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Proof chain ── */}
      <Section id="proof" icon={Zap} title="Proof chain">
        <div className="grid grid-cols-3 gap-3">
          {PROOF_LAYERS.map((layer) => (
            <div
              key={layer.name}
              className="rounded-xl border border-edge/30 bg-ink-light/40 p-3 text-center"
            >
              <layer.icon className="mx-auto h-5 w-5 text-accent" />
              <div className="mt-2 text-sm font-semibold text-slate-200">{layer.name}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{layer.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Three independent authorities — impossible to misremember a call. Visible on every{' '}
          <Link href="/signals" className="link-underline text-accent">
            signal detail page
          </Link>
          .
        </p>
      </Section>

      <footer className="border-t border-edge/30 pt-6 text-sm text-slate-500">
        <Link href="/case-study/halo2" className="link-underline text-accent">
          halo2 case study
        </Link>{' '}
        ·{' '}
        <a
          href="https://github.com/sneldao/lenitnes"
          className="link-underline text-accent"
          target="_blank"
          rel="noreferrer"
        >
          source on GitHub
        </a>
      </footer>
    </article>
  );
}

// ── Section primitive ──────────────────────────────────────────

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20 reveal in-view">
      <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold text-slate-100">
        <span className="rounded-lg bg-accent/10 p-1.5">
          <Icon className="h-4 w-4 text-accent" />
        </span>
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

function CalloutAside({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-xl border-l-2 border-accent/40 bg-accent/[0.04] py-3 pl-4 pr-3">
      {children}
    </div>
  );
}

// ── Content data ───────────────────────────────────────────────

const PIPELINE = [
  { label: 'Watch', icon: Eye },
  { label: 'Detect', icon: GitCommit },
  { label: 'Score', icon: Brain },
  { label: 'Gate', icon: Shield },
  { label: 'Trade', icon: Target },
  { label: 'Prove', icon: Zap },
];

const WATCHLIST = [
  { url: 'zcash/halo2', why: 'Founding case study · Orchard soundness' },
  { url: 'bitcoin/bitcoin', why: 'L1 · largest USD volume' },
  { url: 'ethereum/go-ethereum', why: 'L1 · largest USD volume' },
  { url: 'solana-labs/solana', why: 'L1 · high-velocity consensus' },
  { url: 'MystenLabs/sui', why: 'L1 · high-velocity consensus' },
  { url: 'OffchainLabs/nitro', why: 'L2 · bugs cascade to L1' },
];

const DETECTORS = [
  {
    name: 'emergency_patch',
    icon: 'commit',
    what: 'Urgency language (HOTFIX, urgent, critical) on a release branch.',
  },
  {
    name: 'security_critical',
    icon: 'commit',
    what: 'Security-sensitive paths (validation, consensus, crypto) + vulnerability class.',
  },
  {
    name: 'consensus_relevant',
    icon: 'commit',
    what: 'Diff touches consensus-critical paths — chainparams, block validation, signatures.',
  },
  {
    name: 'protocol_upgrade',
    icon: 'commit',
    what: 'Versioned protocol change — soft-fork, hard-fork, BIP/EIP number.',
  },
  {
    name: 'governance_shift',
    icon: 'commit',
    what: 'Maintainer set changing, governance docs rewritten, signer rotations.',
  },
  {
    name: 'supply_chain_risk',
    icon: 'commit',
    what: 'Dependency downgrades, unknown maintainers — supply-chain incident patterns.',
  },
  {
    name: 'dependency_rotation',
    icon: 'commit',
    what: 'Lockfile churn, deprecation notices, post-incident library swaps.',
  },
  {
    name: 'maintainer_departure',
    icon: 'commit',
    what: 'Contributor disappears >30d or removes from CODEOWNERS.',
  },
  {
    name: 'news_signal',
    icon: 'newspaper',
    what: 'SoSoValue news matching bullish/bearish keywords. Only detector that fires on narrative, not code.',
  },
];

const AGENT_OUTPUTS = [
  { label: 'conviction', value: '0-100' },
  { label: 'thesis', value: '280 chars' },
  { label: 'action', value: 'long/short/none' },
  { label: 'confidence', value: 'low/mid/high' },
];

const SAFETY_GATES = [
  {
    title: 'Kill switch',
    body: 'TRADING_ENABLED defaults false. No swap fires until operator opts in.',
  },
  {
    title: 'Asset registry',
    body: 'Only verified tokens with real on-chain addresses. Unlisted assets → paper.',
  },
  {
    title: 'Chain-ID guard',
    body: 'Live trades refuse unless chainId matches mainnet. Catches misconfigured RPC.',
  },
  {
    title: 'Balance preflight',
    body: 'Wallet must hold amountIn + gas buffer. Catches underfunded wallets pre-swap.',
  },
  {
    title: 'Liquidity floor',
    body: 'Pool TVL must exceed registry floor ($5M default). Catches dried-up liquidity.',
  },
  {
    title: 'Position caps',
    body: 'Max open positions + per-asset concentration limits. Prevents overexposure.',
  },
];

const LIFECYCLE = [
  {
    label: 'Open',
    icon: Target,
    detail: 'Swap BNB → token with amountOutMin from on-chain quote. Entry price captured.',
  },
  {
    label: 'Settle',
    icon: TrendingUp,
    detail: 'TP/SL written at open, conviction-scaled. 5-min scheduler checks live price.',
  },
  {
    label: 'Close',
    icon: CheckCircle2,
    detail: 'Reverse swap returns capital. Realized P&L recorded. Failed close → alert.',
  },
];

const OPEN_QUESTIONS = [
  'Does conviction 80+ actually outperform 70-79? (Data pending — threshold recently adjusted.)',
  'Does the 30-minute settling delay filter already-priced-in noise?',
  'Which detectors carry predictive weight vs decoration? The by-detector table answers this as outcomes accumulate.',
];

const PROOF_LAYERS = [
  {
    name: 'Hedera HCS',
    icon: Zap,
    detail: 'Consensus timestamp, microsecond precision, tamper-evident.',
  },
  { name: 'Arbitrum', icon: Lock, detail: 'SignalRegistry contract stores signal hash on-chain.' },
  { name: 'IPFS', icon: FileText, detail: 'Evidence, screenshots, metadata — immutable package.' },
];
