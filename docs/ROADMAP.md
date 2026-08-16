# Roadmap

> What's built, what's a demo, and what would need to happen for
> the enterprise direction to become a real product. Written
> 2026-07-07 after the "one engine, two audiences" pass.
> Updated 2026-07-26 with tournament signal expansion.
> Updated 2026-08-16 with the security/performance hardening pass and
> the vertical-scoped Telegram digest.
> Updated 2026-08-17 with the chained-analysis evolution plan.

## Where things stand

LENITNES today is **one engine, two live verticals**: the trading
vertical (`[markets]`, price oracle — Season 1 closed, record public) and
the research-integrity vertical (`[research]`, record oracle — alert-only,
released at re:AGENT Aug 2026, graded only against adjudicated events).
Public tags name the grading oracle; the API and DB keep the internal
values `code|science`, and URL params accept `markets|research` plus the
legacy `code|science|bio` aliases. The enterprise direction — the same
detectors + rubric run as a leak-scan over a company's own commit history
— has a **capability demo**, not a product. `/scan` and the sample report
in `docs/samples/` prove the engine can do the job; nothing yet
exists that would let a company actually buy it.

**2026-08-16 hardening pass** (security + performance): per-visitor
rate limiting (`trust proxy` + re-scoped limiter; tighter admin
limiter), API/web debug ports bound to loopback only (the published
ports were verified publicly reachable — Docker-published ports
bypass ufw), non-root container users on all three images,
timing-safe admin key compare, web-layer security headers (CSP
with `frame-ancestors` preserving the HF Space mirror, HSTS,
nosniff), no default DB password, deploy preflight that aborts on
root-owned files. Performance baseline: Lighthouse (mobile) was
~78-85 with LCP 4-5s driven by a render-blocking Google Fonts CSS
request; fonts are now self-hosted via `next/font` (FCP −1.4-1.7s,
CLS → 0). The remaining lever is the SSR/streaming + route-level
code splitting refactor below.

## What exists (trading direction)

- **Core pipeline**: 10 commit detectors → agent scoring (rubric v4)
  → conviction threshold → treasury execution (Propr Hyperliquid
  perps for shorts + L1s, BSC spot for BTC/ETH longs)
- **Signal synthesis layer** (2026-07-26): three periodic jobs that
  generate signals from aggregated evidence, not just single commits:
  - Narrative scan: cross-repo cluster of existing signals
  - Thesis synthesis: un-triggered commit aggregation
  - Proactive scan: velocity anomalies + high-impact PRs
- **Risk management**: conviction-scaled position sizing ($20-$500),
  adaptive stop loss (5%-9% by conviction), conviction-scaled TP
  (15%-25%), 8-layer risk gate, HCS notarization
- **Propr perp venue**: live shorts + L1 assets (ZEC/SOL/SUI/ARB),
  3-tier account discovery, reduceOnly closes, SL+TP attachment
- **Operator tooling**: dead-man's switch, gas alerts, TP/SL
  auto-close, outcome verdict broadcasts — plus a vertical-scoped
  daily Telegram digest (09:00 UTC, always posts) covering both
  `[markets]` and `[research]` in one instrument-voice message

## What exists (enterprise direction)

- `services/replay.ts` — the real engine. Fetches real commit
  history for any public repo + date range, batches by day, runs
  the 9 live detectors, scores firing batches with the agent,
  attaches matured price outcomes.
- `GET /backtest/replay` — public callers get mock (deterministic
  detector) scoring; `X-Admin-Key` unlocks live agent reasoning.
- `/scan` — public self-serve demo of the above.
- `docs/samples/leak-scan-zebra-2026-06.md` — one hand-generated
  sample report (Zebra, live mode), the current sales artifact.
- One-line acknowledgments of the second audience on methodology,
  calibration, monitors, and the homepage.

## What's missing, in the order that actually blocks a sale

1. **Private repo access.** The engine only reads public GitHub.
   A real customer won't hand over commit history without a
   proper grant — this means a GitHub App / OAuth install flow,
   per-tenant credential storage, and a real answer to "where does
   our code go and who can see it." Without this, the pitch is
   capped at "let me scan your public repos."
