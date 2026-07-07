# Roadmap

> What's built, what's a demo, and what would need to happen for
> the enterprise direction to become a real product. Written
> 2026-07-07 after the "one engine, two audiences" pass.

## Where things stand

LENITNES today is **one engine, one live audience**: the public
trading agent, with a real track record accumulating on the
scorecard. The enterprise direction — the same detectors + rubric
run as a leak-scan over a company's own commit history — has a
**capability demo**, not a product. `/scan` and the sample report
in `docs/samples/` prove the engine can do the job; nothing yet
exists that would let a company actually buy it.

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
