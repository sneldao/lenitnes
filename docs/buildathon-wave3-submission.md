# SoSoValue Buildathon — Wave 3 Submission Copy

> Paste-ready sections for the hackathon platform. Every claim is
> grounded in the live deploy at lenitnes.persidian.com and the
> public repo at github.com/sneldao/lenitnes. Honest about what is
> live vs. implemented-but-not-configured.

---

## What it does

LENITNES is an autonomous AI trading agent that reads public commits
to consensus-critical cryptocurrency code — and SoSoValue's
structured financial news + macro feeds — to infer trading
directions before the market prices them in.

It runs a fully autonomous loop, no human in the loop:

1. **Watch.** A curated set of security-critical and
   consensus-critical repositories (ZCash, Bitcoin, Ethereum,
   Solana, Arbitrum, Sui) plus SoSoValue news + macro feeds for
   each watched asset.
2. **Detect.** Nine typed detectors classify every new commit and
   every SoSoValue news item (emergency_patch,
   security_critical_patch, consensus_relevant, protocol_upgrade,
   governance_shift, supply_chain_risk, dependency_rotation,
   maintainer_departure, and a news-sentiment detector that runs
   on the SoSoValue feed).
3. **Score with cross-signal narrative.** A frontier-model agent
   (GLM-4.6) evaluates each signal against a versioned conviction
   rubric (v3) — but crucially, it doesn't score in isolation. A
   cross-signal narrative context shows the agent what every OTHER
   monitored repo and the SoSoValue news feed did in the same 24h
   window, so it can string commits across repos and weigh
   corroboration. A separate 2-hour narrative scan synthesizes the
   whole cluster into a single tradeable thesis even when no
   individual monitor crossed threshold.
4. **Gate.** Conviction ≥ 70 to trade. Sub-threshold signals
   persist as a public reasoning archive but produce no trade.
5. **Commit + prove.** Trade from the treasury wallet (BSC testnet
   via PancakeSwap; SoDEX orderbook venue implemented for
   ValueChain), notarize the signal on Hedera HCS (tamper-evident
   timestamping), broadcast the thesis to a public Telegram
   channel. All publicly auditable.
6. **Track.** At T+1h, T+1d, T+7d the mainnet price is snapshotted
   from CoinGecko and attributed back to the originating signal.
   The public scorecard recomputes hit ratio, Sharpe, drawdown, and
   per-detector breakdown from the same tables the trade receipts
   point at — the system cannot misremember its own performance.

**Live demo:** https://lenitnes.persidian.com

- `/scorecard` — the live track record
- `/calibration` — conviction-band calibration (is higher conviction
  actually predictive?)
- `/case-study/halo2` — a replay of the agent against the Zebra 4.5.3
  release (would have flagged 95/100 SHORT ZEC, 2-3 days before
  formal disclosure)

---

## The problem it solves

**The thesis:** a single commit to consensus-critical code is
rarely a tradeable signal on its own. A security patch on ZCash,
viewed in isolation, might be routine maintenance. But that same
patch, viewed alongside concurrent protocol_upgrade signals on
Ethereum and Bitcoin, a negative SoSoValue news cluster on ZEC,
and an empty macro calendar — that is a tradeable thesis. No
human trader can watch six repos + a news feed + a macro calendar
simultaneously and synthesize the cluster in real time. An agent
can.

**The gap in the market:** traditional fund managers and signal
services are (a) opaque — you see the call, not the reasoning, (b)
unverifiable — no public track record you can audit, (c) slow —
human-speed analysis of code changes, and (d) gated — behind paywalls
or accreditation. LENITNES is none of these: every signal carries
the agent's verbatim thesis, every signal is timestamped on Hedera
HCS (immutable, tamper-evident), every trade receipt is on-chain,
and the scorecard recomputes from the same tables — you can verify
the track record yourself.

**The SoSoValue-specific value:** SoSoValue's structured financial
news + macro feeds are the corroboration layer that makes the
cross-signal narrative work. Without news, the agent only sees
code. With SoSoValue, it sees the news cycle corroborating (or
contradicting) the code signal — and the v3 rubric explicitly
instructs it to escalate conviction on corroboration and discount
on isolation. The first live narrative scan (June 30) produced an
82/100 SHORT ZEC call driven primarily by a 20-item SoSoValue news
cluster — exactly the "one-person business empire as a financial
news agency + fund manager" vision the buildathon describes.

---

## Challenges I ran into

**1. The isolation problem (the core thesis challenge).** The
biggest challenge was that individual commit signals, scored in
isolation, rarely produced enough conviction to trade. The first
rubric (v1/v2) had the agent score one monitor's commits + that
asset's market data — it never saw the pattern, only the dots. I
solved this in Wave 3 by adding the cross-signal narrative context
(rubric v3): a `buildNarrativeContext()` function that fetches
recent signals across ALL monitors + cross-asset activity +
SoSoValue news for the asset, injected into every agent score. The
2-hour narrative scan goes further — it fires a synthesis signal
when the cluster is meaningful even if no individual monitor
crossed threshold.

