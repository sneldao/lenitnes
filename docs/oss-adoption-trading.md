# OSS Adoption Signal — leading-indicator trading vertical

> **Status:** Research and validation proposal. Not yet implemented.
> **Written:** 2026-08-28
> **Purpose:** First validate whether public-repository dependency adoption contains predictive information about public-company price movement. Only after that evidence exists should LENITNES decide whether to build an Alpaca integration or pursue options trading.
>
> **Decision gate:** This document describes the upstream stock-signal and adoption-research work first. Alpaca is a possible downstream execution venue, not an assumption or a current dependency. No Alpaca integration, options strategy, brokerage account, or live-trading commitment is implied until the validation results justify it.

## 1. The thesis

**OSS dependency changes are a real-time, un-manipulable sentiment indicator.** Nobody falsifies their `package.json` to look good for investors. And when an ecosystem of repos coordinates a shift — say, removing `google-gemini` and adding `@anthropic-ai/sdk` — that is a market signal that arrives *before* earnings, *before* analyst upgrades, *before* the stock prices it in.

LENITNES[markets] detects signals in crypto consensus repos. LENITNES[research] detects signals in scientific software. **OSS adoption signal** detects signals in *all public repos* by aggregating dependency changes across the ecosystem and mapping them to publicly traded companies — then uses those adoption curves to predict stock price movements, especially around earnings.

### 1.1 Why this is stronger than direct monitoring

| | Direct monitoring | OSS adoption signal |
|---|---|---|
| **Coverage** | Only public repos (crypto consensus) | Every public repo's dependencies |
| **Signal timing** | After target company ships | After upstream supplier ships, before target company ships the fix |
| **Private company targets** | Impossible (no code to watch) | Possible (check their public integrations) |
| **Ecosystem-level view** | Single repo → single asset | N repos → aggregate curve → relative competitive landscape |
| **Untouched by traditional market noise** | Yes | Yes |
| **Works for supply-chain inference** | No — you need the target's code | Yes — you only need supplier's code + the target's dependency on it |

### 1.2 Signal taxonomy

| Signal type | What you measure | What you predict |
|---|---|---|
| **SDK adoption spike** | N repos add `@anthropic-ai/sdk` in 7 days | `ANTM` revenue trajectory |
| **Platform migration** | Repos removing `google-gemini`, adding `openai` / `anthropic` | `GOOGL` AI revenue vs `ANTM` revenue |
| **Dependency deprecation cascade** | Repos removing dependency after `deprecated: true` | Vendor revenue cliff |
| **Competitor infiltration** | Repo adds competitor's SDK alongside theirs | Strategic hedging / competitive pressure |
| **Vendor consolidation** | Repo removing 5 cloud SDKs, adding 1 | Cost optimization → margin expansion |
| **Shared dependency vulnerability** | `security_critical_patch` in shared lib | All downstream companies' stock impact |
| **Earnings proxy** | Adoption curve slope in 30/14/7d before earnings call | Beat / miss on revenue guidance |

## 2. Integration with existing infrastructure

The initial implementation should stay research-first. Reuse LENITNES's evidence, replay, scoring, commitment, and price-outcome machinery, but keep the output as a measured stock signal or alert until the hypothesis has been tested. Brokerage execution belongs to a later decision phase.

### 2.1 New vertical: `oss-adoption`

This is a **fourth vertical** alongside `code` (crypto) and `science` (research):

| Vertical | Tag | Grading oracle | Action |
|---|---|---|---|
| `[markets]` | `code` | market price (T+1h/1d/7d) | trade (paper → live) |
| `[research]` | `science` | adjudicated published-record events | integrity alert, HCS-anchored |
| `enterprise` | `enterprise` | internal audit | leak-scan report |
| **`oss-adoption`** | **`oss`** | **public company stock price** | **trade / alert** |

The vertical tag `oss` (or `adoption`) names the new grading oracle — public company stock prices — and the new input corpus: **all public repos**, not just crypto consensus or scientific software.

The loop, notarization, and grading discipline are the same. What varies is only four slots: the watched corpus, the rubric, the grading authority, and the action.

### 2.2 New detector: `oss_adoption_change`

Analogous to `dependency_rotation` but operating on the **ecosystem** level rather than per-repo:

