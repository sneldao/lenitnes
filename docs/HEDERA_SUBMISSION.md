# Hedera AI Bounty — LENITNES submission

> **TL;DR:** LENITNES is an autonomous trading-intelligence agent
> that reads public commits to consensus-critical code, scores them
> against a versioned rubric, and commits its first-person
> reasoning on Hedera HCS via hedera-agent-kit. Every signal is
> permanently anchored on chain; the agent itself decides whether
> a call warrants a dedicated HCS topic.

Submission checklist:

- ✅ **Public GitHub repository** — https://github.com/sneldao/lenitnes
- ✅ **Uses Hedera Agent Kit** — `hedera-agent-kit@^3.8.2`,
  integrated in [`apps/api/src/services/proof-hedera.ts`](../apps/api/src/services/proof-hedera.ts)
- ✅ **Agentic solution** — autonomous LLM (Kimi K2 via Virtuals)
  drives the decision loop; the agent's output controls whether
  a dedicated HCS topic is created
- ✅ **Public demo (90+ days)** — https://lenitnes.persidian.com
- ✅ **Feedback document** — [`docs/HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md)
  (concrete bugs + ideas from running the kit in production)
- 🟡 **X post** — to be posted with tags `#HederaAgent #HederaAIBounty`
  and mentions `@hedera @hedera_devs`

---

## What LENITNES is

A self-contained, zero-headcount AI trading-intelligence agent:

1. **Watches** a curated list of consensus-critical GitHub
   repositories (Bitcoin Core, Ethereum geth, halo2, Solana, Sui,
   reth, Arbitrum nitro).
2. **Detects** new commits via TinyFish + 8 typed classifier
   detectors (emergency_patch, security_critical_patch,
   consensus_relevant, etc.).
3. **Scores** each scored signal with an LLM (Kimi K2 via
   Virtuals) against a versioned rubric. Outputs:
   - `conviction` 0-100
   - `thesis` (≤280 chars, telegram-ready)
   - `recommended_action` (long / short / none)
   - `hcs_dispatch` (≤600 chars, agent's first-person voice for
     on-chain anchoring) **← new in rubric v2**
   - `proof_action` (standard / dedicated_topic) **← new in rubric v2**
4. **Commits the dispatch on Hedera HCS** via hedera-agent-kit. When
   the agent chooses `dedicated_topic`, the kit's
   `create_topic_tool` mints a new topic and the dispatch is
   written there as a permanent reference-quality artifact.
5. **Executes a paper trade** on BSC via PancakeSwap V2, with a
   safety stack (kill switch, asset registry, liquidity floor,
   slippage bounds). Live trading is gated behind a calibration
   loop visible on the public scorecard.
6. **Broadcasts** the verdict to a public Telegram channel with
   the HashScan URL embedded.
7. **Tracks outcomes** at T+1h, T+1d, T+7d, attributed back to the
   original signal.

The output is a public credibility surface that the system cannot
misremember — every claim about the agent's track record traces
to a row that has a HCS timestamp + rubric version + on-chain
dispatch.

---

## How Hedera Agent Kit fits

**Direct dependencies used**

| Tool                                        | Where                            | What it does                                                                                                            |
| ------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `submit_topic_message_tool`                 | proof-hedera.ts:140-150          | Writes the agent's `hcs_dispatch` to HCS for every scored signal. Anchors the agent's first-person commitment on chain. |
| `create_topic_tool`                         | proof-hedera.ts:152-168          | Mints a new HCS topic when the agent's `proof_action === 'dedicated_topic'` (conviction ≥ 90 reference-quality calls).  |
| `transfer_hbar_tool`                        | proof-hedera.ts:128-138, 158-168 | Escrow fee debits / treasury releases.                                                                                  |
| `coreAccountPlugin` + `coreConsensusPlugin` | proof-hedera.ts:10               | The tool registry the rest of the code reads from.                                                                      |

**Architecture**

```
GitHub commit → detectors → LLM agent (Kimi K2)
                                ↓
                  produces {conviction, thesis,
                            hcs_dispatch, proof_action}
                                ↓
              ┌─────────────────┴───────────────────┐
              │                                     │
   proof_action === 'dedicated_topic'?              No
              │ Yes                                 │
              ▼                                     │
    create_topic_tool ──► dedicated topic ID        │
              │                                     │
              ▼                                     │
    submit_topic_message_tool ──► topic A           │
    (agent's dispatch on dedicated topic)           │
              │                                     │
              └─────────────────┬───────────────────┘
                                ▼
                  submit_topic_message_tool ──► default topic
                  (agent's dispatch with optional
                   pointer to the dedicated topic)
                                ▼
                    Anchored on Hedera HCS
                    https://hashscan.io/...
```

**Agentic story**

The agent decides:

1. **Whether to act at all** (`recommended_action: 'long' | 'short' | 'none'`)
2. **What to say on chain** (`hcs_dispatch` — its first-person
   commitment, not infrastructure boilerplate)
3. **Whether the call warrants its own HCS topic** (`proof_action:
'standard' | 'dedicated_topic'`) — this directly drives a
   `create_topic_tool` invocation from hedera-agent-kit.

The agent's output controls a Hedera Agent Kit tool invocation in
both fields. The dispatch is the verbatim payload of an HCS write;
the proof_action is the gating condition for a topic creation +
dispatch fan-out. This is the kit being used as the agent's
**voice on chain** rather than just as plumbing.

---

## Public-facing surfacing

Every page on `lenitnes.persidian.com` exposes Hedera:

| Surface                 | What it shows                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Landing**             | "Every signal is timestamped on Hedera HCS"                                                                                                               |
| **/scorecard**          | "HCS-proofed %" stat card                                                                                                                                 |
| **/methodology**        | Long-form explanation of the proof chain                                                                                                                  |
| **/signals/[id]**       | **New:** "On-chain dispatch · the agent's words on Hedera" panel showing the dispatch verbatim with HashScan links to both the default + dedicated topics |
| **/public/proof/[id]**  | Same dispatch panel; OG image includes "Hedera: HCS anchored"                                                                                             |
| **Telegram broadcasts** | Every signal post includes the dispatch + HashScan URL: "🪶 Anchored on Hedera (dedicated topic)"                                                         |
| **API**                 | `/api/scorecard` returns `proofCoverage.{withHederaHcs, totalSignals, pct}`                                                                               |

The HashScan link is on every signal detail page. Anyone can verify
the agent's claim by clicking through.

---

## Live numbers (as of submission)

- **HCS-proofed signals:** ~44% (verifiable on
  https://lenitnes.persidian.com/scorecard)
- **Total signals scored:** 16+
- **Rubric version:** v2 (Hedera-aware, 2026-06-26)
- **Hedera operator account:** `0.0.9137770` (testnet, ECDSA)
- **Default HCS topic:** see live config
- **Dedicated topics:** minted by the agent on conviction ≥ 90
  signals; visible on `/signals/[id]` as a separate HashScan link

---

## What we'd want from Hedera

See [`docs/HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md). High-impact
items in our view:

1. A typed result envelope for tool invocations (success / failure
   are currently mixed shapes that bit us in production).
2. A first-class LangChain / OpenAI-function-calling adapter so
   the kit's tools can be passed directly to an LLM's tool loop.
3. Documented retry / timeout policy (or built-in `maxRetries`).
4. Documentation of the v2 → v3 `tool.execute` signature change.

We'd contribute PRs for any of these if helpful.

---

## Source pointers

- Hedera integration: [`apps/api/src/services/proof-hedera.ts`](../apps/api/src/services/proof-hedera.ts)
- Agent rubric v2 (introduces `hcs_dispatch` + `proof_action`):
  [`apps/api/src/services/agent/rubric-v2.md`](../apps/api/src/services/agent/rubric-v2.md)
- Loop wiring (where the agent's `proof_action` triggers
  `create_topic_tool`):
  [`apps/api/src/execution/loop.ts`](../apps/api/src/execution/loop.ts)
  search for `proof_action === 'dedicated_topic'`
- Public dispatch panel:
  [`apps/web/src/app/signals/[id]/page.tsx`](../apps/web/src/app/signals/%5Bid%5D/page.tsx)
  search for "On-chain dispatch"
- Telegram dispatch broadcast: [`apps/api/src/services/notify.ts`](../apps/api/src/services/notify.ts)
  search for "Anchored on Hedera"
- Methodology page (public narrative):
  https://lenitnes.persidian.com/methodology

— Contact: see GitHub repo