**2. The "quiet hour" brand problem.** The hourly Telegram
heartbeat said "0 signals scanned, quiet hour" when nothing fired
— which undermined the autonomous brand story (the channel read as
"the agent is doing nothing"). I fixed this by having the quiet
branch surface scan activity: news items reviewed, the next macro
event on the calendar, and the watched assets — proving the agent
is operating even when it chooses not to trade.

**3. SoDEX venue integration vs. production configuration.** I
implemented the full SoDEX venue (EIP-712 order signing, orderbook
quoting, ValueChain integration) as a clean abstraction alongside
the existing PancakeSwap/BSC venue. However, SoDEX mainnet API
access requires Silver-rank SoPoints + a token deposit, and the
buildathon whitelist access hadn't been approved by the Wave 3
deadline. The venue code is complete and tested locally; the
production deploy currently falls back to PancakeSwap/BSC testnet.
I was honest about this in the submission rather than overclaiming.

**4. The news-signal detector never fired independently.** The
news-signal detector was gated behind GitHub commit signals in the
execution loop — it only ran as enrichment after a commit signal
already fired, so it had never produced a standalone signal in
production. The narrative scan (Wave 3) fixed this: it runs the
news detector directly on the SoSoValue feed, so a news-driven
cluster can now fire without any commit activity at all.

**5. Docker image didn't ship the new rubric.** During deploy I
discovered the Dockerfiles hardcoded `rubric-v1.md` — so the v3
bump left the production images without the active prompt file,
which would have crashed `readRubric()` at runtime. Fixed by
copying every `*.md` from the agent directory generically, so
future rubric bumps don't require a Dockerfile edit.

---

## Technologies I used

**SoSoValue ecosystem:**

- SoSoValue API — structured financial news (`searchNews`,
  `getNewsFeed`), macro events (`getMacroEvents`), market index
  data (`buildIndexContext`). Used for: news-sentiment detection,
  cross-signal narrative corroboration, macro calendar awareness in
  the agent prompt.
- SoDEX API — EIP-712 order signing + orderbook quoting
  (`venues/sodex/`). Implemented as a venue abstraction; not yet
  configured on the production deploy (pending API access).

**AI / LLM:**

- GLM-4.6 (ZhipuAI) as the conviction-scoring agent, prompted with
  a versioned rubric (v3) that includes a narrative-synthesis
  section.
- Nine typed detectors (regex + keyword classification) that run
  as a fast pre-LLM pass — the agent sees detector output, not raw
  commits.

**On-chain infrastructure:**

- Hedera HCS (Hashgraph Consensus Service) — tamper-evident
  timestamping for every signal + the agent's dispatch message.
- BSC testnet — PancakeSwap V2 swaps (live).
- ValueChain — SoDEX orderbook venue (implemented, pending config).
- Arbitrum — proof anchoring (implemented).

**Data / execution stack:**

- TypeScript (Node 20, ESM) — monorepo: `apps/api`, `apps/web`,
  `packages/types`.
- PostgreSQL — signals, agent scores, orders, positions, outcomes.
- Redis — BullMQ job queue for the execution loop.
- node-cron — scheduler (monitors every 30s, narrative scan every
  2h, heartbeat hourly, backtest every 6h, TP/SL every 5m).
- CoinGecko API — mainnet price snapshots for outcome tracking.
- Next.js 14 (App Router) — public web UI (scorecard, calibration,
  case studies).
- Docker Compose — production deploy on a single VPS.

---

## How we built it

The architecture is a single autonomous loop with a clear
separation between detection, scoring, and execution:

**Detection layer** (`services/detectors/`): nine typed detectors
run a fast classification pass over every new commit (via TinyFish
GitHub webhook + scraper) and every SoSoValue news item. Each
detector returns a score (0-100) + confidence. The agent sees
detector output as structured input, not raw commits — this keeps
the LLM prompt compact and the classification deterministic.

**Scoring layer** (`services/agent.ts` + `services/agent/narrative.ts`):
the agent receives detector classifications + live CoinMarketCap
market data + SoSoValue macro/index context + the cross-signal
narrative context. It outputs a JSON verdict: conviction (0-100),
a 280-character thesis (Telegram-ready), recommended action
(long/short/none), confidence band, an HCS dispatch message (the
agent's on-chain voice), and a proof_action (standard vs.
dedicated_topic). The rubric is versioned (v3) and stored as a
markdown file loaded at runtime — every version bump is
non-breaking (new fields fall back to defaults).