```
OSS Adoption Change Detector
────────────────────────────
Input: all public repos with dependency files (package.json, go.mod,
       requirements.txt, Cargo.toml, etc.)
Process:
  1. For each repo, parse dependency manifests
  2. Track additions and removals of known public-company-owned packages
  3. Aggregate into weekly adoption curves per public company
  4. Measure velocity (repos/sec week) and acceleration (slope change)
  5. Score: velocity × criticality × acceleration × conviction weight
Output: SignalClassification with company ticker, adoption delta, velocity
```

The detector maps packages to public companies via a **package-to-company registry**:

```typescript
interface PackageToCompany {
  npmScope?: string;       // "@anthropic-ai" → ANTM
  npmPackage?: string;     // "openai" → private (until IPO)
  mavenGroup?: string;     // "com.google.cloud" → GOOGL
  goModule?: string;       // "cloud.google.com/go" → GOOGL
  companyName: string;     // "Anthropic"
  ticker: string;          // "ANTM" (or "ANTM:private" pre-IPO)
  sector: string;          // "AI", "Cloud", "Cybersecurity"
  materiality: number;     // 0-100: how central is this package to their revenue
}
```

### 2.3 Signal synthesis extension

The existing synthesis layer already has three periodic jobs. This extends them all:

| Existing Job | Current Scope | Extension for OSS adoption |
|---|---|---|
| **Narrative scan** | Cross-signal cluster across watched crypto repos | Add OSS adoption signals to narrative context — "all signals this window: 3 code-vertical + 2 OSS-adoption signals showing platform migration" |
| **Thesis synthesis** | Un-triggered commit aggregation | N/A (OSS adoption is already aggregate-level, no need to re-aggregate commits) |
| **Proactive scan** | Velocity anomaly + PR activity on watched repos | **OSS adoption velocity anomaly** — "unusual spike in repos adopting `@anthropic-ai/sdk`" |

### 2.4 Existing detector reuse

The existing `dependency-rotation` detector becomes a **pre-filter** for the new pipeline:

```
Existing pipeline (per-monitor):
  GitHub commit API → dependency-rotation detector → (if fires) → full agent scoring

OSS adoption pipeline:
  package.json/go.mod/etc parsing across ALL repos → 
    (if dependency added/removed) → 
      package-to-company registry lookup →
        weekly aggregation per company →
          velocity/acceleration scoring →
            agent scoring (same Qwen3.8 chain) →
              conviction threshold →
                trade/alert
```

The `dependency-rotation` detector stays as-is for the crypto consensus vertical. It also fires on OSS adoption repos, but the classification gets routed to the OSS adoption signal pipeline rather than the crypto trading pipeline.

### 2.5 Evidence graph integration

New evidence node types for the OSS adoption pipeline:

```sql
ALTER TABLE evidence_nodes ADD COLUMN IF NOT EXISTS node_type TEXT
  CHECK (node_type IN ('commit', 'advisory', 'pr', 'release', 'paper', 'macro', 'signal', 'dependency', 'adoption_curve'));
```

New evidence link types:

```sql
ALTER TABLE evidence_links ADD CONSTRAINT evidence_links_kind_check
  CHECK (kind IN (
    'same_sha', 'backport', 'releases_fix', 'corroborates',
    'contradicts', 'same_root', 'supersedes',
    'paper_depends_on', 'mechanism_shared', 'sector_upstream',
    'dependency_change', 'adoption_spike', 'platform_migration', 'shared_vulnerability'
  ));
```

This lets the evidence graph trace: `google-gemini security patch → 3 repos removed google-gemini within 7 days → adoption velocity curve for GOOGL declined → agent scores → trade signal`.

### 2.6 Database changes

