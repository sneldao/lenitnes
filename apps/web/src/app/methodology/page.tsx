// Public-facing narrative explaining how LENITNES turns commits
// into trades. Sister surface to /scorecard: scorecard is the
// numbers, this is the why. Reads top-to-bottom as a single
// long-form explanation; each section deep-links so the
// scorecard's "how it works →" CTA can land directly on the
// relevant block.

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
  type LucideIcon,
} from 'lucide-react';

export const metadata = {
  title: 'How it works — LENITNES',
  description:
    'How LENITNES turns public commits to consensus-critical code into scored trades, gated by a versioned safety layer.',
};

export default function MethodologyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-12 pb-16">
      <header className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">methodology</p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          How LENITNES turns commits into trades
        </h1>
        <p className="text-base leading-relaxed text-slate-400">
          A self-contained agent watches public commits to consensus-critical code, scores each one
          against a versioned rubric, executes paper trades, and broadcasts every call to a public
          Telegram channel. This page explains every step, every safety gate, and what we&apos;re
          still figuring out.
        </p>
      </header>

      {/* ── The watchlist ── */}
      <Section id="watchlist" icon={Eye} title="What we watch (and why)">
        <p>
          The watchlist is small and deliberate. Every entry is a repository where a single commit
          can move a market — consensus-critical code in Bitcoin, Ethereum, Solana, Sui, and Zcash.
          We&apos;re looking for the kind of change that, in hindsight, was the turning point: a
          soundness fix, an emergency patch, a hard-fork tag, a security rotation.
        </p>
        <p>
          The full list is on the{' '}
          <Link href="/monitors" className="link-underline text-accent">
            watchlist page
          </Link>
          . Why each entry made it:
        </p>
        <ul className="list-disc space-y-1 pl-5 marker:text-slate-600">
          <li>
            <strong className="text-slate-200">bitcoin/bitcoin</strong>,{' '}
            <strong className="text-slate-200">ethereum/go-ethereum</strong> — the two L1s whose
            code moves the largest USD volume.
          </li>
          <li>
            <strong className="text-slate-200">zcash/halo2</strong> — the founding myth. The agent
            was built after the 2026 halo2 soundness fix went unflagged for four days; this is the
            canonical &quot;what we&apos;d have caught&quot; reference.
          </li>
          <li>
            <strong className="text-slate-200">solana-labs/solana</strong>,{' '}
            <strong className="text-slate-200">MystenLabs/sui</strong> — high-velocity L1s where
            consensus changes are frequent and material.
          </li>
          <li>
            <strong className="text-slate-200">paradigmxyz/reth</strong>,{' '}
            <strong className="text-slate-200">OffchainLabs/nitro</strong> — alternative execution
            clients; bugs here cascade into the L1 they front-run.
          </li>
        </ul>
        <p className="text-sm text-slate-500">
          Every monitor row is admin-curated. We deliberately don&apos;t let the agent expand its
          own watchlist — narrow surface, fewer surprises.
        </p>
      </Section>

      {/* ── The detectors ── */}
      <Section id="detectors" icon={GitCommit} title="What the detectors look for">
        <p>
          When a new commit lands, eight typed detectors run a fast classification pass over it
          BEFORE the LLM is involved. Each detector returns a score (0-100) and a confidence. The
          agent then sees the detector output as input, not the raw commit alone.
        </p>
        <div className="space-y-3">
          {DETECTORS.map((d) => (
            <div key={d.name} className="rounded-xl border border-edge/30 bg-ink-light/40 p-4">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-accent">
                {d.name}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{d.what}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{d.example}</p>
            </div>
          ))}
        </div>
        <p>
          Detectors aren&apos;t binary. A commit can trip{' '}
          <span className="font-mono text-[11px] text-accent">emergency_patch</span> at 70 AND{' '}
          <span className="font-mono text-[11px] text-accent">consensus_relevant</span> at 90 — the
          agent reads both, plus the underlying commit message, plus 7 days of price context, plus
          past similar signals&apos; outcomes, then forms its own verdict.
        </p>
      </Section>

      {/* ── The agent ── */}
      <Section id="agent" icon={Brain} title="How the agent scores">
        <p>
          The agent is{' '}
          <code className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-xs text-slate-200">
            kimi-k2
          </code>{' '}
          via Virtuals, prompted with a versioned rubric. For every above-classification commit it
          produces four things:
        </p>
        <ul className="list-disc space-y-1 pl-5 marker:text-slate-600">
          <li>
            <strong className="text-slate-200">conviction</strong> — 0-100, the agent&apos;s
            confidence that this commit moves the underlying asset in a tradeable way.
          </li>
          <li>
            <strong className="text-slate-200">thesis</strong> — a 280-character explanation of the
            call, in the agent&apos;s own words.
          </li>
          <li>
            <strong className="text-slate-200">recommended action</strong> — long, short, or none.
          </li>
          <li>
            <strong className="text-slate-200">confidence band</strong> — low / mid / high, mapped
            from the conviction score.
          </li>
        </ul>
        <p>
          The full agent input + raw response is stored in{' '}
          <span className="font-mono text-[11px] text-slate-400">agent_scores</span>, including
          sub-threshold scores. The{' '}
          <Link href="/scorecard" className="link-underline text-accent">
            scorecard
          </Link>{' '}
          reads back from that table — so every public claim about the agent&apos;s track record
          traces to a row that has a timestamp + rubric version + prompt.
        </p>
        <CalloutAside>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Why a versioned rubric
          </p>
          <p className="mt-1 text-sm text-slate-300">
            When the prompt or model changes, the rubric version bumps. The scorecard can then slice
            performance by rubric version — &quot;v1.3 was random; v1.4 added market context and the
            t1d avg moved from −0.5% to +0.8%&quot;. Without a versioned rubric, you can&apos;t tell
            whether the strategy improved or the market just shifted.
          </p>
        </CalloutAside>
      </Section>

      {/* ── The safety layer ── */}
      <Section id="safety" icon={Shield} title="Every safety gate, in plain English">
        <p>
          Before any swap fires, a stack of gates runs. Failing any gate downgrades the trade to
          paper — the signal still ships on Telegram, but no on-chain action happens.
        </p>
        <ol className="space-y-3">
          {SAFETY_GATES.map((g, i) => (
            <li key={g.title} className="rounded-xl border border-edge/30 bg-ink-light/40 p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-slate-500">{i + 1}.</span>
                <h3 className="font-semibold text-slate-200">{g.title}</h3>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{g.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-slate-500">
          The full gate-trip log is on{' '}
          <code className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-xs text-slate-400">
            /admin/risk-check
          </code>{' '}
          — an admin endpoint we use during preflight to verify a trade <em>would</em> fire before
          flipping the kill switch.
        </p>
      </Section>

      {/* ── The position lifecycle ── */}
      <Section id="lifecycle" icon={Target} title="Position lifecycle">
        <p>
          Every position has three milestones: open, settle, close. We record all three so the
          public{' '}
          <Link href="/portfolio" className="link-underline text-accent">
            portfolio
          </Link>{' '}
          can show realized + unrealized P&amp;L from the same tables the scorecard reads.
        </p>
        <ol className="space-y-2 text-sm">
          <li>
            <strong className="text-slate-200">Open.</strong> A PancakeSwap V2 swap of native BNB →
            target token, with{' '}
            <code className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-[11px]">
              amountOutMin
            </code>{' '}
            derived from an on-chain quote × the configured slippage tolerance.
            <code className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-[11px]">
              entry_price_usd
            </code>{' '}
            captured from the CoinGecko historical at swap time.
          </li>
          <li>
            <strong className="text-slate-200">Settle.</strong> Take-profit and stop-loss levels are
            written at open, conviction-scaled (higher conviction = wider TP). Defaults: +15% TP /
            −7% SL. A 5-minute scheduler checks every open position against the live CoinGecko price
            and closes on hit.
          </li>
          <li>
            <strong className="text-slate-200">Close.</strong> A reverse PancakeSwap V2 swap (token
            → BNB) returns capital to the wallet. The position row is updated with realized P&amp;L.
            If the on-chain close swap fails, the row still moves to
            <code className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-[11px]">
              closed
            </code>{' '}
            and the operator gets a Telegram alert — better to record intent than leave a position
            in limbo.
          </li>
        </ol>
      </Section>

      {/* ── Paper first ── */}
      <Section id="paper-first" icon={AlertTriangle} title="Why paper trades first">
        <p>
          The agent is live (signals fire, scoring happens) but every trade today is paper.
          That&apos;s not a placeholder — it&apos;s the strategy.
        </p>
        <p>
          Trading agents that go live before they&apos;re calibrated bleed capital silently. The
          hard problem isn&apos;t building the pipeline; it&apos;s knowing whether the
          pipeline&apos;s output is signal or noise. Paper-trading lets us answer that question in
          the open, with public timestamped receipts, before we risk a dollar.
        </p>
        <p>
          The bar to flip{' '}
          <code className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-[11px]">
            TRADING_ENABLED=true
          </code>{' '}
          is the{' '}
          <Link href="/scorecard" className="link-underline text-accent">
            calibration table
          </Link>{' '}
          on the scorecard showing higher conviction = better outcomes for a meaningful sample
          (rough target: n ≥ 30 closed positions with the 80+ band visibly outperforming the 70-79
          band on T+1d).
        </p>
      </Section>

      {/* ── The calibration loop ── */}
      <Section id="calibration" icon={TrendingUp} title="The calibration loop">
        <p>
          Every change to the agent — new detector, new rubric version, threshold adjustment — is
          followed by a measurement window. The calibration table on the scorecard is the truth of
          record. If a change doesn&apos;t move the curve, it gets rolled back.
        </p>
        <p>The current open questions:</p>
        <ul className="list-disc space-y-1 pl-5 marker:text-slate-600">
          <li>
            Does <strong className="text-slate-200">conviction 80+</strong> actually outperform{' '}
            <strong className="text-slate-200">70-79</strong>? (We just raised the threshold; data
            pending.)
          </li>
          <li>
            Does the <strong className="text-slate-200">30-minute settling delay</strong> filter the
            &quot;already priced in&quot; noise we saw in the first cohort?
          </li>
          <li>
            Which <strong className="text-slate-200">detectors</strong> carry predictive weight, and
            which are decoration? The &quot;by detector&quot; table on the scorecard answers that as
            outcomes accumulate.
          </li>
        </ul>
      </Section>

      {/* ── The proof chain ── */}
      <Section id="proof" icon={Zap} title="Proof chain">
        <p>
          Every signal is timestamped on <strong className="text-slate-200">Hedera HCS</strong>{' '}
          (consensus timestamp, micro- second precision, tamper-evident), recorded on{' '}
          <strong className="text-slate-200">Arbitrum SignalRegistry</strong> (a smart contract that
          stores the signal hash on-chain), and packaged on{' '}
          <strong className="text-slate-200">Grove / IPFS</strong> (evidence, screenshots,
          metadata). Together they make it impossible for the system to misremember its own calls —
          anyone can verify a published signal against the three independent authorities.
        </p>
        <p>
          The proof chain is visible on every signal detail page. The scorecard&apos;s{' '}
          <strong className="text-slate-200">HCS-proofed %</strong> stat tracks coverage; it slowly
          trends toward 100% as backfills complete.
        </p>
      </Section>

      <footer className="border-t border-edge/30 pt-6 text-sm text-slate-500">
        <p>
          Questions? See the{' '}
          <Link href="/case-study/halo2" className="link-underline text-accent">
            halo2 case study
          </Link>{' '}
          for the founding myth, or the{' '}
          <a
            href="https://github.com/sneldao/lenitnes"
            className="link-underline text-accent"
            target="_blank"
            rel="noreferrer"
          >
            source on GitHub
          </a>{' '}
          for the full implementation. The agent&apos;s reasoning is open; its track record is
          public; its safety gates ship default-on.
        </p>
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
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold text-slate-100">
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

const DETECTORS = [
  {
    name: 'emergency_patch',
    what: 'Commit message contains urgency language (HOTFIX, urgent, critical, emergency, immediate) AND lands on a release branch or default branch.',
    example: '"HOTFIX: fix double-spend in coinbase validation"',
  },
  {
    name: 'security_critical_patch',
    what: 'Files changed are in security-sensitive paths (validation, consensus, crypto) AND the message mentions a vulnerability class.',
    example: '"Patch integer overflow in script interpreter"',
  },
  {
    name: 'consensus_relevant',
    what: 'Diff touches consensus-critical paths — chainparams, block validation, signature schemes. A change here forks the network if mishandled.',
    example: '"Anchor variable-base scalar-mul incomplete-addition base"',
  },
  {
    name: 'protocol_upgrade',
    what: 'References a versioned protocol change — soft-fork, hard-fork, mainnet-upgrade, BIP / EIP number.',
    example: '"Activate BIP-340 Schnorr signatures on mainnet"',
  },
  {
    name: 'governance_shift',
    what: 'Maintainer set is changing, governance docs are being rewritten, or signer rotations are landing.',
    example: '"Add new maintainer; rotate release-signing key"',
  },
  {
    name: 'supply_chain_risk',
    what: 'Dependency version pins are moving in directions that historically correlate with supply-chain incidents (downgrade, unknown maintainer).',
    example: '"Bump cryptolib from 1.4.2 to 0.9.8-rc1"',
  },
  {
    name: 'dependency_rotation',
    what: 'Routine but high-signal: lockfile churn, deprecation notices, post-incident library swaps.',
    example: '"Migrate from libfoo to libfoo2 after CVE-2025-xxxx"',
  },
  {
    name: 'maintainer_departure',
    what: 'Commit author or recent contributor disappears from the repo for &gt;30 days, or removes themselves from CODEOWNERS.',
    example: '"Step back from Bitcoin Core maintenance"',
  },
];

const SAFETY_GATES = [
  {
    title: 'Master kill switch',
    body: 'TRADING_ENABLED defaults to false. Even with TREASURY_MODE=live, no swap fires until the operator explicitly opts in. The kill switch is the master override.',
  },
  {
    title: 'Asset registry membership',
    body: 'The agent only trades assets that appear in the verified registry with a real on-chain token address. BTC and ETH are pre-registered on BSC mainnet. L1s (SOL, SUI, ZEC) and small caps deliberately route to paper.',
  },
  {
    title: 'BSC chain-ID guard',
    body: 'Live BNB trades refuse unless the configured chainId is 56 (mainnet). Pointing at testnet (97) would reach the wrong contracts — caught at the gate with a clear reason instead of a cryptic revert.',
  },
  {
    title: 'Treasury balance preflight',
    body: 'Before any swap, the gate confirms the wallet holds at least amountIn + 0.005 BNB (gas buffer). Catches underfunded wallets before they produce a reverted transaction.',
  },
  {
    title: 'On-chain liquidity floor',
    body: 'PancakeSwap V2 pool reserves are read directly; a TVL below the registry floor (default $5M) blocks the trade. Catches the case where deep TVL has dried up between deploys.',
  },
  {
    title: '24h volume floor',
    body: 'CoinMarketCap reports actual 24h trading volume. Pools can have deep liquidity but zero flow (stale market-makers); the volume gate refuses trades into a dead pair.',
  },
  {
    title: 'Concurrent + per-asset position caps',
    body: 'No more than 5 open positions globally, no more than 1 per asset. If a thesis fires twice in a row, the second fires as paper. Concentration risk is structural, not negotiable.',
  },
];
