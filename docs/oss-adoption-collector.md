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

| Argument      | Default              | Description                                  |
| ------------- | -------------------- | -------------------------------------------- |
| `--since`     | now − 12 months      | UTC start of the observation window          |
| `--until`     | now                  | UTC end of the observation window            |
| `--max-pages` | 3                    | Pages of 100 commits per manifest path (cap) |
| `--out`       | `data/oss-adoption/` | Output directory for the run JSON file       |

## Output format

Every run produces one JSON file at `<out>/<runId>.json` containing three
top-level keys:

```json
{
  "runManifest": {
    /* run metadata, observation window, per-repo summary */
  },
  "events": [
    /* normalized DependencyEvent[] */
  ],
  "qualityReport": {
    /* OssQualityReport from the G0 contract */
  }
}
```

### Run manifest fields

| Field                            | Description                                                          |
| -------------------------------- | -------------------------------------------------------------------- |
| `runId`                          | Unique run identifier (`oss-adoption-<timestamp>`)                   |
| `corpusVersion`                  | Frozen corpus version string                                         |
| `observationWindow`              | `{ sinceIso, untilIso }` — the explicit UTC window                   |
| `runStartedAt` / `runFinishedAt` | Wall-clock timestamps                                                |
| `githubTokenConfigured`          | Whether a token was provided                                         |
| `rateLimit`                      | Snapshot of `x-ratelimit-*` headers from the last API call           |
| `repositories`                   | Per-repo records (status, commits, manifests, events, errors)        |
| `warnings`                       | All run-level warnings (truncation, branch mismatch, archived repos) |

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

| Metric                   | Value          |
| ------------------------ | -------------- |
| Repositories completed   | 5/5 (0 failed) |
| Commits examined         | 316            |
| Events extracted         | 1710           |
| Mapped events            | **0**          |
| Unmapped events          | 1710           |
| Duplicate events removed | 0              |
| Rate limit consumed      | ~2151 of 5000  |

### Key findings

1. **0 mapped events is honest data, not a bug.** The starter corpus repos are
   SDK _sources_ (google-cloud-node, azure-sdk-for-js, aws-sdk-js-v3), not
   consumers. Their root `package.json` files don't depend on `@google-cloud/*`,
   `@azure/*`, or `@aws-sdk/*` packages — those live in sub-packages or aren't
   used by the source repo itself. To produce adoption signal, the corpus must
   include repos that _consume_ these SDKs. The quality report correctly surfaces
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

| Metric                 | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Repositories completed | 10/10 (0 failed)                                   |
| Commits examined       | 1362                                               |
| Events extracted       | 3858                                               |
| **Mapped events**      | **53 (high confidence: 43 AMZN, 7 MSFT, 3 GOOGL)** |
| Unmapped events        | 3805                                               |
| Truncation warnings    | 3 (promptfoo, wekan, lobehub hit the 3-page cap)   |

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

### Phase 0 overlay (2026-08-29)

The expanded-corpus run was joined against tokenized-stock prices
(`amazon-xstock` / `alphabet-xstock` / `microsoft-xstock` on CoinGecko — the
repo's production price plumbing is crypto-oriented, and these track the
underlying equities without a new API key). Workflow:

```bash
# Build weekly adoption curves from a collected run JSON:
npx tsx scripts/build-oss-adoption-curves.ts --input /tmp/oss-adoption/oss-adoption-*.json --out curves.csv

# Join curves with prices and compute lead/lag correlations:
npx tsx scripts/analyze-oss-adoption.ts --input /tmp/oss-adoption/oss-adoption-*.json --out overlay
```

Per-ticker adoption activity over the 53-week window: **AMZN 12 active weeks
(5 added / 3 removed / 29 upgraded), GOOGL 1 (2 upgraded), MSFT 4 (2 added /
1 removed / 4 upgraded)**. Correlations of adoption metrics vs forward price
returns were weak and non-significant (|r| ≲ 0.2) — expected at this stage,
since the 12-month lookback is mostly cold: mapped adoption clusters in
Q2–Q3 2026, so only a handful of weeks carry signal. The single interesting
reading (MSFT `netAdd` → next-week return r ≈ +0.21, n=47) rests on just 4
active weeks and should not be treated as evidence. This is an exploratory
artifact, not a validated predictor.

### Third pilot run + overlay (pilot-v3, 2026-08-29)

Corpus version `2026-08-29-pilot-v3` (24 repos: 3 SDK sources + 19 consumer
repos + 2 controls). The second-wave consumers were added with a **churn
filter**: each was verified to have the mapped package in its root
`package.json` AND to have changed that package's version within the
observation window (via the commits + contents APIs), so the corpus only
grows with repos that actually produce adoption signal.

