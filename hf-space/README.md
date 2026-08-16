---
title: LENITNES — Scientific Software Integrity Sentinel
emoji: 🔬
colorFrom: blue
colorTo: green
sdk: static
pinned: false
license: mit
short_description: Live mirror of the LENITNES integrity sentinel dashboard
---

# 🔬 LENITNES — Scientific Software Integrity Sentinel

A pre-registration machine for software-change judgments: LENITNES watches
repositories, detects commits that may invalidate published results, scores
each one with a versioned rubric, and notarizes every verdict on **Hedera HCS
before the outcome is knowable** — then grades itself in public, losses
included.

Two live verticals run the same loop:

- **`[code]`** — crypto repos scored against market price (Season 1, closed)
- **`[bio]`** — scientific software scored against the published record
  (retractions, corrections)

This Space embeds the live production dashboard. If the frame does not load,
open it directly: <https://lenitnes.persidian.com>

## How it works

1. **DETECT** — monitors watch GitHub repos for meaningful commits
2. **SCORE** — LLM rubric (v6 [bio] / v5 [code]) scores severity and impact
3. **COMMIT** — every verdict is notarized on Hedera HCS before the outcome is known
4. **GRADE** — outcomes are validated against external ground truth (market
   price for [code], dated retractions/corrections for [bio])

## Sponsor integrations

- **GXL / Paperclip** — literature grounding via MCP
- **Anthropic** — Claude as the primary scoring LLM
- **Hedera HCS** — immutable notarization of every verdict
- **Modal** — GPU compute escalation for expensive claims

Built for **re:AGENT** · Founders Inc SF · Aug 15–16 2026 · Track A: Co-Scientist ·
solo build

- Live dashboard: <https://lenitnes.persidian.com>
- Code: <https://github.com/sneldao/lenitnes>