```sql
-- Public company registry (maps packages to companies)
CREATE TABLE IF NOT EXISTS oss_companies (
  id              BIGSERIAL PRIMARY KEY,
  ticker          TEXT NOT NULL UNIQUE,              -- "GOOGL", "ANTM"
  company_name    TEXT NOT NULL,
  sector          TEXT NOT NULL,                     -- "AI", "Cloud", "Cybersecurity"
  materiality     INTEGER NOT NULL DEFAULT 50,       -- 0-100
  is_ipo          BOOLEAN NOT NULL DEFAULT false,    -- pre-IPO companies have no live price
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Package registry (maps package identifiers to companies)
CREATE TABLE IF NOT EXISTS oss_packages (
  id              BIGSERIAL PRIMARY KEY,
  npm_scope       TEXT,                              -- "@anthropic-ai"
  npm_package     TEXT,                              -- "openai"
  maven_group     TEXT,                              -- "com.google.cloud"
  go_module       TEXT,                              -- "cloud.google.com/go"
  crate_name      TEXT,                              -- "google-cloud"
  company_id      BIGINT NOT NULL REFERENCES oss_companies(id),
  is_core_product BOOLEAN NOT NULL DEFAULT false,    -- core revenue driver vs. supporting tool
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(npm_scope, npm_package),
  UNIQUE(maven_group),
  UNIQUE(go_module),
  UNIQUE(crate_name)
);

-- Weekly adoption curve data
CREATE TABLE IF NOT EXISTS oss_adoption_curves (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES oss_companies(id),
  week_start      DATE NOT NULL,                     -- Monday of the tracking week
  repos_added     INTEGER NOT NULL DEFAULT 0,        -- repos that added this company's package this week
  repos_removed   INTEGER NOT NULL DEFAULT 0,        -- repos that removed it
  net_change      INTEGER NOT NULL DEFAULT 0,        -- added - removed
  total_tracking  INTEGER NOT NULL DEFAULT 0,        -- repos currently tracking this package
  adoption_rate   NUMERIC(10, 4),                    -- net_change / total_tracking
  velocity        NUMERIC(10, 4),                    -- slope of adoption_rate over 4 weeks
  acceleration    NUMERIC(10, 4),                    -- slope of velocity over 4 weeks
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, week_start)
);

-- Adoption-signal (separate from regular signals table — different oracle)
CREATE TABLE IF NOT EXISTS oss_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      BIGINT NOT NULL REFERENCES oss_companies(id),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  signal_type     TEXT NOT NULL CHECK (signal_type IN (
    'adoption_spike', 'platform_migration', 'deprecation_cascade',
    'competitor_infiltration', 'vendor_consolidation', 'shared_vulnerability',
    'earnings_proxy'
  )),
  conviction      INTEGER NOT NULL DEFAULT 0,        -- 0-100
  thesis          TEXT,
  recommended_action TEXT NOT NULL DEFAULT 'none'    -- long / short / none / alert
                    CHECK (recommended_action IN ('long', 'short', 'none', 'alert')),
  weekly_delta    JSONB NOT NULL DEFAULT '{}',        -- per-package net change this week
  evidence_text   TEXT,
  evaluation_mode TEXT NOT NULL DEFAULT 'live'
                    CHECK (evaluation_mode IN ('live', 'replay')),
  -- Outcome tracking (price oracle)
  asset           TEXT NOT NULL,                     -- stock ticker
  price_at_signal NUMERIC(20, 8),
  window_1d       NUMERIC(10, 4),                    -- T+1d price change %
  window_3d       NUMERIC(10, 4),                    -- T+3d price change %
  window_7d       NUMERIC(10, 4),                    -- T+7d price change %
  -- HCS notarization (same as regular signals)
  hedera_tx_id    TEXT,
  hedera_hcs_message_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oss_signals_company ON oss_signals(company_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_oss_signals_detected ON oss_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_oss_signals_type ON oss_signals(signal_type);

-- Adoption curves indexed by company and time
CREATE INDEX IF NOT EXISTS idx_oss_adoption_company_week
  ON oss_adoption_curves(company_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_oss_adoption_velocity
  ON oss_adoption_curves(company_id, velocity DESC)
  WHERE velocity != 0;
```

### 2.7 Monitor extension

The monitor system already handles arbitrary URLs. For OSS adoption, monitors are not per-repo — they're **aggregation queries** over the entire public repo corpus:

```
Monitor type: oss_adoption
URL: "narrative:oss-adoption"
Condition: "weekly adoption velocity anomaly OR platform migration detected"
Frequency: 86400 (daily — adoption curves are weekly, check daily for new data)
Domain: 'oss'
Asset mapping: {"ticker": "GOOGL"} — derived from the package→company mapping
```

Existing monitors (per-repo GitHub URLs) continue to run as-is for the `code` and `science` verticals. OSS adoption monitors are synthetic — they don't check a single repo, they check the aggregation.

## 3. UI surfacing

### 3.1 New nav item: "Intelligence"