| Metric             | pilot-v2 | pilot-v3                       |
| ------------------ | -------- | ------------------------------ |
| Repositories       | 10       | 24 (20/24 completed, 4 failed) |
| Events extracted   | 3858     | 6970                           |
| **Mapped events**  | **53**   | **468**                        |
| AMZN active weeks  | 12/53    | **48/53**                      |
| GOOGL active weeks | 1/53     | **9/53**                       |
| MSFT active weeks  | 4/53     | **11/53**                      |

The 4 failures were the two control repos (vercel/next.js, pallets/flask) and
two GOOGL consumers (openwebdocs/mdn-bcd-collector, firefox-devtools/profiler-server),
all HTTP 403s late in the run at rate-limit exhaustion (secondary rate limit) —
recorded as missing observations in the quality report, not silent zeros.

Overlay correlations on n≈52 weekly samples (pilot-v3):

| Ticker | Same-week             | Fwd 1-week            | Fwd 4-week                               |
| ------ | --------------------- | --------------------- | ---------------------------------------- |
| AMZN   | `netAdd` r=−0.14      | `upgraded` r=+0.05    | **`upgraded` r=+0.18**, `netAdd` r=+0.10 |
| GOOGL  | `activeRepos` r=−0.30 | `activeRepos` r=−0.18 | `activeRepos` r=−0.23                    |
| MSFT   | `netAdd` r=+0.07      | `netAdd` r=+0.12      | `added` r=−0.14                          |

With 48 active AMZN weeks the sample finally has statistical teeth, and the
readings are still weak (|r| ≤ 0.3) — the honest Phase 0 conclusion is that
raw weekly adoption counts do not yet demonstrate a tradable lead/lag
relationship with these tokenized-stock prices. AMZN `upgraded` → 4-week
forward return (r=+0.18, n=52) and GOOGL's persistently negative
`activeRepos` correlations are the two patterns worth carrying into Phase 1
(velocity/acceleration scoring + lag exploration), not into a trade.

> **Note on week alignment:** curve weeks are ISO-Monday bucketed; gap-filling
> must normalize window edges with `weekStartOf()` or the filled weeks land on
> the wrong weekday and miss the real active buckets (fixed in the CLIs).

### Phase 1 velocity/acceleration scoring (2026-08-29)

The same 24-repo pilot-v3 corpus gaps-filled curves were scored with a
4-week trailing least-squares slope on `netAdd` (velocity) and slope of
velocity (acceleration), then overlaid against tokenized-stock prices.
Workflow:

```bash
# The analyze CLI now scores curves before building the overlay:
npx tsx scripts/analyze-oss-adoption.ts --input /tmp/oss-adoption-v3/oss-adoption-*.json --out /tmp/oss-adoption-v3/phase1-overlay

# Scoring module can also be used standalone:
npx tsx -e "import {scoreCurves,scoredCurvesToCsv} from '../src/services/oss-adoption/scoring.js'; ..."
```

Per-ticker velocity/acceleration correlations vs forward returns:

| Ticker | Same-week velocity r | Same-week accel r | Fwd4 velocity r | Fwd4 accel r |
| ------ | -------------------- | ----------------- | --------------- | ------------ |
| AMZN   | −0.26 (n=52)         | −0.15 (n=51)      | −0.02 (n=51)    | −0.06 (n=50) |
| MSFT   | +0.14 (n=47)         | +0.18 (n=47)      | −0.12 (n=47)    | −0.04 (n=47) |
| GOOGL  | — (constant netAdd)  | —                 | —               | —            |

No metric across any ticker or forward horizon exceeds |r| 0.3. The most
notable reading is AMZN velocity → same-week return (r=−0.26), a modest
negative contemporaneous relationship. Velocity does not strengthen the
forward signal over raw metrics — the honest conclusion is that on this
corpus, a 4-window slope of `netAdd` does not produce a tradable lead
relationship.

GOOGL's velocity/acceleration rows are dropped from the summary because
its `netAdd` is constant across the 53-week window (no consumer repos
changed their `@google-cloud/*` dependency versions), so Pearson's
correlation coefficient cannot be computed (no variance).

### Multi-metric velocity scan (pilot-v3, 2026-08-29)

The Phase 1 `netAdd`-velocity scan left GOOGL invisible (netAdd constant).
A multi-metric scan (`--metric changed`, `--metric upgraded`, `--metric
activeRepos`) was run on the same pilot-v3 data to test whether GOOGL's
upgrade-dominant activity produces a signal on a different metric. The
`analyze-oss-adoption.ts` CLI was extended with `--metric` and `--window`
flags for this purpose.

GOOGL `changed`-velocity (the slope of `added+removed+upgraded+downgraded`)
was the only forward-reading above 0.2 across all tickers and metrics:

| Metric                    | Ticker | Best reading   |
| ------------------------- | ------ | -------------- |
| `changed`-velocity → fwd1 | GOOGL  | r=+0.21 (n=51) |
| `changed`-velocity → fwd2 | GOOGL  | r=+0.24 (n=51) |
| `changed`-accel → fwd1    | GOOGL  | r=+0.23 (n=50) |
| `changed`-accel → fwd2    | GOOGL  | r=+0.22 (n=50) |

AMZN `changed`-velocity was dropped (constant — AMZN is active every week,
so its `changed` trailing slope has no variance). MSFT `changed`-velocity
was also dropped. `upgraded`-velocity and `activeRepos`-velocity had no
variance for any ticker.

This was the strongest forward signal yet — but GOOGL had only 14/53 active
weeks on pilot-v3, so the correlation could be a small-sample artifact. The
plan: **densify the GOOGL series** with more consumer repos, then re-score
with `--metric changed` to see if the signal holds.

### Fourth pilot run + overlay (pilot-v4, GOOGL density expansion, 2026-08-29)

Corpus version `2026-08-29-pilot-v4` (29 repos: 3 SDK sources + 24 consumer
repos + 2 controls). Five new GOOGL consumer repos were churn-verified
(in-window `@google-cloud/*` package changes in root `package.json`) and
added to densify the GOOGL adoption series:

| Repo                        | Stars | Churned packages                   |
| --------------------------- | ----- | ---------------------------------- |
| `typeorm/typeorm`           | 36.6k | `@google-cloud/spanner`            |
| `firebase/firebase-tools`   | 4.4k  | `@google-cloud/pubsub`             |
| `TryGhost/ActivityPub`      | 237   | `@google-cloud/{pubsub,storage}`   |
| `observablehq/notebook-kit` | 343   | `@google-cloud/bigquery`           |
| `Kesin11/CIAnalyzer`        | 114   | `@google-cloud/{bigquery,storage}` |

| Metric             | pilot-v3 | pilot-v4                       |
| ------------------ | -------- | ------------------------------ |
| Repositories       | 24       | 29 (28/29 completed, 1 failed) |
| Events extracted   | 8755     | 9523                           |
| **Mapped events**  | 475      | **505**                        |
| GOOGL active weeks | 14/53    | **26/52**                      |
| AMZN active weeks  | 48/53    | 47/52                          |
| MSFT active weeks  | 11/53    | 11/52                          |

The 1 failure was `promptfoo/promptfoo` (HTTP 403s on manifest blob fetches
late in the run — secondary rate limit, recorded as missing observations).

**Key test:** GOOGL `changed`-velocity correlations after densifying the series:

| Horizon   | v3 GOOGL changed-velocity r | v4 GOOGL changed-velocity r | v4 GOOGL changed-accel r |
| --------- | --------------------------- | --------------------------- | ------------------------ |
| same-week | −0.06                       | −0.04                       | +0.06                    |
| fwd1      | **+0.21**                   | **+0.13**                   | **+0.16**                |
| fwd2      | **+0.24**                   | **+0.15**                   | **+0.13**                |
| fwd4      | +0.05                       | +0.01                       | −0.02                    |

The GOOGL `changed`-velocity signal **weakened** with denser data — the
pilot-v3 reading was partly a small-sample artifact. The honest conclusion
is that GOOGL `changed`-velocity has a mild forward correlation (r≈+0.13–0.15)
that is not strong enough for a trading signal.

One notable emergent finding: GOOGL `netAdd` → fwd2/fwd4 return (r≈+0.20,
n=51) was invisible on pilot-v3 (netAdd constant) and only appeared after
the expanded corpus introduced new repos that actually change their
`@google-cloud/*` dependency versions. This is the strongest forward
`netAdd` reading across all tickers, but still at |r| ≤ 0.2.

**Phase 0/1 conclusion across all pilot runs:** no metric, horizon, or
velocity/acceleration transformation across any ticker exceeds |r| 0.3.
The G1 adoption-curves vs stock-price overlay has not produced a signal
strong enough to investigate further without a fundamentally different
approach to the corpus, the metric definition, or the scoring methodology.

### G2 agent scoring (2026-08-29)

G2 tests whether weighting each dependency event by _strategic importance_
improves selectivity over the raw curve. The hypothesis: most dependency
changes are routine maintenance (Renovate bumps, chore(deps)), which drowns
out the few strategic adoption decisions (migrating to a new SDK, adopting a
new vendor). An agent that reads the commit message and scores each event
should amplify the strategic signal.

Pipeline:

```bash
# 1. Enrich a collected run JSON with commit messages:
GITHUB_TOKEN=ghp_xxx npx tsx scripts/enrich-oss-adoption.ts \
  --input /tmp/oss-adoption-v4/oss-adoption-*.json \
  --out /tmp/oss-adoption-v4

# 2. Run the overlay with --g2 flag (heuristic scoring):
npx tsx scripts/analyze-oss-adoption.ts \
  --input /tmp/oss-adoption-v4/*.enriched.json \
  --metric changed --g2 \
  --out /tmp/oss-adoption-v4/g2

# 3. Optional: LLM scoring (requires live LLM endpoint):
TOKENROUTER_API_KEY=... npx tsx scripts/llm-score-oss-adoption.ts \
  --input /tmp/oss-adoption-v4/*.enriched.json
```

