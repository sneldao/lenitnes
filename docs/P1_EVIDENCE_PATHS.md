# P1 — Evidence-path visibility (P0-hardening + P1)

> Status: implementation plan → executing
> Created: 2026-08-30
> Scope: make the P0 chained-analysis layer (a) trustworthy — enforce the
> future-peer guard on every auto edge — and (b) visible — surface a
> signal's assembled evidence path on `/signals/[id]`, the public proof
> page, and the reasoning archive. No scoring, trading, or calibration
> behavior changes (that is P2, downstream).

## Why

P0 deployed the evidence-path data model (migration 013), the pure
derivation core (`buildPathFromContext`), DB orchestration
(`assembleSignalPath`), and HCS path commitments — wired best-effort into
`execution/loop.ts`. P1 is the stated next gate from
[`docs/ROADMAP.md`](ROADMAP.md): _"automatic edges must only point from
evidence detected at or before the target signal"_, then _"render an
Evidence path section on /signals/[id]"_.

Audit of the derivation core found the guard is only partially enforced:

- `sector_upstream` correctly requires `peerTs <= selfTs`.
- `corroborates` uses `Math.abs(peerTs - selfTs) <= lookbackHours` — a
  same-repo signal detected **after** self within the window IS linked
  (future evidence → current call).
- `same_sha` has no temporal check at all.

This is a correctness bug in the honesty invariant, not just cosmetics.

## Part A — hardening (API backend)

### A1. Future-peer guard — `apps/api/src/services/domain/evidence-chain.ts`

In `buildPathFromContext` (pure core, no DB changes):

- `corroborates`: replace
  `Math.abs(peerTs - selfTs) <= lookbackMs`
  with the one-sided
  `peerTs <= selfTs && selfTs - peerTs <= lookbackMs`.
- `same_sha`: add `peerTs <= selfTs` to the link condition (shared 7-char
  SHA prefix matching is unchanged).
- `sector_upstream`: unchanged (already one-sided).

### A2. Diagnostics — `evidence-chain.ts` + `routes/signals.ts`

New `getChainDiagnostics()` in `evidence-chain.ts`:

- total assembled paths; single-node vs chained counts
- edge-type histogram (`corroborates`, `sector_upstream`, `same_sha`, …)
- HCS-anchored vs pending `path_commitments`

New admin-gated route `GET /signals/chain-diagnostics` in
`routes/signals.ts` (matches the existing admin limiter pattern).

## Part B — visibility (API + web)

### B1. API — include the path in the proof package

`getSignalWithProof()` (in `routes/signals.ts`, shared by auth'd
`/signals/:id` and public `/proof/public/:id` via `routes/proof.ts`):
attach `path` = `getSignalPath(signalId)` best-effort →
`{ pathHash, nodes, edges } | null`. Additive; existing fields unchanged.

### B2. Web — Evidence path section

- New `apps/web/src/components/signal/EvidencePath.tsx` (matches
  `CheckItem` / `SignalRow` / `ProofProgress` styling).
- Rendered on `apps/web/src/app/signals/[id]/page.tsx` below the
  answer/story block (keeps answer → story → forensics hierarchy):
  - single-node → "one decisive event" callout
  - chained → ordered nodes + edge labels + timestamps + per-edge reason
    (provenance + payload), copyable path hash, HCS commitment status
- Public proof page (`/public/proof/[id]`) reuses `SignalDetailPage`, so
  it inherits the section automatically.
- Collapsible (`CollapsibleSection`) to preserve the above-the-fold
  contract.

### B3. Web — reasoning archive chain badge

- Backend: reasoning feed query adds `pathHash` / `chained` per item
  (`LEFT JOIN signal_paths`, `node_count > 1`).
- Frontend: `apps/web/src/app/reasoning/page.tsx` `ReasoningRow` shows a
  `chained` badge next to the vertical tag when present.

## Acceptance criteria

1. Part A unit tests pass, incl. the two new future-peer cases that fail
   before the fix.
2. `GET /signals/:id` and `GET /proof/public/:id` include `path` (null
   when none); additive response shape.
3. `/signals/[id]` and public proof page render the Evidence path section.
4. Reasoning archive shows the chain-membership badge.
5. `GET /signals/chain-diagnostics` (admin) returns the diagnostics object.
6. Evidence-chain + oss-adoption + signals suites green; typecheck + lint
   clean (pre-existing `scorecard.test.ts` failure is unrelated).

## Disclosure note

The evidence path (peer relationships + path hash) becomes **public** on
the public proof page — consistent with the existing HCS + Grove
transparency posture, and a deliberate choice for P1 legibility. The
individual nodes are already-public commits/signals.

## Effort

~2–2.5 days (A ~0.75d, B1 ~0.5d, B2 ~0.75d, B3 ~0.25d, tests/verify
~0.25d).

## Files touched

- `apps/api/src/services/domain/evidence-chain.ts` (A1, A2)
- `apps/api/src/routes/signals.ts` (A2 route, B1 path attach)
- `apps/api/tests/evidence-chain.test.ts` (A tests)
- reasoning feed route (B3 backend)
- `apps/web/src/lib/api.ts` (B1 types, B3 feed types)
- `apps/web/src/components/signal/EvidencePath.tsx` (new, B2)
- `apps/web/src/app/signals/[id]/page.tsx` (B2)
- `apps/web/src/app/reasoning/page.tsx` (B3)