2. **Tenancy + recurring, private delivery.** Today a scan is a
   one-shot API call. A paid engagement implies scheduled scans
   delivered privately, which needs an `org_id`/audience dimension
   on `monitors` so a customer's signals never touch the public
   trading pipeline or scorecard — plus reviving the dormant
   `sendWebhook`/`sendEmail` code already sitting in `notify.ts`
   (pre-pivot leftovers) as the private delivery channel instead
   of the public Telegram broadcast.
3. **A way to actually transact.** No pricing, no lead capture, no
   "yes, scan mine" flow. Partly a business decision (one-time
   audit vs. subscription, self-serve vs. sales-led) that gates
   which of #1/#2 gets built first — don't build ahead of this.

## Recommended sequencing

Don't build #1 or #2 speculatively — they're real multi-week
engineering efforts and the wrong shape is easy to guess wrong.
The cheapest real next step is doing exactly what we did for
Zebra, but for a live prospect: manually run the live-mode replay
against a target's **public** repos, turn it into a report, and
use it as the outbound opener (`docs/samples/` is the template).

If a prospect says "I want this on our private repos, on a
schedule" — that conversation is what tells you which of #1/#2 to
build, and in what shape. Build the tenancy/GitHub-App
infrastructure once a real yes justifies it, not before.

## Status

- [ ] First live-prospect report sent (manual, public repos only)
- [ ] GitHub App / OAuth flow for private repo access
- [ ] `org_id` tenancy on `monitors` + private delivery channel
- [ ] Pricing/packaging decided
- [ ] First paid engagement

## The chain evolution — where the ongoing signal lives (2026-08-17)

A single commit can be a complete call — halo2: 95/100, four-detector
consensus, days before disclosure. But those events are rare by
construction: high-severity single commits are the exception, and the
corpus mostly produces medium-strength evidence that only becomes a
defensible thesis when **connected**. The current pipeline already
chains at the prompt level (narrative scan, thesis synthesis, proactive
scan) — but the chain is text, not structure: nothing links the
cross-repo occurrences of one event, no downstream paper is associated
with a library change, and a `[research]` finding never feeds a
`[markets]` call even when the mechanism is identical. **Chaining is
where the ongoing signal lives; the single-commit call is the rare
jackpot.**

The evolution: make the path a first-class object. Every invariant
stays — one engine, two oracles, the call as the unit of proof, HCS
pre-notarization, public recomputation from the same tables — and we
add one structured layer: typed evidence nodes and edges, chain-scored
by a versioned rubric, pre-committed like calls.

### Data model — additive, Postgres, no graph DB

Migration 013 adds four tables. The corpus is ~25 repos; the value is
in the annotation policy, not the query engine.

- `evidence_nodes` — node_type: commit | advisory | pr | release |
  paper | macro | signal; source (repo, sha, url), detected_at, payload
- `evidence_links` — typed edges: kind (`same_sha`, `backport`,
  `releases_fix`, `corroborates`, `contradicts`, `same_root`,
  `supersedes`, `paper_depends_on`, `mechanism_shared`), from/to,
  provenance (auto | curated | retrospective)
- `signal_paths` — signal_id + ordered node ids + edge kinds; the
  chain a call was scored against
- `path_commitments` — hash(path) anchored on HCS with the call, so
  the chain is pre-registered like the verdict

### Edge annotation policy — the product rule

Only edges derivable from **pre-outcome** evidence may feed a chain:

- **Auto**: same-SHA backports/cherry-picks across repos; release +\
  advisory on one repo; multi-detector on one commit (already exists
  as consensus); commit + PR + release within N days
- **Curated**: paper→library mappings (the downstream-consumer radar,
  seeded with the known cases: AFNI/3dClustSim and the papers it
  invalidated, the OpenMM barostat case, halo2 consumers)
- **Forbidden after the outcome**: post-outcome edges are labeled
  `retrospective` and excluded from calibration — the honesty rule
  that keeps chaining from becoming hindsight fitting

### Phases — build order

