# OSS Adoption Validation Corpus

> **Status:** Initial research specification. No trading or Alpaca execution.
> **Related proposal:** [`oss-adoption-trading.md`](./oss-adoption-trading.md)
> **Created:** 2026-08-28
> **Updated:** 2026-08-29 (first-wave consumer expansion, version `2026-08-29-pilot-v2`)

## Purpose

This corpus is the first G0 data-quality pilot for the OSS-adoption hypothesis. It is intentionally curated rather than a claim about all public repositories. The goal is to produce an auditable dataset before deciding whether the signal merits agent scoring, paper trading, or an Alpaca integration.

## Scope

- **30–50 public repositories** selected for clear dependency evidence and public-company relevance.
- Initial company universe: **GOOGL, MSFT, AMZN**.
- Initial observation period: **12 months**, with an explicit UTC start and end date recorded in each run manifest.
- Initial manifest formats: `package.json`, `go.mod`, `requirements.txt`, and `Cargo.toml`.
- Initial output: normalized dependency events, weekly adoption curves, quality metrics, and unresolved mappings.
- No brokerage orders, options contracts, Alpaca account, or live-trading path is part of G0.

## Selection rules

A repository may enter the corpus only if:

1. It is public and has a stable owner/repository slug.
2. Its default branch and license can be recorded.
3. At least one dependency manifest is present in the selected historical window, or it is explicitly included as a negative/control repository.
4. Its inclusion rationale is recorded: package consumer, ecosystem representative, or control.
5. It is not duplicated through forks, mirrors, or multiple aliases.

The corpus should contain both **exposure repositories** (expected to reveal mapped package changes) and **controls** (similar public repositories where no mapped change is expected). Controls are not discarded when they produce no signal; their coverage is part of the result.

## Required corpus manifest

The versioned manifest should contain one row per repository:

```yaml
version: 1
created_at: 2026-08-28T00:00:00Z
companies: [GOOGL, MSFT, AMZN]
repositories:
  - slug: owner/repository
    company_targets: [GOOGL]
    role: exposure # exposure | control
    expected_manifests: [package.json]
    inclusion_reason: "Uses a mapped Google Cloud SDK in production code"
    source_url: https://github.com/owner/repository
    default_branch: main
    mapping_refs: [google-cloud-node]
```

The actual repository list should be committed only after checking each entry against the rules above. A mapping reference is not evidence that a signal exists; it records the hypothesis being tested.

## Current corpus (version `2026-08-29-pilot-v2`)

10 repositories (3 SDK sources + 5 consumer repos + 2 controls):

| Slug | Role | Company | Verified |
|---|---|---|---|
| googleapis/google-cloud-node | exposure (source) | GOOGL | ✅ |
| Azure/azure-sdk-for-js | exposure (source) | MSFT | ✅ |
| aws/aws-sdk-js-v3 | exposure (source) | AMZN | ✅ |
| nocodb/nocodb | exposure (consumer) | MSFT | ✅ @azure/identity in root package.json |
| promptfoo/promptfoo | exposure (consumer) | MSFT | ✅ @azure/identity in root package.json |
| wekan/wekan | exposure (consumer) | GOOGL, AMZN | ✅ @google-cloud/storage + @aws-sdk/client-s3 |
| cypress-io/cypress | exposure (consumer) | AMZN | ✅ @aws-sdk/client-s3 in root package.json |
| lobehub/lobehub | exposure (consumer) | AMZN | ✅ @aws-sdk/client-s3 in root package.json |
| vercel/next.js | control | — | ✅ |
| pallets/flask | control | — | ✅ |

Consumer repos were verified via GitHub code search (`filename:package.json path:/ "<package>"`) and confirmed public, non-fork, non-archived, with a permissive license.

## Package-to-company registry rules

Mappings must be versioned and sourced. Each mapping records:

- package identifier and ecosystem
- company name and listed ticker, if any
- mapping rationale and source URL
- `mapping_confidence`: `high`, `medium`, or `low`
- `materiality`: `core`, `supporting`, or `unknown`
- `tradable`: boolean

A company without a verified public ticker is **alert-only** and cannot enter the stock-return or trading evaluation as a tradable asset. Package ownership, package popularity, and company revenue exposure are separate claims and must not be collapsed into one mapping.

## Normalized dependency event

Every extracted event should preserve its source and information boundary:

```json
{
  "repository": "owner/repository",
  "commitSha": "full-sha",
  "committedAt": "2026-01-12T10:00:00Z",
  "manifestPath": "package.json",
  "ecosystem": "npm",
  "package": "@example/sdk",
  "change": "added",
  "versionBefore": null,
  "versionAfter": "1.2.3",
  "companyTicker": "GOOGL",
  "mappingConfidence": "high",
  "sourceUrl": "https://github.com/owner/repository/commit/full-sha"
}
```

If a commit changes multiple manifests or packages, emit separate events sharing the same commit SHA. Never infer an event from a later lockfile alone without recording that limitation.

## G0 quality report

Every run must produce:

- corpus version and run timestamp
- repositories requested, fetched, completed, and failed
- default-branch resolution failures
- repositories with each manifest type
- commits and manifests examined
- normalized additions, removals, and upgrades
- duplicate events removed and deduplication rule
- mapped versus unmapped packages
- mapping-confidence counts
- exposure/control coverage
- truncated-history or API-rate-limit warnings
- missing price observations, if prices are added in a later phase

A failed fetch is not silently treated as zero adoption. It is a missing observation and must remain visible in the report.

## Validation boundary

The dataset may be used for exploratory curves and pre-registered tests only after the quality report is reviewed. The next gates are:

1. **G1:** compare adoption curves with stock-price outcomes and simple baselines.
2. **G2:** test whether agent scoring adds selectivity or calibration beyond rules.
3. **G3:** test conservative paper viability after costs, spreads, and liquidity assumptions.
4. **G4:** decide whether an Alpaca paper/options implementation is justified.

Until G4 is a positive decision, Alpaca remains downstream context—not a dependency of the collector or the research dataset.