The nav already has an "Intelligence" item under "More" → "Intelligence: velocity · PRs · synthesis". This gets repurposed and expanded to become the OSS adoption surface:

```
Intelligence
────────────
Adoption curves — weekly tracking of SDK/platform adoption across public repos
Signal feed — OSS adoption signals with conviction scores and thesis
Earnings calendar — upcoming earnings events mapped to adoption curve signals
Package registry — browse packages → find the public company → see adoption data
```

### 3.2 Adoption curves page

A new page at `/intelligence/adoption` showing:

- **Weekly adoption curves** — line chart per company (repos adding/removing their package over time)
- **Velocity indicator** — current velocity and acceleration for each tracked company
- **Signal feed** — conviction-scored signals from the agent, mapped to the same curve view
- **Earnings overlay** — upcoming earnings dates with adoption curve context (e.g., "GOOGL earnings in 14 days; Gemini SDK adoption curve declined 23% over last 4 weeks")

### 3.3 Integration with existing scorecard

The scorecard (`/scorecard`) gets a **fourth tab** alongside Markets and Research:

```
Tabs: Markets · Research · OSS Adoption
```

The OSS Adoption tab shows:

- P&L of adoption-signal trades (if paper/live trading enabled)
- Hit ratio by signal type (adoption_spike vs platform_migration vs deprecation_cascade)
- Per-company track record
- Correlation between adoption velocity and earnings outcomes

### 3.4 Timeline integration

The unified timeline (`/markets`, `/research`) gets a **third toggle** for OSS signals. Existing cards show the stage badge (`Detect → Commit → Track → Score`). OSS cards show the same lifecycle but with different stage copy:

| Stage | Markets | Research | OSS Adoption |
|---|---|---|---|
| Detect | "Change detected" | "Change flagged" | "Adoption shift detected" |
| Commit | "Notarizing thesis" | "Notarizing alert" | "Notarizing signal" |
| Track | "Window open" | "Record open" | "Price window open" |
| Score | "Graded against price" | "Graded against record" | "Graded against price" |

### 3.5 Signal cards on `/signals/:id`

OSS signals get their own card layout that emphasizes:

- **Package-to-company mapping** — which packages drove the signal, which company they represent
- **Weekly adoption delta** — visual showing the curve (spike, decline, migration)
- **Earnings proximity** — how many days until the company's next earnings call
- **Signal type badge** — adoption_spike, platform_migration, etc.

### 3.6 Watchlist extension

The `/monitors` page gets a section for OSS adoption monitors:

```
Active monitors:
  [📊 crypto]  zcash/halo2         — security_critical_patch
  [🔬 science] choderalab/openmmtools — results_rewrite
  [📈 oss]     narrative:oss-adoption — platform migration tracking
  [📈 oss]     narrative:oss-adoption — earnings proxy tracking
```

## 4. Agent rubric extension

The existing rubric v4 (markets) and v6 (research) get an **extension** — v7 (oss-adoption) — that adds:

1. **Package-to-company mapping confidence** — how sure is the agent that this package represents a specific public company?
2. **Ecosystem breadth** — how many distinct repos are showing the pattern? (1 repo = noise, 50 repos = signal)
3. **Earnings proximity** — is the signal close to an earnings call? (closer = more material)
4. **Competitive landscape** — are repos migrating *to* a competitor's SDK? (negative signal for the losing company)
5. **Materiality weighting** — is this package core to the company's revenue or a supporting tool?

## 5. Validation-first plan

The first deliverable is not a trading agent. It is a reproducible study that answers whether adoption changes contain useful, timely information about public-company prices after accounting for obvious confounders. Every result should be labelled as exploratory until there is enough out-of-sample data.

### 5.1 Decision gates

| Gate | Question | Required outcome |
|---|---|---|
| **G0 — Data quality** | Can we reliably identify dependency changes, deduplicate repositories, and defend package-to-company mappings? | Auditable dataset with coverage, missingness, and mapping-confidence reports |
| **G1 — Historical signal** | Do adoption curves show a stable relationship with future price movement? | Pre-specified windows, baselines, and out-of-sample results; no cherry-picked examples |
| **G2 — Agent usefulness** | Does agent scoring improve selectivity or calibration beyond simple rules? | Separate agent-vs-rule metrics, with conviction calibration and abstention rates |
| **G3 — Paper viability** | Does a conservative paper strategy survive costs, spreads, liquidity, and delayed execution? | Positive risk-adjusted results over a held-out period; otherwise stop or revise |
| **G4 — Alpaca participation** | Is an Alpaca submission worth the integration and options-specific work? | Explicit go/no-go decision based on evidence, time remaining, and challenge fit |