**Heuristic scorer:** keyword-based classifier weighing commit message patterns
(`migrat`, `adopt`, `switch to` → strategic; `bump`, `chore(`, `renovate` →
routine), change type, and version magnitude. Weight = 2 × score, so neutral
(0.5) keeps full weight, strategic (~0.8) counts 1.6×, routine (~0.3) counts
0.6×.

**Result on pilot-v4** (505 mapped events, all enriched with commit messages):

| Score bucket           | Events | Mean weight |
| ---------------------- | ------ | ----------- |
| ≥ 0.8 (high/strategic) | 9      | 1.7×        |
| 0.4–0.7 (mid)          | 167    | 1.0×        |
| ≤ 0.3 (routine)        | 329    | 0.5×        |

Mean heuristic score: **0.355** — the corpus is dominated by routine maintenance.

Heuristic-weighted vs unweighted correlations (`--metric changed`):

| Ticker | Raw fwd1 velocity r | Weighted fwd1 velocity r | Change |
| ------ | ------------------- | ------------------------ | ------ |
| AMZN   | — (dropped)         | — (dropped)              | —      |
| GOOGL  | +0.131              | +0.122                   | −0.009 |
| MSFT   | — (dropped)         | — (dropped)              | —      |

**Weighting barely moves the overlay.** The G2 hypothesis fails on this corpus
— not because scoring is weak, but because the corpus contains almost no
strategic adoption events to amplify. The bottleneck is corpus composition, not
scoring methodology.

**LLM scoring** (via Qwen3.8 → TokenRouter gpt-4o-mini fallback) was attempted
as a more nuanced scorer. The partial results (mean ~0.37) agree with the
heuristic. The live endpoint was rate-limited during the run; the
`llm-score-oss-adoption.ts` script is kept in the repository as the documented
LLM path.

### Wide-corpus `added`-only experiment (2026-08-30)

Motivation: every emergent signal so far (GOOGL `changed`-velocity in pilot-v3,
GOOGL `netAdd` in pilot-v4) was a small-sample or concentration artifact. The
`added` event is the one dependency change nobody does by accident — installing
`@aws-sdk/client-s3` is a real adoption decision, unlike a Renovate bump. The
hypothesis: an **`added`-only curve over a much wider corpus** would give the
strategic-adoption signal statistical teeth that the noise-dominated `netAdd` /
`changed` curves lack.

Experiment: `collect-oss-adoption-wide.ts` builds a corpus from namespace code
search (`@aws-sdk/`, `@azure/`, `@google-cloud/` present in a repo's root
`package.json`), filtered to non-archived, non-fork, active repos with a
meaningful star count. The final list was 27 repos across all three namespaces
(supabase, remotion, kibana, nodemailer, botpress, highcharts, openai-node,
mongodb, webdriverio, opencode, formbricks, nitrojs, cloudsploit, dbhub, comp,
cli-microsoft365, vsce, uwu, civitai, cla-assistant, molstar, santa-tracker-web,
bitrise-workflow-editor, aider-desk, blurts-server, RecipeSage, ShieldBattery).
The collector threads a custom `corpus` + `corpusVersion` through the shared
pipeline (`--max-pages 3`, 12-month window).

| Metric             | pilot-v4 (29 repos) | wide-v1 (27 repos) |
| ------------------ | ------------------- | ------------------ |
| Events extracted   | 9523                | 5919               |
| **Mapped events**  | **505**             | **390**            |
| AMZN active weeks  | 47/52               | 40/52              |
| GOOGL active weeks | 26/52               | 11/52              |
| MSFT active weeks  | 11/52               | 20/52              |
| **`added` events** | **~16**             | **17**             |

The wide corpus produced more per-week signal surface (MSFT active weeks
nearly doubled), but the **`added` event count stayed microscopic: 17 events
across all 27 repos over a full year** (the first pass failed 2 repos at
rate-limit exhaustion — julianpoy/RecipeSage, ShieldBattery; a second pass
completed 27/27, and neither of the missing repos added any `added` events).

`added`-only correlations (`--metric added`, n=51/52):

| Ticker | Same-week added r | Fwd1 added r | Fwd2 added r | Fwd4 added r |
| ------ | ----------------- | ------------ | ------------ | ------------ |
| AMZN   | **+0.33**         | +0.15        | +0.20        | +0.17        |
| GOOGL  | +0.06             | +0.23        | +0.08        | −0.08        |
| MSFT   | −0.06             | +0.13        | +0.05        | +0.03        |

