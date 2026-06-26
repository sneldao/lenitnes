# Feedback on hedera-agent-kit (from the LENITNES integration)

> Submitted as part of the Hedera AI Bounty submission. We've been
> running hedera-agent-kit v3.8.2 in production since 2026-06 with
> the agentic trading-intelligence system at
> [`lenitnes.persidian.com`](https://lenitnes.persidian.com). The
> integration is in
> [`apps/api/src/services/proof-hedera.ts`](../apps/api/src/services/proof-hedera.ts).

This document is split into two parts: **concrete bugs / friction**
we hit while integrating, and **ideas** for where the kit could go
to better serve agentic use cases.

---

## Bugs / friction we hit

### 1. `tool.execute` signature change between v2 and v3 (silent break)

**What:** In hedera-agent-kit v2, `tool.execute(jsonString)` accepted a
JSON-encoded string. In v3 (current), it takes a parsed object. The
change is undocumented in the migration notes we could find. Passing a
string in v3 triggers a cryptic `"Field '' - Expected object, received
string"` error from the underlying zod validator.

**How we worked around it:** Normalize the arg in our wrapper:

```ts
const normalizedArg =
  typeof arg === 'string'
    ? (() => {
        try {
          return JSON.parse(arg);
        } catch {
          return arg;
        }
      })()
    : arg;
```

([proof-hedera.ts:60-69](../apps/api/src/services/proof-hedera.ts))

**Suggestion:** Either keep both call signatures supported, or surface
a clearer error message ("v3 expects parsed object, got string —
JSON.parse before invoking") when a string is passed.

### 2. `PrivateKey.fromString` auto-detect picks ED25519 for ECDSA keys

**What:** The Hedera SDK's `PrivateKey.fromString(raw)` heuristic
treats a `0x`-prefixed 32-byte raw key as ED25519. Our production
operator account (`0.0.9137770`) is `ECDSA_SECP256K1`. Auto-detect
silently produces the wrong key type; messages signed by it are
rejected with `INVALID_SIGNATURE` at submission time, but the
client appears to initialize fine.

This isn't strictly an Agent Kit bug (it's in `@hashgraph/sdk`), but
the Agent Kit inherits the surface. New users who follow a `setup`
quickstart with an ECDSA account hit this immediately.

**How we worked around it:**

```ts
function parseOperatorKey(raw: string): PrivateKey {
  const explicit = (config.hedera.operatorKeyType ?? 'ecdsa').toLowerCase();
  if (explicit === 'ed25519') return PrivateKey.fromStringED25519(raw);
  if (explicit === 'ecdsa') return PrivateKey.fromStringECDSA(raw);
  return PrivateKey.fromString(raw);
}
```

We expose `HEDERA_OPERATOR_KEY_TYPE` as an env var with a default of
`ecdsa` (since most production accounts are ECDSA today).
([proof-hedera.ts:20-25](../apps/api/src/services/proof-hedera.ts))

**Suggestion:** In the Agent Kit's `setup` / `getClient` helpers,
accept an explicit `keyType: 'ed25519' | 'ecdsa'` option. Document
that auto-detect is unreliable for raw 32-byte keys.

### 3. Tool result envelope mixes success and failure shapes inconsistently

**What:** `submit_topic_message_tool` and `create_topic_tool` return
an envelope with slightly different shapes depending on outcome:

```
// Success
{"raw":{"status":"SUCCESS","transactionId":"0.0.xxx@123.456"},
 "humanMessage":"Message submitted successfully with transaction id 0.0.xxx@123.456"}

// Failure
{"raw":{"status":{"_code":1},"error":"Failed to submit..."},
 "humanMessage":"Failed to submit message to topic: ..."}
```

On success `raw.status` is a string; on failure it's an object with
`_code`. The `transactionId` only appears in the success envelope.

The mixed shape caused a real bug for us early on: we stored the
entire envelope JSON in a `hedera_hcs_message_id` column. Reads then
saw a string-typed value and our "coverage %" stat reported 100%
even when every HCS write was failing. We had to write defensive
parsing:

```ts
function extractTxId(result: string): string | null {
  try {
    const parsed = JSON.parse(result);
    if (parsed?.raw?.status === 'SUCCESS') {
      if (parsed.raw.transactionId) return String(parsed.raw.transactionId);
      // Fallback to humanMessage regex if transactionId is missing
      if (typeof parsed.humanMessage === 'string') {
        const match = parsed.humanMessage.match(/0\.0\.\d+@\d+\.\d+/);
        if (match) return match[0];
      }
    }
    return null;
  } catch { ... }
}
```

([proof-hedera.ts:95-121](../apps/api/src/services/proof-hedera.ts))

**Suggestion:** Normalize the envelope. Either always include
`transactionId` (null on failure), or split into a tagged union
result type the consumer can pattern-match against. Make it
TypeScript-typed so the discriminator is checked at compile time
instead of via duck typing.

### 4. `create_topic_tool` topicId extraction has the same problem

**What:** Same as #3, `create_topic_tool`'s result also has the topic
ID inconsistently placed. We had to write a `createTopic` wrapper
that tries `parsed.raw.topicId`, then `parsed.topicId` (older
versions), then a regex against `humanMessage`. None of these are
documented as the contract.
([proof-hedera.ts:152-168](../apps/api/src/services/proof-hedera.ts))

**Suggestion:** Same as #3 — a typed result shape.

### 5. No first-class LangChain / function-calling adapter

**What:** The kit ships tools that look LangChain-shaped (they have
`method`, `execute`, etc.) but we couldn't find a single import that
gave us `LangChainTool[]` or an equivalent ready for an LLM
tool-calling loop. We ended up calling tools imperatively from our
own code. This works, but it's not the "agentic" pattern that the
kit's name suggests.

**Suggestion:** Expose a thin adapter — `tools.asLangChainTools()`
or `tools.asOpenAIFunctions()` — that returns a ready-to-pass array
to the major LLM SDKs. This would close the loop on "Hedera Agent
Kit" actually meaning "tools an LLM agent can use directly".

### 6. Retry / timeout behavior isn't built-in

**What:** Hedera node RPC sometimes hiccups; tx submissions
intermittently time out at 10-30s. The kit doesn't wrap calls in
retry or timeout semantics — failures surface as raw errors.

**How we worked around it:** A `withRetry` wrapper with a 20s
AbortController per call.
([proof-hedera.ts:71-83](../apps/api/src/services/proof-hedera.ts))

**Suggestion:** Either ship an opt-in retry policy (similar to how
the OpenAI SDK has `maxRetries`), or document the recommended
pattern in the README.

---

## Ideas / improvements

### 1. A "proof anchor" higher-level tool

Most agentic systems that use Hedera HCS are doing some flavor of
"commit this thing on chain as proof" — same payload structure
(timestamp, ID, content), same topic, same memo convention. We
literally built `writeHcsMessage(payload, opts)` and use it the same
way every time.

A `proof_anchor_tool` that takes `{kind, signalId, content, topicId?,
memo?}` and returns `{transactionId, topicId, anchorUrl}` (with the
HashScan URL pre-formatted) would let agents commit proofs in one
call. Plus a matching `read_proof_anchor_tool` that reads back from
HashScan / mirror node would close the verification loop.

### 2. Tool catalog with usage examples

The current README lists tool names but examples are sparse. For
each tool, a "here's an end-to-end snippet" block would massively
reduce the integration time. Specifically:

- `submit_topic_message_tool`: showing the message size limit and
  the topic creation flow you have to do first
- `transfer_hbar_tool`: showing how to handle multi-transfer
- `create_topic_tool`: showing the memo convention and what
  topicId format you get back

### 3. Cost / fee preview

Production agentic systems care about cost. Every Hedera call has a
fee (HBAR-denominated, but the kit doesn't surface it). An optional
`estimateFee(method, args)` would let agents make a budget-aware
decision before invoking. Even an approximate static lookup table
("submit_topic_message_tool: ~$0.0001") would help.

### 4. A test mode that doesn't require a funded account

For unit testing, a mock client / replay mode would help massively.
Currently we mock the entire `proof-hedera.ts` module in tests
because there's no way to exercise the kit without real HBAR.

### 5. Better separation between "wallet" and "tools"

The current pattern bundles wallet setup (client + operator) with
tool invocation. For agentic systems where the LLM picks which
account to use (multi-tenant, multi-treasury), it'd help to have
the tools accept the client as a parameter rather than read from a
global. (We did the obvious — keep our own `getClient()` and pass
it in — but it's a minor friction point.)

---

## What's working really well

- **The plugin system** (`coreAccountPlugin`, `coreConsensusPlugin`)
  is a clean abstraction. Easy to import only what we need.
- **`@hashgraph/sdk`'s `Client.forTestnet()` / `forMainnet()`** is
  exactly the right API surface.
- **HashScan URLs are stable and predictable**:
  `https://hashscan.io/testnet/transaction/{txId}` —
  no API key needed for verification, which makes our public proof
  surface possible.
- **HCS message latency is fast** — consistently under 5s end-to-end
  for testnet writes, which is plenty for our "anchor at signal
  detection time" use case.

We'd happily contribute fixes for any of the bugs above as PRs if
the team wants them. Let us know.

— LENITNES team, June 2026
