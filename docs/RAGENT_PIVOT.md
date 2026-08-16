# LENITNES — re:AGENT Hackathon Pivot (Aug 15–16, Founders Inc. SF)

> **Status:** Track A entry. One engine, one brand, two verticals:
> **LENITNES[code]** — the existing crypto sentinel (live today).
> **LENITNES[bio]** — the re:AGENT build: a sentinel for scientific
> software integrity. Same pipeline, same proof chain, new domain.

> **Build status (Sat 2026-08-15, late evening):** Deployed and live.
> Provider swap complete (`ac77d2d`): NVIDIA/Virtuals removed; the agent
> now scores on a Qwen3.8 chain — keyless HF endpoint (`Qwen/Qwen3.8-27B`,
> ~30 req/min) primary, TokenRouter (`qwen/qwen3.8-max-free`) fallback,
> thinking disabled for clean JSON. Verified locally end-to-end (live
> replay scored via the HF endpoint). Lockfile regression from the bio
> commit fixed (`a767ace`, restore from `c49b8df`), docker `npm ci` green.
> VPS deploy of `a767ace` succeeded: migrations 008 + 009 applied,
> 5 bio monitors seeded, containers healthy, `.env` on the new provider
> chain. **First live production bio signal already scored:**
> `choderalab/openmmtools` commit `16b62a2` (minimization routine change),
> `results_rewrite` detector, conviction 68 / investigate / rubric v6 via
> Qwen3.8-27B — below the 70 broadcast threshold, archived to the
> reasoning archive as designed. **Outstanding:** (1) Paperclip/GXL key
> stored and wired, but currently rejected by the GXL BioMedRxiv API
> ("Invalid API key") — ask organizers to activate/reissue; Firecrawl
> remains the working literature source in the meantime; (2) visual QA
> of new web pages (`/case-study/clustsim`, `/scorecard?domain=bio`,
> `/scan` toggle); (3) demo video + pitch rehearsal; (4) first
> above-threshold bio broadcast (needs conviction ≥ 70).

> **Status update (Sun 2026-08-16, early morning):** GXL confirmed the
> Paperclip key is activated — the auth issue was on our side: the key is
> scoped to the **MCP endpoint** (`POST {base}/mcp`, JSON-RPC,
> `X-API-Key` header), not `/api/shell` (which 401s with it). Verified:
> `tools/list` returns the full 14-tool catalog incl. `scholar_search`.
> `tools/call` needs an MCP session, and `initialize` is currently
> rejected with **"Maximum number of sessions (100) reached"** — a
> server-wide cap, presumably held by stale hackathon sessions. Adapter
> retargeted to the MCP flow (initialize → tools/call → release session)
> and degrades to Firecrawl until the cap clears; no further code change
> needed when it does. Email to GXL drafted requesting session cleanup
> and confirming the call flow. All tests green, committed + deployed.

## Fresh-session handoff

Current provider setup:

- Primary scoring provider: keyless HF endpoint, `Qwen/Qwen3.8-27B`
  (`HF_QWEN_BASE_URL` / `HF_QWEN_MODEL`, no key needed)
- Fallback scoring provider: TokenRouter, `qwen/qwen3.8-max-free`
  (`TOKENROUTER_API_KEY`; flip to primary with `AGENT_PROVIDER=tokenrouter`)
- Anthropic branch: implemented and dormant until `ANTHROPIC_API_KEY` is set
- Paperclip/GXL literature: adapter wired to the MCP endpoint, currently
  blocked by the shared server's 100-session cap → degrades to Firecrawl
- Firecrawl Research Index: keyless, always-on literature fallback

To resume:

1. Read this file (`docs/RAGENT_PIVOT.md`)
2. Check local `.env` for: `HF_QWEN_BASE_URL`, `HF_QWEN_MODEL`,
   `TOKENROUTER_API_KEY`, `PAPERCLIP_API_KEY`, `PAPERCLIP_API_URL`
3. Verify locally:
   ```bash
   cd apps/api
   npx tsc --noEmit
   npx vitest run
   npx tsx scripts/replay-afni-live.ts
   ```
4. Deploy with `npm run deploy` (handles migrations, seeding, health checks)

