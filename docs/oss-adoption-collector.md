# OSS Adoption — Reproducible History Collection (G1)

> **Status:** Research collector — passes tests on the pilot corpus and produces
> auditable run manifests + quality reports. No trading decisions, Alpaca, or
> brokerage integration.
> **Related docs:** [`oss-adoption-corpus.md`](oss-adoption-corpus.md) (corpus definition),
> [`oss-adoption-trading.md`](oss-adoption-trading.md) (signal proposal)
> **Created:** 2026-08-29

## What it does

The collector walks each repository in the curated corpus over an explicit UTC
observation window, fetches the commit history for each expected manifest path,
parses the manifest at each commit, and diffs consecutive snapshots to emit
normalized `DependencyEvent`s. The first in-window snapshot is a baseline (no
events from it), so packages added before the window are not mislabeled as
added.

**Contract** (from `oss-adoption-corpus.md`):
- A failed fetch is a missing observation, never silent zero adoption.
- Truncated history and rate limits are recorded as warnings.
- The quality report is the auditable artifact of every run.

## How to run

### Prerequisites

- **Node 20+** with `tsx` (installed as a devDependency in the api workspace).
- A `GITHUB_TOKEN` environment variable. Without it, the collector runs at 60
  req/h (unauthenticated), which will truncate most runs. With it, the 5000
  req/h quota covers the full 12-month corpus.

### Command

```bash
# From the api workspace root:
cd apps/api

# Default: trailing 12 months, 3 pages per manifest, output to data/oss-adoption/
GITHUB_TOKEN=ghp_xxx npx tsx scripts/collect-oss-adoption.ts

# Explicit window, output to /tmp
GITHUB_TOKEN=ghp_xxx npx tsx scripts/collect-oss-adoption.ts \
  --since 2025-08-01T00:00:00Z \
  --until 2026-08-01T00:00:00Z \
  --out /tmp/oss-adoption

# More commit history per manifest (5 pages = 500 commits)
GITHUB_TOKEN=ghp_xxx npx tsx scripts/collect-oss-adoption.ts --max-pages 5
```

### npm script

```bash
GITHUB_TOKEN=ghp_xxx npm run collect:oss-adoption
```

### Arguments

| Argument | Default | Description |
|---|---|---|
| `--since` | now − 12 months | UTC start of the observation window |
| `--until` | now | UTC end of the observation window |
| `--max-pages` | 3 | Pages of 100 commits per manifest path (cap) |
| `--out` | `data/oss-adoption/` | Output directory for the run JSON file |

## Output format

Every run produces one JSON file at `<out>/<runId>.json` containing three
top-level keys:

```json
{
  "runManifest": { /* run metadata, observation window, per-repo summary */ },
  "events": [ /* normalized DependencyEvent[] */ ],
  "qualityReport": { /* OssQualityReport from the G0 contract */ }
}
```

### Run manifest fields

| Field | Description |
|---|---|
| `runId` | Unique run identifier (`oss-adoption-<timestamp>`) |
| `corpusVersion` | Frozen corpus version string |
| `observationWindow` | `{ sinceIso, untilIso }` — the explicit UTC window |
| `runStartedAt` / `runFinishedAt` | Wall-clock timestamps |
| `githubTokenConfigured` | Whether a token was provided |
| `rateLimit` | Snapshot of `x-ratelimit-*` headers from the last API call |
| `repositories` | Per-repo records (status, commits, manifests, events, errors) |
| `warnings` | All run-level warnings (truncation, branch mismatch, archived repos) |

### Quality report (OssQualityReport)

Includes the aggregated counts from the G0 contract:
- `repositoriesRequested`, `repositoriesCompleted`, `repositoriesFailed`
- `commitsExamined`, `eventsExtracted`
- `duplicateEventsRemoved`, `mappedEvents`, `unmappedEvents`
- `mappingConfidence` breakdown
- `warnings` array

The quality report is the auditable artifact. To preserve a run, commit the
`runManifest` and `qualityReport` sections into `docs/` (the full events array
is large and can be omitted).

## First pilot run (2026-08-29)

### Parameters

- **Corpus:** 5 starter repositories (googleapis/google-cloud-node,
  Azure/azure-sdk-for-js, aws/aws-sdk-js-v3, vercel/next.js, pallets/flask)
- **Window:** 2025-08-29 → 2026-08-29 (12 months)
- **Max pages:** 3 per manifest path
- **Token:** GitHub API token (5000 req/h quota)

### Results

| Metric | Value |
|---|---|
| Repositories completed | 5/5 (0 failed) |
| Commits examined | 316 |
| Events extracted | 1710 |
| Mapped events | **0** |
| Unmapped events | 1710 |
| Duplicate events removed | 0 |
| Rate limit consumed | ~2151 of 5000 |