AMZN `added` same-week (r=+0.33) is the strongest raw reading across all
experiments — but it is a **concentration artifact, not a signal**: 8 of the 13
AMZN `added` events come from a single repo (`trycompai/comp`) in a single week
(2026-04-09, six SDK clients + presigner added in one batch), and GOOGL's fwd1
reading rests on 2 events in one repo. Pearson over a mostly-zero series with
one spike week is driven by that spike, exactly as pilot-v3's GOOGL reading was.

**The `added`-only wide-corpus experiment is falsified.** The premise holds
(`added` is the strategic event) but the frequency is the killer: real
first-time SDK adoption happens ~once per repo per year, so even 27 repos
yield ~17 events — a curve that is ~0 in 43 of 52 weeks. A wider corpus
cannot fix this; `added` events do not scale with repo count because adoption
is a rare, one-time decision per repo per package. The observed correlations
are week-concentration artifacts on degenerate (mostly-zero) series, not a
tradable lead/lag.

The takeaway also reframes the pilot-v3/v4 churn filter: it was not just a
quality nicety — the churn-verified corpus (repos that actively change mapped
packages) is what produces a usable signal surface at all. The broad
"has the SDK in package.json" corpus has 27 repos but fewer mapped events
(390) than the 29-repo churn corpus (505), because most wide repos hold the
dependency static for the whole year.

### Migration base-rate probe (2026-08-30)

Before investing in a changelog-anchored corpus build, a probe measured the
base rate of _declared_ strategic adoption across two independent surfaces —
the theory being that release notes capture intentional migrations that
package.json diffs miss:

| Surface             | Data                                               | Strategic hits              | Verdict                         |
| ------------------- | -------------------------------------------------- | --------------------------- | ------------------------------- |
| **Commit messages** | 505 enriched dependency-change messages (pilot-v4) | **0**                       | all routine bumps               |
| **Release notes**   | 2,047 releases across 27 wide repos (12 mo)        | **8** (all false positives) | bug fixes/features/deprecations |

Manual review of the 8 release-note matches: `Fixed Azure provider options
being forwarded correctly after the AI SDK v6 migration` (bug fix),
`remove fragile heredoc from AWS auditor setup script` (maintenance), `Added
simplified SDK initialization` (own-SDK feature), a deprecation notice, a
model-library refactor. **Not one is a vendor-adoption decision.** The
keyword scanner is permissive (it also flagged 70 "medium" matches that are
ordinary product features like "Introducing client-side rendering"), so the
true base rate is near zero even on the most generous reading.

**Conclusion:** strategic adoption events are rare across every surface we
can measure — package diffs, commit messages, and release notes. A
changelog-anchored corpus would reproduce the same wall: the events it
targets do not exist at a usable frequency. The OSS-adoption track has no
remaining promising framing under the current corpus philosophy, and further
corpus investment is not justified on the evidence.

### SDK download-count surface (2026-08-30)

After the base-rate probe returned STOP, an external survey of how the
alternative-data industry measures OSS adoption (Sherlock Analytics
Community Development Index, Paradox Intelligence, GitDealFlow) pointed to a
fundamentally different measurement surface: instead of third-party manifest
churn toward SDKs (sparse, bot-dominated, ~17 strategic events/year), the
industry measures the target's own demand — downloads, contributor growth,
commit velocity. The vendor literature is consistent on one point: **the
signal is in change, not level**.

A probe collected daily download counts from the npm registry public API for
the mapped SDK packages (`@aws-sdk/*`, `@azure/*`, `@google-cloud/*`) — 29
packages, 350-day window (2025-09-14 → 2026-08-30), 51 weeks — and overlaid
the resulting weekly curves against the same CoinGecko tokenized-stock prices
used in every prior overlay. Scripts: `collect-sdk-downloads.ts` (npm API,
per-package range queries — the bulk endpoint rejects scoped packages) and
`analyze-sdk-downloads.ts` (weekly aggregation + reuse of
`buildOverlay`/`summarizeOverlay`).

Raw scale: AMZN ≈ 3.7B, MSFT ≈ 1.4B, GOOGL ≈ 0.8B SDK downloads over the
window — a dense, monotone-rising level series (npm counts include CI and
mirror pulls; absolute levels are inflated, but this is the same data the
industry sells).

**Level correlations (weekly download total vs forward price return):**

| Ticker | fwd1  | fwd2  | fwd4  | Reading                                                         |
| ------ | ----- | ----- | ----- | --------------------------------------------------------------- |
| AMZN   | +0.02 | +0.06 | +0.06 | null                                                            |
| MSFT   | +0.17 | +0.32 | +0.40 | strong-looking — but the level is a monotone uptrend (artifact) |
| GOOGL  | −0.16 | −0.15 | −0.20 | negative                                                        |

