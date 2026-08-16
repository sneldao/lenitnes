# Roadmap

> What's built, what's a demo, and what would need to happen for
> the enterprise direction to become a real product. Written
> 2026-07-07 after the "one engine, two audiences" pass.
> Updated 2026-07-26 with tournament signal expansion.
> Updated 2026-08-16 with the security/performance hardening pass and
> the vertical-scoped Telegram digest.

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