**Narrative synthesis** (`services/agent/narrative.ts`): the
cross-signal layer that was missing in earlier waves.
`buildNarrativeContext()` fetches recent signals across all
monitors + cross-asset activity + SoSoValue news for the asset,
and injects it into every agent score. `runNarrativeScan()` runs
on a 2h cron, gathers the cluster, and when meaningful (≥2 signals
across distinct assets OR ≥3 sentiment news items), scores a
synthesis signal under a dedicated `narrative:portfolio` monitor.

**Execution layer** (`services/treasury.ts`): a single DRY entry
point (`executeAgentTrade`) shared by both the per-monitor loop
and the narrative scan. Resolves the tradeable token from the
registry, applies a risk gate (kill switch, position limits,
concentration checks — may downgrade live to paper), derives the
trade action, signs, and records. Trade failures are logged but
the signal still ships — the signal is the product, the trade is
secondary.

**Proof layer** (`services/proof.ts` + Hedera Agent Kit): every
signal gets an HCS timestamp anchor; above-threshold signals get
the agent's dispatch message anchored on HCS too. The dispatch is
the agent's verbatim, on-chain commitment — anyone visiting the
HashScan transaction reads what the agent wrote at the moment of
detection.

**Outcome layer** (`services/backtest.ts`): at T+1h, T+1d, T+7d
the mainnet price is snapshotted from CoinGecko and attributed
back to the originating signal. The public scorecard recomputes
hit ratio, Sharpe, drawdown, and per-detector breakdown from these
rows — cached 60s, invalidated on every new signal.

**Public surfaces:** Next.js web UI (scorecard, calibration, case
studies) + public Telegram channel (hourly editorial heartbeat +
above-threshold trade broadcasts).

---

## What we learned

**1. Isolation is the enemy of conviction.** The single biggest
lesson: scoring each signal in isolation produces a timid agent.
Individual commits "rarely produce enough impetus" — but the
cluster does. Adding the cross-signal narrative context (v3) was
the difference between an agent that watches and an agent that
trades. The first live narrative scan immediately produced an
82/100 call driven by a 20-item SoSoValue news cluster —
validation that the synthesis layer works.

**2. SoSoValue news is corroboration, not a primary signal.** News
headlines alone, without a code signal, are weak — the rubric
explicitly instructs the agent never to trade on news alone
without a detector firing (except in the dedicated narrative-scan
path where the cluster IS the signal). But news corroborating a
code signal is powerful: a security patch + a negative news
cluster on the same asset in the same 24h is a stronger call than
either alone.

**3. Honesty is a feature, not a bug.** The public scorecard shows
real numbers — including losing trades and a negative cumulative
PnL during the early sample. The conviction calibration page
openly asks "is higher conviction actually predictive?" while N is
small. This builds more trust than a curated win-rate would. The
buildathon judges value "clear real-world value" — and a system
that honestly reports its own track record is more credible than
one that doesn't.

**4. The "one-person business empire" thesis is real.** A single
person built and deployed an autonomous trading agent that reads
code + news, scores with an LLM, trades on-chain, and broadcasts
publicly — with SoSoValue providing the news/macro data layer and
SoDEX providing the execution venue. The infrastructure exists
for this now; the constraint is integration quality, not team size.

---

## What's next for

**1. SoDEX production activation.** The SoDEX venue is implemented
and tested locally but not configured on the production deploy
(pending API access approval). Once the buildathon whitelist is
approved, flipping it on is a config change — the venue abstraction
is already wired. This moves execution from BSC testnet
(PancakeSwap) to ValueChain (SoDEX orderbook), which is the
intended production path.

**2. Expanding the watchlist + SoSoValue asset coverage.** The
current watchlist is six repos + their assets. The narrative
synthesis layer gets stronger with more monitored assets — more
cross-repo clusters, more corroboration opportunities. Next:
add Avalanche, Cardano, Polkadot monitors + their SoSoValue news
feeds.

**3. SoSoValue index integration.** SoSoValue's SSI Protocol (spot
index) is a natural fit for the outcome-tracking layer — instead
of snapshotting spot prices from CoinGecko, use SoSoValue's
structured index data for more reliable, manipulation-resistant
benchmarking.

**4. Conviction calibration at scale.** The current sample is
small (17 signals, 5 trades). As N grows, the calibration page
will show whether the conviction bands are actually predictive —
and the rubric can be tuned based on real outcome data. The goal
is a closed loop: outcomes feed back into rubric adjustments.

**5. Copy-trading / signal subscription.** The public Telegram
channel + on-chain proof layer make every signal verifiable. The
next product surface is a copy-trading mode: users can subscribe
to the agent's signals and auto-execute the same trades on their
own wallet — turning LENITNES from a single-agent fund into a
signal infrastructure that others can build on.

**6. Multi-agent narrative.** The current narrative scan uses one
agent. The next iteration could spawn specialized sub-agents (a
macro agent, a news agent, a code agent) that each contribute to
the narrative context — a more structured synthesis than a single
prompt.