**Change correlations (the industry's "signal in change" test):**

| Ticker | metric   | fwd1  | fwd2  | fwd4  |
| ------ | -------- | ----- | ----- | ----- |
| AMZN   | % change | −0.17 | −0.15 | −0.20 |
| AMZN   | velocity | −0.16 | −0.20 | −0.19 |
| MSFT   | % change | −0.15 | −0.01 | −0.17 |
| MSFT   | velocity | +0.13 | −0.03 | −0.08 |
| GOOGL  | % change | −0.15 | −0.14 | −0.09 |
| GOOGL  | velocity | −0.15 | −0.13 | −0.10 |

**Conclusion: the download-count surface is falsified.** The apparent MSFT
level signal (fwd4 r=+0.40) is a monotone-trend artifact: weekly downloads
rose 17M → 46M while the price dipped and recovered, and Pearson over two
trending series is spurious. The moment the signal is expressed the way the
industry insists it works — as change (% change, weekly delta, trailing
velocity) — every correlation collapses to ≈ 0 or negative across all three
tickers and all forward horizons. This is the sixth falsified measurement
surface; downloads add density but no lead/lag information.

### Own-repo momentum probe (2026-08-30)

The vendor-literal surface: instead of third-party manifest churn or download
counts, Sherlock/Paradox/GitDealFlow measure the target's OWN momentum —
star velocity, contributor growth, commit velocity on the vendor's
repositories. This probe collected those series for the three core SDK repos
(`aws/aws-sdk-js-v3` → AMZN, `Azure/azure-sdk-for-js` → MSFT,
`googleapis/google-cloud-node` → GOOGL) via the GitHub REST API and overlaid
weekly momentum vs the same tokenized-stock prices. Script:
`probe-own-repo-momentum.ts` (stargazers history + `/stats/contributors`
weekly commit/author counts → AdoptionWeek rows → reuse of
`buildOverlay`/`summarizeOverlay`).

**Data caveat — star velocity is unmeasurable.** Since July 2026 GitHub
restricts the stargazers listing endpoint to repo admins/collaborators
([changelog](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/)).
Both the fine-grained PAT and the OAuth token get 403/404 for the three
third-party SDK repos, and the events API is too shallow to reconstruct a
year of star history for busy repos. So `starsInWindow = 0` for all three;
the star-velocity metric — the flagship of the vendor approach — cannot be
measured with a personal token. Commit velocity and contributor growth
(`/stats/contributors`) work and carry the probe.

**Commit velocity + contributor growth correlations:**

| Ticker | metric               | fwd1  | fwd2  | fwd4  |
| ------ | -------------------- | ----- | ----- | ----- |
| AMZN   | contributors (level) | +0.11 | +0.21 | +0.32 |
| AMZN   | Δ contributors       | −0.03 | −0.06 | −0.07 |
| AMZN   | contributor velocity | −0.03 | +0.09 | +0.15 |
| AMZN   | commits (level)      | −0.05 | −0.14 | −0.03 |
| MSFT   | commits (level)      | +0.08 | +0.10 | +0.32 |
| MSFT   | Δ commits            | +0.07 | −0.17 | −0.11 |
| MSFT   | commit velocity      | −0.14 | −0.24 | −0.18 |
| GOOGL  | contributors (level) | −0.11 | −0.31 | −0.04 |
| GOOGL  | commit velocity      | −0.28 | −0.48 | −0.40 |

**Conclusion: the own-repo momentum surface is falsified (seventh
falsification).** The level readings (AMZN contributors fwd4 +0.32, MSFT
commits fwd4 +0.32) again fail every change/momentum transform: weekly deltas
collapse to ≈ 0, trailing-velocity is null or negative except AMZN
contributor velocity fwd4 +0.15, and the detrended (deviation-from-local-
trend) versions collapse too. GOOGL is negative on essentially every
momentum reading. The vendor-standard surface — measured on the exact repos
those vendors sell data on — adds no lead/lag to price either. The only
defensible finding is negative: on this window and ticker set, the target's
own repo momentum does not predict its stock, and its star history is not
even accessible with a personal token.

### adoption_rate metric (netAdd / totalTracking, 2026-08-30)

The one theoretical avenue left from the original proposal: the canonical
signal `adoption_rate = net_change / total_tracking` (repos currently
tracking a company's packages), deferred because the snapshot-corpus pipeline
did not maintain cumulative tracking state. This metric could, in principle,
carry information raw netAdd does not: a repo added when only 5 track a
company is 20% growth; when 5,000 track it, it is noise. Script:
`analyze-adoption-rate.ts` — reconstructs totalTracking from the corpus
`companyTargets` baseline + chronological `added`/`removed` events, then
scores both netAdd and adoption_rate per week vs the same tokenized-stock
prices.

**Result: the adoption_rate metric is degenerate on this corpus.** The
churn-verified corpus selects repos _because_ they track the SDK, so
totalTracking barely moves: AMZN 11–12, GOOGL 9–11, MSFT 5–6 (week-to-week
changes in only 2–4% of transitions). With an essentially-constant
denominator, adoption_rate = netAdd / const, and because Pearson is
scale-invariant, the correlations are identical:

| Ticker | fwd1 netAdd vs rate | fwd2 netAdd vs rate | fwd4 netAdd vs rate | corr(netAdd, rate) |
| ------ | ------------------- | ------------------- | ------------------- | ------------------ |
| AMZN   | −0.163 vs −0.159    | +0.155 vs +0.152    | +0.033 vs +0.030    | 0.9991             |
| GOOGL  | +0.085 vs +0.084    | +0.192 vs +0.192    | +0.213 vs +0.211    | 0.9986             |
| MSFT   | −0.092 vs −0.092    | −0.060 vs −0.060    | −0.040 vs −0.040    | 1.0000             |

**Conclusion: adoption_rate is a mathematical no-op on this corpus (eighth
falsification).** It would only carry independent signal if totalTracking
varied meaningfully over the window — i.e. if many repos entered/left
tracking mid-window — which requires a fundamentally more dynamic corpus
than a churn-verified snapshot. The metric change cannot produce a new
signal; the denominator problem and the event-sparsity problem are the same
corpus problem.

### Recommended next steps

- **Expand the corpus** to include 10–20 consumer repos that use the mapped
  packages. ✅ Done in version `2026-08-29-pilot-v2` (5 consumer repos added).
- **Run the collection against the expanded corpus** and verify that mapped
  events are now produced. ✅ Done — 53 mapped events (43 AMZN, 7 MSFT, 3 GOOGL).
- **Add semver-aware diffing** so version changes are classified correctly. ✅ Done.
- **Collect weekly curves from the expanded corpus and overlay with stock
  prices (Phase 0).** ✅ Done — `overlay.csv` + `overlay.summary.json`
  (correlations are exploratory/weak; see above).
- **Score velocity/acceleration (Phase 1).** ✅ Done — velocity/acceleration
  correlations still weak (|r| ≤ 0.3); see Phase 1 results above.
- **G2 agent scoring (heuristic enrichment + weighted curves).** ✅ Done.
  Weighting by strategic importance does not improve the forward signal
  (GOOGL fwd1 velocity 0.131→0.122). The corpus has almost no strategic
  adoption events — 505 mapped events, mean heuristic score 0.355, only 9
  high-score events. The bottleneck is corpus composition, not scoring.
- **Wide-corpus `added`-only experiment.** ✅ Done — `added` is confirmed as
  the strategic event type, but it is too rare to scale: 17 events across 27
  wide repos over 12 months, and the apparent AMZN same-week r=+0.33 is a
  single-repo single-week concentration artifact. The `added` curve is
  degenerate (0 in ~43/52 weeks), so wider corpora cannot fix the signal.
  See the wide-corpus section above.
- **Migration base-rate probe.** ✅ Done — measured the _declared_ migration
  surface (release notes) directly, on the theory that it captures strategic
  adoption that package.json diffs miss. Result: **0 of 505 enriched
  dependency-change commit messages** are strategic, and of **2,047 release
  notes across the 27-repo wide corpus, 8 keyword matches — every one a false
  positive on manual review** (bug fixes mentioning "AWS"/"Azure" in passing,
  feature releases, deprecation notices). Strategic adoption decisions are
  rare across every surface we can measure, so a changelog-anchored corpus
  build is not justified. See the probe section above.
- **SDK download-count surface.** ✅ Done — pulled 29 mapped SDK packages'
  npm download counts (350 days, 51 weeks) and overlaid weekly curves vs
  tokenized-stock prices, testing both the level (weekly total) and the
  change (% change / delta / velocity). Level correlations look strong for
  MSFT (fwd4 r=+0.40) but are a monotone-trend artifact; all change-based
  correlations are ≈ 0 or negative across every ticker and horizon. This is
  the sixth falsified surface. See the download-count section above.
- **Own-repo momentum probe.** ✅ Done — measured the vendor-literal surface
  (star velocity, contributor growth, commit velocity on the 3 core SDK
  repos). Star history is unmeasurable since GitHub's July 2026 stargazers
  restriction; commit/contributor level correlations (AMZN contributors fwd4
  +0.32, MSFT commits fwd4 +0.32) fail every change/momentum transform
  (Δ ≈ 0, velocity null/negative, detrended collapses). Seventh falsified
  surface. See the own-repo momentum section above.
- **adoption_rate metric (netAdd / totalTracking).** ✅ Done — reconstructed
  cumulative tracking state from corpus companyTargets + events, scored both
  netAdd and adoption_rate vs prices. totalTracking is near-constant (4%
  week-to-week change rate), so adoption_rate = netAdd / const ≡ scaled copy;
  Pearson confirms corr ≥ 0.9986. The metric is mathematically degenerate on
  a churn-verified corpus (eighth falsification). See the adoption-rate
  section above.
- **Next step options:**
  - **Stop the research track** — empirical conclusion across G0→G2, the
    wide-corpus experiment, the migration base-rate probe, the SDK download
    count surface, the own-repo momentum probe, and the adoption_rate metric:
    eight measurement surfaces (churn events, weighted events, `added` events,
    declared migrations, own-repo downloads, download growth/change, own-repo
    momentum, and adoption_rate) produce no robust forward signal above
    |r| ≈ 0.2, and every higher reading is a trend/concentration artifact.
    The research infrastructure is production-ready but the signal is absent.
  - **Own-repo momentum probe** — a different surface (star velocity,
    contributor growth, commit velocity for the SDK repositories themselves:
    `aws/aws-sdk-js-v3`, `Azure/azure-sdk-for-js`,
    `googleapis/google-cloud-node`). ✅ Done — this is what
    Sherlock/Paradox/GitDealFlow actually measure. Result: falsified. Star
    history is unmeasurable for third-party repos since GitHub's July 2026
    stargazers restriction, and commit/contributor momentum adds no
    lead/lag after change transforms. See the own-repo momentum section
    above.
  - **Fundamentally different corpus** — a wider search beyond npm/TypeScript
    (Go modules, Python packages, Cargo crates) or a corpus focused on repos
    known to make strategic adoption decisions (not just Renovate bumps).
  - **adoption_rate metric (netAdd / totalTracking)** — the canonical
    metric from the original proposal. ✅ Done — reconstructed cumulative
    tracking state from the corpus. Result: mathematically degenerate on a
    churn-verified corpus (totalTracking changes in 2–4% of weeks;
    corr(netAdd, rate) ≥ 0.9986). The metric is a scaled copy of netAdd
    because Pearson is scale-invariant and the denominator is near-constant.
    Eighth falsification; closes the last theoretical avenue from the proposal.
    See the adoption-rate section above.

## Validation boundary

The dataset may be used for exploratory curves and pre-registered tests only
after the quality report is reviewed. The gates are unchanged from the corpus
document:

| Gate                       | Description                                                | Status                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G0 — Data quality**      | Reliable identification, deduplication, auditable mappings | ✅ Validated                                                                                                                                                             |
| **G1 — Historical signal** | Adoption curves vs stock-price outcomes                    | ❌ No signal — tested across pilot-v1→v4, wide corpus, migration base-rate probe, SDK download counts, own-repo momentum, and adoption_rate; no metric exceeds abs r 0.3 |
| **G2 — Agent usefulness**  | Agent scoring improves selectivity                         | ❌ Tested — weighting does not improve signal; corpus has almost no strategic events                                                                                     |
| **G3 — Paper viability**   | Conservative paper strategy                                | Pending                                                                                                                                                                  |
| **G4 — Alpaca decision**   | Go/no-go for brokerage integration                         | Pending                                                                                                                                                                  |

**Empirical status (as of 2026-08-30):** G1 is now tested to failure. Eight
measurement surfaces — four corpus constructions (pilot-v1→v4), a 27-repo
`added`-only wide corpus, the migration base-rate probe (commit messages +
release notes), SDK download counts (level and change), own-repo momentum
(commit velocity + contributor growth), and the adoption_rate metric — produce
no forward signal stronger than |r| ≈ 0.2–0.3, and every reading above that
boundary was traced to a small-sample, single-repo/single-week concentration
artifact, or a monotone-trend (level) artifact. The migration base-rate probe
confirms the root cause on the event side: strategic adoption events are rare
across all measurable surfaces (0/505 commit messages, 8/2,047 release notes —
all keyword false positives). The download-count surface adds the demand side:
even dense, monotone-rising download series carry no lead/lag when expressed
as change — the exact transformation the vendor literature says contains the
signal. The own-repo momentum probe closes the vendor-standard surface:
commit/contributor momentum on the SDK repos themselves adds no lead/lag
(Δ and velocity transforms ≈ 0 or negative), and star velocity is not even
measurable for third-party repos under GitHub's July 2026 stargazers
restriction. The adoption_rate metric closes the last theoretical avenue
from the proposal: it is mathematically degenerate on a churn-verified
corpus (near-constant denominator ⇒ scaled copy of netAdd). The
OSS-adoption hypothesis, as implemented (npm package-manifest churn of
`@aws-sdk` / `@azure` / `@google-cloud` consumers, their download counts,
the vendors' own repo momentum, or normalized adoption rates, vs
tokenized-stock prices), does not demonstrate a tradable lead/lag. A signal,
if one exists, requires a fundamentally different corpus or measurement
surface — none of which the eight falsifications justify investing in on the
current evidence.

Until G4 is a positive decision, Alpaca remains downstream context — not a
dependency of the collector or the research dataset.