**Default decision:** if G1 fails, stop before brokerage work. If G1 passes but G2 or G3 fails, keep the result as research/alert-only and do not promote it to trading. If the signal is promising but the event timeline is too short, build a demo without implying validated alpha.

### 5.2 What must be recorded

- Universe definition and inclusion/exclusion rules
- Package-to-company mapping provenance and confidence
- Repository coverage and deduplication method
- Signal timestamp and information available at that time
- Baselines: buy-and-hold, market/sector benchmark, and simple momentum rule
- Pre-registered outcome windows and trading assumptions
- Transaction-cost, spread, liquidity, and missing-data treatment
- In-sample versus out-of-sample separation
- All no-signal and no-trade decisions

### 5.3 Alpaca decision phase — downstream only

If the validation gates pass, evaluate Alpaca as an implementation and hackathon opportunity rather than silently treating it as the next architecture layer.

The decision review should cover:

1. **Strategic fit:** Does Alpaca's paper environment and required options component add a useful demonstration of the validated signal, rather than distracting from it?
2. **Execution fit:** Can the proposed strategy be expressed safely through Alpaca's Trading API, MCP server, or CLI, including contract discovery, multi-leg orders, fills, exits, and expiration?
3. **Evidence fit:** Can the submission show a fresh paper account, reproducible trades, committed theses, and transparent P&L without overstating the research results?
4. **Scope fit:** Is there enough time to build and test the adapter without weakening the core validation?
5. **Strategy fit:** If options are used, can we define a conservative, limited-risk expression such as a debit spread, and compare option results with the underlying-stock thesis?

Possible outcomes:

- **Go:** validated signal + enough time + reliable Alpaca paper/options path; build a narrow paper-only adapter.
- **Demo-only:** promising concept but insufficient validation or time; show the architecture and replay, but do not claim predictive performance.
- **Alert-only:** signal is useful for monitoring but not strong enough for trading.
- **No-go:** data quality, mapping, predictive relationship, or execution feasibility is inadequate.

### 5.4 Backtest plan

Before building the full pipeline, validate the hypothesis with a backtest:

### Phase 0: Proof-of-concept (week 1)

Use the versioned 30–50 repository pilot defined in `docs/oss-adoption-corpus.md`. The corpus and package mappings must be frozen before looking at outcomes; controls, failed fetches, unmapped packages, and missing observations remain in the report.

1. Pick 3 companies with large OSS footprints: `GOOGL` (Gemini, Google Cloud), `MSFT` (Azure SDK), `AMZN` (AWS SDK)
2. Run the existing `/scan` replay engine over a curated set of repos that use these packages
3. Extract dependency changes from `package.json`, `go.mod`, etc. for those repos over the past 12 months
4. Aggregate into weekly curves per company
5. Overlay with stock price data (alpha Vantage, Polygon.io, or CoinGecko for tokenized stocks)
6. Measure: does the adoption curve predict short-term price movement around earnings?

### Phase 1: Correlation analysis (week 2)

If Phase 0 shows any signal:
1. Expand to 10+ companies (add CrowdStrike, Datadog, Shopify, MongoDB)
2. Split by signal type (adoption_spike, platform_migration, etc.)
3. Test T+1d, T+3d, T+7d windows
4. Test pre-earnings windows (30d, 14d, 7d before call)
5. Build a simple linear model: `adoption_velocity → price_change`
6. Report correlation coefficient, R², and statistical significance

### Phase 2: Agent scoring (week 3-4)

If Phase 1 confirms the signal:
1. Wire the weekly aggregation into the agent pipeline
2. Use the existing Qwen3.8 chain with v7 rubric extension
3. Test conviction scores against actual outcomes
4. Calibrate conviction threshold (existing: 70 for A-tier, 80 for unknown)
5. If conviction > threshold, create an oss_signal row

### Phase 3: Paper trading (week 5-6, only after G0–G2)

