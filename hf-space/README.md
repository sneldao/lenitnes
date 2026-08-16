---
title: LENITNES — Software-Change Judgments, Committed Before the Outcome
emoji: 🔬
colorFrom: blue
colorTo: green
sdk: static
pinned: false
license: mit
short_description: Live mirror of the LENITNES integrity sentinel dashboard
---

# 🔬 LENITNES — Software-Change Judgments, Committed Before the Outcome

A pre-registration machine for software-change judgments: LENITNES watches
repositories, detects commits that may invalidate published results, scores
each one with a versioned rubric, and notarizes every verdict on **Hedera HCS
before the outcome is knowable** — then grades itself in public, losses
included.

Two applications run the same proof/evaluation loop, separated by the oracle
they answer to:

- **`[markets]`** — crypto repos scored against market price (Season 1,
  closed; record is public, losses included)
- **`[research]`** — scientific software scored against explicitly adjudicated
  published-record events (alert-only; no trading)

This Space opens the research-first production surface. If the frame does not
load, open it directly: <https://lenitnes.persidian.com/research>

The research application is alert-only: it does not trade. Historical replays
and prospective live alerts are kept in separate scorecard cohorts.

## How it works

1. **DETECT** — monitors watch GitHub repos for meaningful commits
2. **SCORE** — LLM rubric (v6 [research] / v4 [markets]) scores severity and impact
3. **COMMIT** — public alerts are notarized on Hedera HCS before the outcome is known
4. **GRADE** — outcomes are validated against external ground truth (market
   price for [markets], dated retractions/corrections for [research])

## Sponsor integrations

- **GXL / Paperclip** — literature grounding via MCP
- **Anthropic** — Claude as the primary scoring LLM
- **Hedera HCS** — timestamped notarization for committed public alerts
- **Modal** — GPU compute escalation for expensive claims

Built for **re:AGENT** · Founders Inc SF · Aug 15–16 2026 · Track A: Co-Scientist ·
solo build

- Live dashboard: <https://lenitnes.persidian.com>
- Code: <https://github.com/sneldao/lenitnes>
