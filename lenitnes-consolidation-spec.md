# LENITNES — Consolidation & Intuitive UX Spec

## 1. The single source of confusion

LENITNES's real thesis is compelling — _commit before the outcome is knowable,
grade yourself in public_ — but the UX spends its surface area on abstraction
(oracles, HCS, "the loop") instead of making that contract visible on every
screen. The page reads as **a feed of absences** ("No thesis recorded" ×5)
which teaches the wrong mental model: that nothing happens here.

## 2. Consolidation model: make "One loop. Separate oracles." literal

The tagline is already the right IA. Today it's a slogan; make it the structure.

| Before                                                | After                                              |
| ----------------------------------------------------- | -------------------------------------------------- |
| `Markets \| Research \| How it works \| More`         | `Timeline · Record · Methods` + oracle toggle      |
| Two duplicate feeds (Live signals + Recent judgments) | **One unified timeline**, oracle-toggled           |
| "No thesis recorded" placeholder ×N                   | **State-aware copy** matching the real status      |
| Abstract loop diagram detached from cards             | **Stage badge** on every card maps 1:1 to the loop |
| Parallel scorecards (Markets/Research)                | **One Record view**, oracle-toggled tabs inside    |

### One canonical object

- Markets → a **thesis** (noun of record)
- Research → an **alert** (noun of record)
- Everything else ("judgment", "commit", "verdict") is a **lifecycle stage**
  of that noun, not a separate thing. Retire synonyms from chrome.

## 3. The loop, as a stage badge (not a separate diagram)

The abstract loop `Commit → Detect → Score → HCS → Track` is re-ordered into the
**actual lifecycle** a card lives through, because that is the order a user
experiences it:

```
Detect  →  Commit  →  Track  →  Score
 ▲          ▲          ▲         ▲
 │          │          │         │
change     thesis/     window    graded against
spotted    alert       opens,    the oracle
           notarized   price/    (price, or the
           to HCS      record    published record)
                       moves
```

## 4. State-aware copy taxonomy (kills "No thesis recorded")

This is the highest-leverage change. Every entry gets copy that says _why_ it's
in its current state and _what's happening_, not a shrug.

### Markets (price oracle)

| Stage badge             | Copy (headline)                       | Meaning                                          |
| ----------------------- | ------------------------------------- | ------------------------------------------------ |
| `Detect — watching`     | Change detected — no call committed   | Software changed; window open; thesis not yet in |
| `Commit — pending`      | Notarizing thesis to Hedera HCS…      | Thesis committed locally; proof chain in flight  |
| `Commit — failed`       | Notarization failed — retry           | HCS write failed; **visible, not silent**        |
| `Track — window open`   | Thesis committed · verdict pending    | On-chain; price hasn't moved to adjudicate yet   |
| `Track — verdict soon`  | Price moving — verdict window closing | Oracle condition approaching                     |
| `Score — graded`        | Graded against price · [result]       | Outcome knowable; scored in public               |
| `Score — season closed` | Season closed · losses in the record  | Window sealed; replay, not live                  |

### Research (record oracle)

| Stage badge             | Copy (headline)                               | Meaning                                        |
| ----------------------- | --------------------------------------------- | ---------------------------------------------- |
| `Detect — scanning`     | Scanning — no signal yet                      | Software under watch; no integrity signal      |
| `Detect — flagged`      | Change flagged — alert not yet committed      | Potential integrity issue detected             |
| `Commit — pending`      | Notarizing alert to HCS…                      | Alert committed locally; proof chain in flight |
| `Commit — failed`       | Notarization failed — retry                   | HCS write failed; visible, not silent          |
| `Track — record open`   | Alert committed · record not yet moved        | On-chain; published record hasn't adjudicated  |
| `Track — adjudicating`  | Record moving — awaiting adjudication         | Adjudication event in process                  |
| `Score — graded`        | Graded against the record · [result]          | Adjudicated; scored in public                  |
| `Score — season closed` | Season closed · [result] alerts in the record | Adjudication window sealed; replay, not live   |

Research _does_ seal: the record oracle adjudicates per published-record
window (e.g. a paper's correction/retraction horizon), so the asymmetry with
Markets is only in what "closed" means — price windows close on time, record
windows close on adjudication events. Both oracles therefore expose the same
seven stages.

## 5. Adaptive & adaptable UX

**Adaptive** (reshapes to data/state):

- **Signal-density adaptation** — when the window is full of absences, collapse
  empties into one honest summary line (_"14 changes tracked · 0 committed
  theses"_) and promote change-detection as primary content. Absences never
  own the page.
- **State-aware empty copy** (§4) — the message matches the actual state.
- **Failure made visible** — `Commit — failed` is a real, actionable state
  (error shake + retry), not a silent absence. The product promises honest
  public grading; the UI must be at least as honest about its own failures.

**Adaptable** (reshapes to user):

- First visit → loop legend inline + first-encounter tooltips on jargon.
- Return visit → dense view by default, preference sticks.

## 6. Progressive disclosure hierarchy

Default (collapsed) card = stage badge + one-line headline + confidence.
On expand (accordion) → reveal: detected change, committed thesis/alert,
proof/receipt (HCS timestamp), eventual score.

```
what's committed   →  (prominent, headline)
what's pending     →  (medium, badge + copy)
what's absent      →  (collapsed, with a reason + "see why" path)
```

Absence never owns the page. It's a quiet secondary line _inside_ the
expandable, with a reason and a path to understand it.

## 7. Motion wiring (transitions.dev primitives)

| Product move                       | Primitive          | Why                                        |
| ---------------------------------- | ------------------ | ------------------------------------------ |
| Markets ↔ Research ↔ All toggle    | Sliding tabs       | Shared spine stays anchored                |
| Card expand → thesis/receipt/score | Accordion          | Progressive disclosure, no JS height math  |
| Status copy changing               | Text states swap   | User _registers_ the state changed         |
| Confidence / score updating        | Number pop-in      | "Alive" without a spinner                  |
| Proof-pending (HCS notarization)   | Skeleton reveal    | Finite, verifiable → skeleton, not spinner |
| Notarization failure               | Error state shake  | Visible + actionable, not silent           |
| New committed judgment lands       | Notification badge | Live signal on Timeline nav                |
| Jargon on first encounter          | Tooltip            | Adaptable onboarding, no clutter           |

All primitives ship `prefers-reduced-motion` guards. The _state_ adaptation
(copy, layout, density) does the heavy lifting; motion makes it feel
intentional.

## 8. First move

Unify the two feeds into one oracle-toggled timeline + replace "No thesis
recorded" with state-aware copy. This removes the duplicate-feed and
empty-state confusion, makes the loop legible via stage badges, and turns the
homepage from "a feed of absences" into "an honest live record." Everything
else layers on top of that spine.

See `lenitnes-timeline-prototype.html` for the working implementation.