1. Enable conservative paper trading for OSS signals only if the earlier gates pass.
2. Track P&L alongside the existing `[markets]` P&L, with costs and benchmark comparisons.
3. Compare signal quality, abstention, drawdown, and calibration—not only raw return.
4. Keep the result alert-only if paper evidence is inconclusive.
5. Do not add live trading as part of this proposal; any live promotion requires a separate risk and operations review.

## 6. Downstream Alpaca evaluation

Alpaca is a possible follow-on path after the stock-signal research, not part of the initial implementation. The Alpaca AI Trading Agents Hackathon is attractive because it provides paper trading, an explicit agent requirement, and a natural brokerage demo. However, it also requires options trading, which introduces additional complexity and should not determine the upstream research design.

### 6.1 Recommended participation rule

Participate only if all of the following are true:

- The adoption dataset passes the data-quality review.
- At least one signal family shows reproducible out-of-sample usefulness against simple baselines.
- The company/ticker mapping is defensible and the underlying has liquid, observable options.
- A narrow paper-only options strategy can be specified before implementation.
- The fresh-account, account-ID, and submission requirements can be met within the event window.
- Alpaca integration will demonstrate the validated signal rather than manufacture a strategy around an unvalidated hypothesis.

The default downstream strategy, if approved, is a defined-risk debit spread—not naked options or unrestricted autonomous trading. The agent must be able to abstain, and the UI must distinguish research evidence, stock-direction correctness, option-execution results, and paper-only status.

### 6.2 Follow-on implementation boundary

Only after a go decision should we add:

- Alpaca paper-account configuration and secrets
- Trading API, MCP, or CLI integration
- Option-contract and quote discovery
- Defined-risk spread construction
- Order, fill, expiration, and position persistence
- Alpaca-specific risk gates and scorecard metrics
- A dedicated paper-only demo surface

Until then, the existing LENITNES engine should produce research outputs, stock signals, commitments, and price-based evaluation without depending on Alpaca.

## 7. Risk factors

### 6.1 The signal may be noisy

OSS adoption is influenced by many non-financial factors: developer preference, tutorial updates, API quality, licensing changes. The signal may be too noisy to predict price movements reliably.

**Mitigation**: Aggregate across N repos. A single repo changing SDKs is noise. 50 repos changing in the same direction is a signal. The conviction scoring already handles this via the narrative context.

### 6.2 The signal may be priced in too fast

If the signal is real and measurable, other agents may already be using it. The alpha window may be hours, not days.

**Mitigation**: Focus on the *direction* of the signal, not the magnitude. The agent scores conviction, not entry price. The treasury layer handles entry timing separately.

### 6.3 Data collection cost

Parsing dependency files across all public repos at scale requires significant API calls and processing.

**Mitigation**: 
- The `/scan` replay engine already does this for backtests
- Focus on a curated corpus of high-signal repos (top 500 by stars, top 100 in AI/ML/cloud sectors)
- Cache dependency data — no need to reparse the same `package.json` every day

### 6.4 Pre-IPO companies

Companies like OpenAI, Anthropic (if they don't IPO), and Databricks don't have live stock prices.

**Mitigation**: 
- Track their token prices (ANTM's API access has a token model)
- Use earnings proxies from publicly traded competitors (GOOGL for Google, MSFT for OpenAI)
- Mark pre-IPO signals as "alert only" (no trade)

## 8. Relationship to existing directions

This doesn't replace `[markets]` or `[research]`. It sits alongside them:

- **`[markets]`** — crypto consensus commits → crypto price (Season 1)
- **`[research]`** — scientific software commits → published record events
- **OSS adoption** — all public repos → dependency changes → public company stock price
- **Enterprise** — a customer's private repos → leak-scan report

The enterprise direction becomes even stronger with OSS adoption data: "We can scan your private repos AND cross-reference them against the public OSS adoption signals that are moving the market."

## 9. Success criteria

| Metric | Target | Measurement |
|---|---|---|
| Correlation (adoption velocity → T+7d price) | r > 0.3 | Phase 1 backtest |
| Agent conviction accuracy | ≥ 65% at conviction ≥ 70 | G2/G3, held-out evaluation |
| P&L improvement vs. baseline | ≥ 10% alpha after costs | G3 paper evaluation |
| Alpaca participation decision | Explicit go/demo-only/alert-only/no-go | G4 review |
| Number of tracked companies | ≥ 20 | Phase 3 |
| Weekly signal volume | ≥ 3 signals/week | Phase 3 |