**P0 — Evidence tables + chain commitment.** Migration 013
(`evidence_nodes`, `evidence_links`, `signal_paths`, `path_commitments`);
the chain runner assembles auto-edges for every committed signal and
anchors the path hash on HCS alongside the call. No scoring change;
replay stays byte-compatible.

**P1 — Same-event chains visible.** `/signals/[id]` renders the path
("one event, three repos") instead of an isolated verdict; the reasoning
archive shows chain membership. Ships the halo2-shaped case as a
connected object, not a coincidence.

**P2 — Chain-graded rubric (v7).** The rubric .md gains a chain section:
composition formula (primary node, corroboration edges, contradiction
dampeners, pattern priors), chain citations alongside commit citations,
conviction bands per path length. Same file-swap versioning, same
calibration machinery.

**P3 — Downstream-consumer radar.** Curated paper↔library mapping;
a `results_rewrite` / `method_fix` in a library with mapped papers
emits "N published results affected" — the reproducibility surface of
a field, not a single repo. This is the `[research]` vertical's real
product direction, graded against the record.

**P4 — Cross-vertical chains.** A `[research]` path that reaches a
`[markets]` mechanism (library fix → protocol → price) becomes
dual-graded: both authorities score the same path; the market verdict
and the record verdict are two facts about one call. The agnostic
positioning becomes a product, not just an architecture story.

**P5 — Phenomenon-type replay library.** Typed patterns
(silent-merge → emergency-patch, cluster-threshold-fix,
force-removal-in-MD-pipeline) with a replay library that surfaces
"this shape has fired N times; the outcome distribution was X". The
agent cites the pattern in the thesis; the public calibration page
shows pattern hit rates.

### Status

- [x] P0 evidence tables + HCS chain commitment (migration 013 + chain runner, 2026-08-17)
- [ ] P1 same-event chains surfaced on /signals + archive
- [ ] P2 chain-graded rubric v7
- [ ] P3 downstream-consumer radar (curated seed: AFNI, OpenMM, halo2)
- [ ] P4 cross-vertical dual-graded chains
- [ ] P5 phenomenon-type replay library

## UI/UX polish backlog (post-hackathon)

Findings from the design-repo review (pbakaus/impeccable + vercel-labs/agent-skills,
Aug 2026). Applied so far: progressive disclosure caps, calibration-into-scorecard
merge, case-study hub, nav opacity fix, retry buttons on error states, hydration-safe
scorecard domain tab, four-item nav consolidation (Markets · Research · How it works
· More) with per-vertical portals (/markets, /research). Deferred:

1. **SSR / streaming refactor.** Every page is `'use client'` polling via react-query.
   Converting data fetches to server components + Suspense streaming (vercel
   `async-suspense-boundaries`, `server-parallel-fetching`) would cut client JS and
   first-paint time. Medium effort, no visual change.
2. **Route-level code splitting beyond case-studies.** `signals/[id]` pulls
   GitDiffInspector + AgentReasoningCard + ProofChain eagerly; `next/dynamic` on the
   heavy inspector would slim the initial chunk (vercel `bundle-dynamic-imports`).
3. **Spacing scale audit.** Pages mix `space-y-6 / 8 / 10` freely. Standardize on one
   vertical rhythm (impeccable `layout`: consistent spacing scale, deliberate rhythm).
4. **Error-state differentiation.** `PageError` now has a retry button, but every page
   shows the same generic message. Distinguish timeout vs HTTP 5xx vs empty, and wire
   retry to react-query `refetch()` instead of a full page reload (impeccable `clarify`).
5. **Visual QA pass at real viewports.** Desktop + 375px mobile screenshots of every
   page; check table overflow, touch targets ≥44px, focus order (impeccable `polish`/`audit`).
6. **Motion polish.** krehel/emilkowalski-style pass: consistent easing on the tile
   expand, skeleton shimmer on monitors/intelligence loading, reduced-motion audit of
   the ping/pulse dots.
7. **Security housekeeping.** Rotate PROPR_API_KEY (was printed to a terminal once);
   rotate TokenRouter key after the hackathon.