Security notes:

- Keys live only in local `.env` and `/opt/lenitnes/.env` on the VPS
  (both gitignored); gitleaks pre-commit hook active
- Server `.env` pre-provider-swap backup: `/opt/lenitnes/.env.bak-provider-swap`
- The TokenRouter key was shared in chat once — rotate it after the hackathon

## The decision (one line)

**Enter Track A: repoint the existing engine at scientific software
repos — an agent that detects validity-threatening changes, corroborates
them against the literature, commits timestamped alerts on Hedera HCS,
and grades itself against retraction/correction ground truth.**

Not Track B (a scored dataset is produced as a byproduct; the artifact
is the agent). Not Track C (no Proto/wet-lab angle — don't fake it).

## Naming & nomenclature strategy

**LENITNES is "SENTINEL" backwards.** The brand is the engine; the
vertical is the _field it watches_. Verticals render as bracket tags
everywhere — web badges, API `domain` values, Telegram headers, HCS
dispatches:

```
LENITNES[code]   domain='code'   crypto consensus repos → price outcomes
                                 (live; halo2/ZEC founding case study)
LENITNES[bio]    domain='bio'    scientific software repos → scientific-
                                 record outcomes (retractions, corrections,
                                 dated disclosures). The re:AGENT entry.
                                 Later also drives biotech equity signals.
LENITNES[<x>]    reserved        [fin], [geo]… only when a repo corpus +
                                 a dated ground-truth oracle exist for it.
                                 Rule: no vertical without an oracle.
```

Rules that keep the scheme from drifting:

1. **Tag = field watched, never output type.** Biotech equity trading
   stays inside `[bio]` (its outcome oracle gains an `equity` mode
   later); we don't fork verticals per trade venue.
2. **Badges are mono text** (`[code]`, `[bio]`), no per-vertical emoji,
   no sub-brands, no "powered by" suffixes.
3. **`monitors.domain` is the single source of truth** — every surface
   (rubric, detectors, outcomes, scorecard metrics, Telegram format,
   UI badge) derives from it.

## Pitch

> "The agent that would have shorted halo2 — and would have flagged the
> 3dClustSim bug."
>
> In May 2015, a quiet commit to AFNI — `2baf5710` "deal with edge
> effects in 3dClustSim" — patched a 15-year-old statistical bug that
> inflated false-positive rates across neuroimaging. A year later
> Eklund et al. (PNAS 2016, "Cluster failure") exposed it, and the
> fallout invalidated large swaths of published fMRI work. Our engine
> reads commit streams exactly the way it caught the Zcash halo2
> exploit in 2026: detect → reason → commit the prediction before the
> outcome is known → get scored against what actually happened.

Two founding case studies, one engine. That is "end to end agentic
science" with built-in evaluation — the event's explicit theme
("reliable ways to evaluate their work").

## Why repo-watching is a real scientific signal

| #   | Signal class                                                                                  | Repos                                           | Ground truth                                          | Detector fit                                                            |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | **Validity threats** — silent fixes to stats/analysis code in widely-used tools               | `afni/afni` (3dClustSim fix 2015-05-12)         | Eklund PNAS 2016; retractions in the danielskatz list | `emergency_patch`, `silent_merge` + new `method_fix`, `results_rewrite` |
| 2   | **Outbreak early-warning** — surveillance pipeline activity precedes variant risk assessments | `nextstrain/ncov`, `nextstrain/mpox`            | WHO/CDC variant designations, dated                   | `velocity_anomaly`, `protocol_release`                                  |
| 3   | **Research-direction leaks** — targets/methods in commits before preprints                    | `choderalab/openmmtools`, `Opentrons/opentrons` | Preprint/publication dates                            | `pr_activity`, `protocol_upgrade`                                       |
| 4   | **Reproducibility risk** — dependency/env churn in analysis pipelines                         | any bio repo                                    | WithdrarXiv retraction reasons                        | `dependency_rotation`, `supply_chain_risk`                              |

### Verified anchors (searched 2026-08-15, TinyFish + GitHub + Firecrawl)

- **afni/afni** — 193★, active. Fix commits confirmed:
  `2baf5710` (2015-05-12 "deal with edge effects in 3dClustSim"),
  `94b03435` (2015-05-12), `34c5e4a0` (2015-05-26), `721bd150`
  (2015-05-27). Replay range: 2015-04-01 → 2015-07-01.
- **WithdrarXiv** (arXiv:2412.03775) — 14,000+ withdrawn arXiv papers
  with author comments + 10-category reason taxonomy. Evaluation corpus.
- **danielskatz/errors-due-to-research-software** — curated list of
  software-error retractions (BLOSUM62, Reinhart-Rogoff, Naughtin MVPA,
  Ecker ASD/sex-prediction, Neupane NMR portability). Each entry is a
  potential scored ground-truth row.
- **nextstrain/ncov** (1,364★), **nextstrain/mpox**,
  **Opentrons/opentrons** (default branch `edge`),
  **choderalab/openmmtools** — all verified, all seeded in
  `db/seed/watchlist_bio.sql`.
- **Boltz** (sponsor): resolved to `jwohlwend/boltz` (4,163★, branch
  `main`, active — recent precision/inference fixes in 2026). Seeded in
  `db/seed/watchlist_bio.sql` on 2026-08-16; the sentinel watches the
  sponsor's own scientific software for validity-threatening commits.

### Tool integrations (host-tool credit)

- **Firecrawl Research Index** — `GET https://api.firecrawl.dev/v2/search/research/papers`,
  verified working **keyless** (~43M abstracts: PubMed/bioRxiv/medRxiv/arXiv).
  Literature corroboration step: when a detector fires, the agent looks
  up linked papers and reasons about which published claims are affected.
- **Paperclip** — hackathon-provided literature source, served by GXL's
  BioMedRxiv MCP server (469K+ bioRxiv/medRxiv preprints). Enabled when
  `PAPERCLIP_API_KEY` / `PAPERCLIP_API_URL` are set. Auth verified
  2026-08-16: the key works on `POST {base}/mcp` (JSON-RPC, `X-API-Key`
  header), **not** on `/api/shell` or `/tools/*`. Flow: `initialize` →
  `tools/call scholar_search` → `DELETE /sessions/{id}` (releases the
  slot). Currently blocked only by the server-wide session cap; degrades
  to Firecrawl until it clears. Both live behind one `literature.ts`
  adapter.
- **TinyFish Search** — `GET https://api.search.tinyfish.ai` (key in
  `.env`, free). Retraction-news corroboration (retractionwatch.com).
- **Qwen3.8 chain** — `agent.ts` is OpenAI-SDK-shaped and points at a free
  HF Inference Endpoint (`Qwen/Qwen3.8-27B`, keyless) with a TokenRouter
  fallback (`qwen/qwen3.8-max-free`). Override via `HF_QWEN_BASE_URL` /
  `HF_QWEN_MODEL` / `TOKENROUTER_*` (or keep `MOCK_AGENT=1` for
  deterministic replays).
- **Anthropic** (co-host) — `agent.ts` carries a ready-but-dormant Claude
  branch: set `ANTHROPIC_API_KEY` (from hackathon credits) and Claude
  becomes top-priority scorer via the Messages API (raw fetch, no SDK
  dependency), with the keyless HF endpoint as fallback. No other code
  changes needed.

## Architecture mapping — what changes, what doesn't

```
                        LENITNES[code] (today)    LENITNES[bio] (pivot)
Watch   monitors.url    crypto repos              science repos
        monitors.domain 'code' (default)          'bio'  (migration 008)
Detect  10 typed detectors              reuse as-is; + 2 bio detectors
Corroborate  CMC market context         literature.ts (Firecrawl/Paperclip)
Score   rubric-v5 (trade conviction)    rubric-v6 (scientific-risk conviction)
        action ∈ long|short|none        action ∈ alert|investigate|none
Gate    conviction ≥ 70/80              same thresholds
Commit  HCS notarization                same — alerts are the commitment
Track   price T+1h/1d/7d                discrete events: retraction/correction/
        (signal_outcomes.pct_change)    disclosure + date (event_* columns)
Replay  /backtest/replay?repo=…         same endpoint, domain=bio
```

### Migration 008 (applied, validated against fresh PG14)

```sql
-- db/migrations/008_science_domain.sql
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'code';
ALTER TABLE monitors ADD CONSTRAINT monitors_domain_check CHECK (domain IN ('code','bio'));

ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_kind   TEXT;  -- retraction|correction|disclosure|release
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_at     TIMESTAMPTZ;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS event_source TEXT;  -- retraction_watch|withdrarxiv|doi:…
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS lead_days    INTEGER;
```

A bio call is **CORRECT** if `event_at > detected_at` and the event kind
matches the alert class (method_fix alert → later retraction/correction
citing software error). Cleaner, less noisy than price — and exactly the
"reliable evaluation" the event asks for.

### Rubric v6 (bio)

Same input shape as v5 plus `literature_context` (Firecrawl/Paperclip
hits: title, DOI, year, abstract snippet). Output: `conviction`
(threat-to-published-results, 0–100), `action ∈ alert|investigate|none`,
`affected_claims[]` (DOI + figure/table + why), `thesis` citing commit
SHAs. Discipline carried over from v4: no evidence-free alerts, no
pile-ons.

## UX principles (clearer, less verbose, more compact)

Applies to BOTH verticals. The current site talks too much.

1. **Badges, not sentences.** Every call renders as one scannable line:
   `[bio] ALERT 88 · afni/afni · ✅ confirmed`. Domain, action,
   conviction, outcome — readable in under a second.
2. **One page, one question.** Scorecard = _is the agent right?_
   Signal = _what did it see and why?_ Case study = _prove it on a
   famous event._ Anything else is cut or collapsed.
3. **Progressive disclosure by default.** Thesis line visible; evidence,
   detector breakdown, literature hits, raw output expand on click.
   (Methodology page already does this — extend the pattern.)
4. **Half the copy.** Hero = one headline + one sentence. No re-explaining
   the engine on every page — link to `/methodology` once.

## UI / UX surfaces

### 1. Landing (`apps/web/src/app/page.tsx`)

- Hero headline: **"The agent that would have shorted halo2 — and would
  have flagged the 3dClustSim bug."** One sentence of sub-copy.
- Two case-study buttons with badges: `[code]` halo2 · `[bio]` clustsim.
- Recent calls: mono domain-badge prefix per row; bio rows show
  `ALERT`/`INVESTIGATE`, code rows show LONG/SHORT.
- Track-record strip: two compact number tiles — `[code]` hit ratio,
  `[bio]` precision + median lead time. Numbers only.

### 2. Bio case study (`apps/web/src/app/case-study/clustsim/page.tsx`)

Clone of `halo2/page.tsx`, new constants:

- Timeline: Apr 2015 baseline → May 12 fix commits → Jul 2016 Eklund
  "Cluster failure" (PNAS) → downstream retractions.
- Impact chart instead of price chart: affected-fMRI-literature growth
  (Eklund's ~40k-studies figure), agent alert date vs community
  discovery date marked.
- Replay from `/backtest/replay?repo=afni/afni&from=2015-04-01&to=2015-07-01&domain=bio`.
- Verdict card: `ALERT · conviction 88 — statistical-method fix in
cluster-size thresholding; published results using 3dClustSim p-values
at risk. Outcome: CONFIRMED (PNAS 2016).`

### 3. Scorecard (`scorecard.ts` route + page)

- `?domain=bio|code` tabs (default combined). `scorecard.overall()`
  gains a domain filter via `monitors.domain`.
- Per-vertical metric vocabulary: code keeps Sharpe/drawdown/P&L;
  bio shows **lead time** (median days alert → confirmed event) and
  **precision** (confirmed / total). Per-detector chart reused.
- Recent rows: badge + outcome pill (✅ CONFIRMED / ❌ UNCONFIRMED /
  ⏳ PENDING).

### 4. Signal page (`/signals/[id]`)

- Proof chain (commit evidence → detectors → thesis → HCS anchor)
  unchanged.
- Verdict card for bio signals: matched ground-truth event (retraction
  DOI + Retraction Watch link) or ⏳ PENDING.
- New collapsed section for bio: **Affected literature** — compact
  paper rows (year · title · DOI), expandable. Visual proof of
  "gathers evidence, uses relevant databases" for Track A judges.

### 5. Scan (`/scan`)

- Same engine (`/backtest/replay`), new framing: "Research integrity
  scan" — any public repo → its commit-history integrity timeline.
- Preset suggestions: afni/afni, nextstrain/ncov.

### 6. Methodology (`/methodology`)

- Bio detectors added to the grid with real afni commit examples.
- New sections: "Ground truth" (Retraction Watch / WithdrarXiv / dated
  disclosure events; why event scoring is stricter than price scoring)
  and "Literature corroboration" (Firecrawl + Paperclip in the evidence
  chain).

### 7. Calibration

- Reused unchanged with the domain filter; the weekend sample is small,
  so show the responsiveness sweep over the bio watchlist
  (`GET /backtest/responsiveness`) — it already ranks repos by
  historical signal→outcome coupling.

### 8. Telegram (`telegram-messages.ts` / `notify.ts`)

Compact bio format (3 lines max before the thesis):

```
LENITNES[bio] · ALERT 88 · afni/afni · method_fix
✅ confirmed +412d — Eklund et al., PNAS 2016 (cluster failure)
🔗 lenitnes.persidian.com/signals/<id>
```

- `formatSingleVerdictMessage` + digest gain a domain branch; code
  vertical keeps today's format unchanged.
- `VerdictBroadcastItem.recommendedAction` widens with `alert |
investigate`; bio items carry `leadTimeDays` + `confirmed` instead of
  `pctChange`.
- Triggers unchanged (on-signal ≥ gate, on-outcome-resolution).
  `fetchAssetCohortStats` → `fetchDomainCohortStats(domain, kind)`.

## Long-term vision (why this isn't a throwaway pivot)

### 1. Rigor for the GitHub-evaluation engine

Crypto outcomes (price) are noisy and confounded; retractions are
**binary, labelled, adjudicated ground truth** — the first oracle that
can properly calibrate detectors and rubrics. WithdrarXiv (14k
withdrawals + reason taxonomy) + the danielskatz list become a standing
evaluation set: detector false-positive rates against known-good repos,
rubric versions scored on confirmed-vs-not alerts, threshold calibration
with clean labels (`docs/CALIBRATION.md` discipline, better data).
Everything learned flows back into the code vertical — same detectors,
same gates, better tuned.

### 2. Biotech trading signals (when stocks enter the treasury)

The bio watchlist seeds an **equities signal source**, staying inside
the `[bio]` vertical — same repos, same alerts, second outcome oracle:

- Pathogen-surveillance spikes → vaccine/diagnostics exposure.
- Open-science biotech commits → research-direction signals ahead of
  press releases/preprints.
- Reproducibility alerts on code behind a company's published pipeline
  → negative equity signal.

Concretely: `asset_mapping` grows optional `{"ticker": "…"}` beside
`coingeckoId`; the chain-abstracted treasury gains an equities venue
when stock trading lands; the scorecard domain split becomes the
crypto/stocks split. The weekend build is this pipeline on paper
outcomes.

## File layout (weekend build)

```
File                                             Action    Purpose
────                                             ──────    ───────
db/migrations/008_science_domain.sql             [done]    monitors.domain, signal_outcomes event cols
db/migrations/009_agent_scores_bio.sql           [done]    agent_scores CHECK +alert/investigate, literature JSONB
db/seed/watchlist_bio.sql                        [done]    afni, nextstrain x2, opentrons, openmmtools, boltz
packages/types/src/index.ts                      [done]    MonitorDomain, domain on Monitor, AgentAction +alert/investigate, SignalType +method_fix/results_rewrite, LiteratureRef, event fields
apps/api/src/services/agent/rubric-v6.md         [done]    bio conviction rubric
apps/api/src/services/agent.ts                   [done]    rubric by domain; literature_context input; literature persisted/fetched
apps/api/src/services/literature.ts              [done]    Firecrawl research index adapter (keyless) + Paperclip stub
apps/api/src/services/detectors/method-fix.ts    [done]    stats/analysis-code fix detector (verified: fires on afni 2baf5710)
apps/api/src/services/detectors/results-rewrite.ts [done]  results/figures/data edit detector
apps/api/src/services/detectors/registry.ts      [done]    bio detectors registered, domain-gated
apps/api/src/services/scorecard.ts + route       [done]    ?domain=bio → bio() event metrics (precision, lead time)
apps/api/src/services/replay.ts + routes/backtest [done]   domain param; bio skips price outcomes; /backtest/replay/clustsim
apps/api/src/services/notify.ts                  [done]    bio broadcast branch (🔬 LENITNES[bio], literature rows, event verdict)
apps/web/src/app/page.tsx                        [done]    dual-vertical hero + [code]/[bio] badges + clustsim CTA
apps/web/src/app/case-study/clustsim/page.tsx    [done]    bio founding case study (lead-time visual, ground truth, literature)
apps/web/src/app/scorecard/page.tsx              [done]    [code]/[bio] tabs; bio metrics + alerts table
apps/web/src/app/scan/page.tsx                   [done]    [code]/[bio] toggle, bio presets, bioOutcome rows
apps/web/src/app/methodology/MethodologyClient   [done]    [bio] integrity-detectors section
apps/web/src/components/Nav.tsx                  [done]    Case study [code] / [bio] links
apps/api/src/db/migrate-followup.ts              [done]    0009 migration entry
docs/RAGENT_PIVOT.md                             [this]
```

Net new code ≈ 6 files; everything else is branches/params on tested
paths. No changes to treasury, trading venues, x402, or proofs.

## Weekend timeline

| When            | Block                                                                           | Status                                                |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Sat 10:25–12:10 | Register Track A; ask organizers for Paperclip key; confirm Boltz repo location | key + repo still open                                 |
| Sat 13:00–15:30 | Migration 008 + bio watchlist + rubric v6 + domain wiring in types/agent/replay | ✅                                                    |
| Sat 15:30–18:30 | Two bio detectors + literature.ts (Firecrawl first) + event-outcome scoring     | ✅                                                    |
| Sat 19:15–22:00 | afni replay end-to-end → case-study page → scorecard tabs                       | ✅ (mock + live: credits unblocked via Qwen chain)    |
| Sat 22:00–23:00 | Telegram bio format; freeze scope                                               | ✅ format done, first live send pending               |
| Sun 9:00–10:45  | Landing hero, methodology sections, README paragraph, submit by 10:45           | ✅ hero/methodology/README done — submit prep remains |

## Exit criteria

- [x] `afni/afni` 2015 Q2 replay flags `2baf5710` (detector verified live; curated `CLUSTSIM_REPLAY` constant carries conviction 88 / alert)
- [x] Alert HCS-notarized and visible at `/signals/<id>` with literature rows (literature column + AgentReasoningCard section)
- [x] `/case-study/clustsim` renders replay verdict + timeline + outcome
- [x] `/scorecard?domain=bio` returns precision + lead-time metrics
- [x] Bio-formatted Telegram branch implemented (notify.ts); first live send at event
- [x] Bio watchlist (5 repos) seeded with `domain='bio'`, validated on fresh PG14
- [x] Code vertical unchanged and green (`typecheck` + 262 tests + `next build` 13/13)

## Risks

| Risk                                                | Mitigation                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| afni replay detectors don't fire on the fix commits | Broaden keywords first (30 min); fallback: canonical `CLUSTSIM_REPLAY` constant like `HALO2_REPLAY` — narrative is the demo, live loop proves generalization  |
| Paperclip key not ready in time                     | Firecrawl verified keyless; ship with it, Paperclip as "also supported"                                                                                       |
| No bio outcome matures by Sunday                    | All demo outcomes are retrospective (replay), like halo2 — nothing waits on real time                                                                         |
| Judges read it as "crypto project in a lab coat"    | Lead with evaluation story (committed predictions, discrete ground truth, self-scoring); crypto is the _second_ case study, framed as cross-domain validation |
| Solo overrun                                        | Cut order fixed: detectors → literature → Telegram → landing copy. Case-study page + replay never cut                                                         |