### Key findings

1. **0 mapped events is honest data, not a bug.** The starter corpus repos are
   SDK *sources* (google-cloud-node, azure-sdk-for-js, aws-sdk-js-v3), not
   consumers. Their root `package.json` files don't depend on `@google-cloud/*`,
   `@azure/*`, or `@aws-sdk/*` packages — those live in sub-packages or aren't
   used by the source repo itself. To produce adoption signal, the corpus must
   include repos that *consume* these SDKs. The quality report correctly surfaces
   this as a coverage gap, which is exactly the purpose of G1.

2. **Upgrade/downgrade classification is string-based.** The `downgraded` count
   (788 events) is inflated by next.js experimental version pin strings
   (e.g. `0.0.0-experimental-abc` → `0.0.0-experimental-xyz`), where lexical
   string comparison is meaningless. A future refinement should use semver-aware
   comparison or mark experimental-pinned versions as "changed" rather than
   "upgraded/downgraded".

3. **Truncation was not triggered** for the 12-month window at 3 pages (300
   commits per path). Next.js consumed 226 of the 316 total commits and filled
   ~2 pages. The 3-page default is adequate for the current corpus but may need
   adjustment for busier repos.

4. **The collector recovers from network issues.** Rate-limit retries and
   per-repo failure isolation worked correctly in the mock tests.

### Second pilot run (expanded corpus, 2026-08-29)

Corpus version `2026-08-29-pilot-v2` (10 repos: 3 SDK sources + 5 consumer
repos + 2 controls). Same 12-month window, 3 pages per manifest.

| Metric | Value |
|---|---|
| Repositories completed | 10/10 (0 failed) |
| Commits examined | 1362 |
| Events extracted | 3858 |
| **Mapped events** | **53 (high confidence: 43 AMZN, 7 MSFT, 3 GOOGL)** |
| Unmapped events | 3805 |
| Truncation warnings | 3 (promptfoo, wekan, lobehub hit the 3-page cap) |

The consumer expansion worked as intended: mapped events now come from
`lobehub/lobehub`, `promptfoo/promptfoo`, and `wekan/wekan` changing their
`@aws-sdk/*`, `@azure/*`, and `@google-cloud/*` dependencies over the window.
The AMZN skew (43/53) reflects that two of the five consumers are heavy AWS SDK
users. `nocodb/nocodb` contributed 0 events despite having @azure/identity in
its root manifest — its package.json dependency block was stable across the 16
in-window commits that touched the file (a coverage observation, not a bug).

The pilot also makes the **string-based version comparison** concrete:
`@aws-sdk/client-bedrock-runtime ^3.941.0 → ^3.1076.0` is reported as
"downgraded" because lexical comparison sees `9 > 1`. ~~Semver-aware diffing
is the next correctness fix.~~ ✅ **Fixed in `2026-08-29`**: `compareVersions`
strips range prefixes and compares numerically; unparseable versions (range
specifiers, alias specs, experimental hash pins) are reported as a neutral
`changed` rather than a misleading upgrade/downgrade. Re-running the expanded
corpus with the fix: 581 added, 931 upgraded, 246 downgraded, 507 removed,
1593 changed (previously the downgraded count was inflated by lexical
misclassification).

### Recommended next steps

- ~~**Expand the corpus** to include 10–20 consumer repos that use the mapped
  packages.~~ ✅ Done in version `2026-08-29-pilot-v2` (5 consumer repos added).
- ~~**Run the collection against the expanded corpus** and verify that mapped
  events are now produced.~~ ✅ Done — 53 mapped events (43 AMZN, 7 MSFT, 3 GOOGL).
- ~~**Add semver-aware diffing** so version changes are classified correctly.~~ ✅ Done.
- **Collect weekly curves** from the expanded corpus and overlay with stock prices
  (Phase 0 of the backtest plan in `oss-adoption-trading.md`).

## Validation boundary

The dataset may be used for exploratory curves and pre-registered tests only
after the quality report is reviewed. The gates are unchanged from the corpus
document:

| Gate | Description | Status |
|---|---|---|
| **G0 — Data quality** | Reliable identification, deduplication, auditable mappings | ✅ Validated |
| **G1 — Historical signal** | Adoption curves vs stock-price outcomes | ⏳ Corpus needs expansion |
| **G2 — Agent usefulness** | Agent scoring improves selectivity | Pending |
| **G3 — Paper viability** | Conservative paper strategy | Pending |
| **G4 — Alpaca decision** | Go/no-go for brokerage integration | Pending |

Until G4 is a positive decision, Alpaca remains downstream context — not a
dependency of the collector or the research dataset.
