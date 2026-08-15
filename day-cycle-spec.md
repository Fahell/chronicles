# VN-RPG — Day Cycle & End-of-Day Processing Spec

> **Status:** Draft — **highly speculative and initial**, like the other
> ideation specs. This is **not a statute**: it will change, gain and lose
> items as the project evolves.
> **Scope:** the in-game time structure (days and periods), the **day-log
> store** (world lore), and the **end-of-day processing run** — the batched
> evolution of System 1 (relationship scoring) plus the two-tier summarization
> that keeps character context within budget.
> **Owner:** project owner + primary dev agent
> **Related:** `relationships-spec.md` (System 1 — this spec restructures its
> timing), `narrative-spec.md` (memory & summarization §5, payload taxonomy
> §5.3), `vn-rpg-spec.md` (day/night visual effect §3.3), `gameplay-spec.md`
> (on-demand retrieval idea §8), `tech-spec.md` (persistence §7.2, platform
> facts §1), `pending-decisions.md`, `PERCHANCE-GUIDE.md`, `AGENTS.md`.

---

## 1. Purpose & Nature

System 1 (`relationships-spec.md` §4.1) was originally idealized as an **AI
judgment that scores the user's dialogue interactions**. This spec restructures
**when and how** that judgment runs: **not per interaction** (which would call
the LLM constantly), but **in a batched end-of-day run**, driven by an in-game
day structure.

The core idea from the owner: divide time into **in-game days**; at the **end
of each day** (when the user sleeps), a process:

1. reads the **day logs** — the world lore of that day's user↔NPC interactions
   (one log per NPC per day, plus NPC↔NPC when present);
2. has the **LLM analyze each NPC's day individually** and **score** the
   interactions — **for both sides** (user→NPC and NPC→user); and
3. updates the **relationship web edges** only (never stats).

This eliminates per-interaction LLM calls without losing judgment quality: the
LLM understands the full context of a day's conversation and can score it.

## 2. Design Principles

1. **Batch, don't call per interaction.** Relationship judgment happens once
   per day-end, in bounded batches — not on every dialogue turn.
2. **Code decides mechanics; AI judges relationships.** Unchanged from
   `gameplay-spec.md` §2 and `relationships-spec.md` §4.1.
3. **Save everything; inject only summaries.** Full transcripts are persisted;
   only **summaries** enter LLM payloads — the *daily context economy*
   (recycling context space each day).
4. **Two complementary summarization mechanics.** The **daily summary**
   (summarizes each day) and the **window summary** (compresses the pile of
   daily summaries when a character's window fills). One does not replace the
   other.
5. **Malformed scoring output → re-call (no fallback), bounded.** The parser
   rejects malformed output and re-issues the call, capped at 2–3 attempts per
   NPC — never an infinite loop.
6. **Scoring touches only the web.** End-of-day scoring updates relationship
   edges; stats remain deterministic (`gameplay-spec.md` §4).

## 3. In-Game Day Structure

- A **day** is a sequence of **periods** — baseline: **Morning / Afternoon /
  Night** (tunable).
- Each period holds up to **N scenes/interactions** (baseline: **up to 3 per
  period**, tunable). When a period's budget is spent, the next scene advances
  the clock to the next period.
- When **Night**'s budget is spent — or earlier, by choice — the **day ends**.
- **Sleep is a player action** ("rest/sleep"): the user decides when to end the
  day. Sleeping **triggers the end-of-day processing run** (§5). Placement: **a
  scene-level action candidate** — **not** in the basic pause menu
  (`vn-rpg-spec.md` §8.2); exact placement TBD.
- **Time-of-day is game context.** NPCs know whether it is day, afternoon, or
  night — the current period is injected into payloads as a **named context
  section** (`narrative-spec.md` §5.3), so dialogue can reference the time of
  day naturally.
- The day/night **visual** cycle (`vn-rpg-spec.md` §3.3) is now backed by this
  structural clock: the period drives both the visual effect and the payload
  context.

## 4. The Day-Log Store (world lore)

**Table `dayLogs`** (Dexie — `tech-spec.md` §7.2): full verbatim transcripts of
the day's interactions, keyed by **(dayId, character pair / NPC)** and
**period**, with a stored **character count** per log (used by the batching
safety check, §5).

- **Scope:** user↔NPC interactions **and** NPC↔NPC interactions that happen in
  scenes. The NPC↔NPC logs are kept **for future scoring** — the loop-control
  concern is **pending** (they are not scored yet; `relationships-spec.md` §4.2
  remains pure code).
- **Content:** **full transcripts** (selected choices count as the player's own
  actions — lore, per `narrative-spec.md` §3.1).
- **Persistence: keep everything**, with **observability** to monitor how the
  table grows (Dexie handles large text well, unlike localStorage). Dev/WebMCP
  tooling can report table sizes.
- **Not discarded:** the raw log is the source of truth. Only **summaries**
  enter payloads (§6); the raw log remains queryable (§7).

## 5. End-of-Day Processing (the run)

Triggered by sleep (§3). Runs in **background**; the player wakes on the next
day with an **optional day summary** available — a **narrative recap + discreet
indicators of how bonds changed** ("you grew closer to X") — **no raw numbers**
(per interview).

### 5.1 Collect

Gather the day's logs per character (user↔NPC and NPC↔NPC present).

### 5.2 Batched scoring calls (System 1, evolved)

- **Batch: up to 2 NPCs per LLM call** — more efficient and less error-prone
  than all at once, with **clear separation between the logs** so the model
  does not mix them.
- **Safety check (input budget):** combine two logs only if their **combined
  character count ≤ ~20k**; otherwise **one NPC per call**. If no combination
  fits, deliver one log, then the next.
- **Input: only the day's log** for that NPC — **no bond state, no traits**
  (decision from the interview; keeps the call clean and cheap).

### 5.3 Output format (parseable, no fallback)

Scoring **and** the daily summary are produced **in the same call**. Output is
**line-oriented and parseable** (the same philosophy as the choice format,
`narrative-spec.md` §3.1 — not JSON):

```
user->npc: +3
npc->user: -1
reason: <one short line per direction or combined>
day-memory: <short blurb the NPC remembers of the day>
```

- **No fallback:** malformed output is **rejected** and the call is
  **re-issued**. Cap of **2–3 attempts** per NPC; if exhausted, that NPC gets
  **no score for the day** — recorded in logs/observability. **Never an
  infinite loop.**
- This parse-and-re-call is an **app-level correctness retry**, distinct from
  the plugins' generation-failure retry (`pending-decisions.md` §5) — and it is
  bounded (unlike plugin retries).

### 5.4 Apply scores

- **Both directions are scored** — "a pontuação é para os dois": the LLM emits
  **user→NPC** and **NPC→user** deltas, applied to the directed web edges
  (`relationships-spec.md` §2).
- **Delta bounds: small — −5..+5 per day** (baseline, tunable in tests).
  Edges clamp to the −100..+100 range of the web.
- **Stats are NOT updated** (confirmed): `gameplay-spec.md` §4 stays — stats
  grow deterministically (choices + world events). System 1 feeds **only the
  web**.

### 5.5 Generate daily summaries

The same call emits each NPC's **day-memory** blurb (§5.3) → stored in
`daySummaries` and injected into that character's context (the daily context
economy, §6).

## 6. Two-Tier Summarization (complementary mechanics)

Per the interview, these are **two distinct, complementary mechanics** — the
daily summary does **not** replace the window summary:

| Mechanic | What it summarizes | When it runs | Where it lands |
| --- | --- | --- | --- |
| **Daily summary** | One day of a character's interactions | End of day (with scoring, same call) | `daySummaries` → injected into that character's payload |
| **Window summary** | The pile of daily summaries (and older lore) filling a character's window | When the character's **total context reaches a safe limit (~22k chars)** | Rolling lore summary (`narrative-spec.md` §5.5) |

- **Trigger:** the window summary activates when a character's **total context
  occupies ~22k characters** (safe margin below the ~24k budget) — not a fixed
  day count.
- **What is summarized: only the lore context** — the daily summaries that keep
  populating each character's window. **Everything else is never summarized**
  (the taxonomy of `narrative-spec.md` §5.3 — instructions, place/location,
  scene/visual descriptions, own background, time-of-day).
- **Life history joins the summarizable lore:** a character's growing life
  history (`narrative-spec.md` §5.4) is compressed by the same two tiers —
  daily summaries cover a day's events; the window tier compresses the
  accumulated pile including life history.
- **Naming matters:** each piece of information that goes into context is
  **named** (the taxonomy's rows) so there is no confusion about what can and
  cannot be summarized.
- **Dev observability:** the ~22k trigger and the daily-summaries pile are
  visible in the **dev context inspector** (`tech-spec.md` §6.4) per voice,
  alongside the budget bar against the ~24k window.

## 7. On-Demand Retrieval from Day Logs (future — v2+)

When an NPC lacks context for something the user mentions (its window was
compressed by summaries), the NPC can **query the day-log store** — its full
interaction history with the user — **instead of inventing**.

This **extends the on-demand retrieval idea** (`gameplay-spec.md` §8) from item
lore / backgrounds to **per-character interaction history**. The mechanics (a
multi-call generation loop: the LLM requests a log → the app fetches → a second
pass with the log injected), feasibility, and retrieval technique are **to be
prototyped later** — complexity is explicitly flagged.

## 8. Platform Facts (recorded here for the processing run)

- **Output limit:** the Perchance text LLM has an output limit of **~3.5k
  characters** per call (per the owner). Consequences:
  - daily summaries are sized to fit this output;
  - the **2-NPCs-per-call batching must be verified** against this limit — if 2
    summaries per call risk being cut incomplete, fall back to **one call per
    daily summary** (§5.2 safety check).
  - The **window summary is not affected**: compressing ~24k chars into ~3k
    fits a single call.
- **Input budget unchanged:** ~6k tokens ≈ ~24k characters (the same
  approximation; the tokenizer gives exact calibration — `tools-report.md` §4.1).
- **No app-level generation retry/timeout** (`pending-decisions.md` §5) — but
  the bounded parse-and-re-call (§5.3) is a correctness retry, capped at 2–3.

## 9. Data Model Sketch (Dexie — `tech-spec.md` §7.2)

| Table | Purpose |
| --- | --- |
| `dayLogs` | Full transcripts: `(dayId, characterId/pair, period, transcript, chars)` |
| `daySummaries` | Per-character daily summaries + scores: `(dayId, characterId, summary, scoreUserToNpc, scoreNpcToUser, reason)` |
| `relationships` (existing) | Edges updated by the scoring run (§5.4) |

Both new tables are **mode-aware** (dev/prod DBs separated, `tech-spec.md`
§7.2) and **persist across sessions**.

## 10. Explicitly Open Items / To Be Tested

| Item | Notes |
| --- | --- |
| Scenes per period (N) | Baseline 3 per period — tunable |
| Number of periods | Baseline Morning/Afternoon/Night — tunable |
| Sleep timing | Whether sleeping can end the day mid-period (before Night's budget) |
| Sleep trigger placement | Scene-level action candidate — not in the basic pause menu (`vn-rpg-spec.md` §8.2); placement TBD (§3) |
| Batch combination threshold | ~20k chars combined — verify with the tokenizer |
| Delta calibration | −5..+5 baseline — tune in tests (relationship tiers, `relationships-spec.md` §5) |
| Attempt cap | 2–3 re-calls per NPC — exact value |
| Output-limit verification | ~3.5k chars — confirm 2 summaries per call or fall back to 1 |
| NPC↔NPC log scoring | Logs stored; scoring **future** — loop-control pending |
| On-demand retrieval from day logs | Mechanics/feasibility (v2+) — extends `gameplay-spec.md` §8 |
| Day summary UI | Recap + discreet bond-change indicators — layout/contents |
| Observability for `dayLogs` growth | Monitor table size in dev/WebMCP tooling |

## 11. Next Steps

1. When the System 1 / relationships work begins: implement the **scoring run**
   with mocks — batch of 2, parseable output, re-call cap, delta application
   (unit-testable per `tech-spec.md` §8).
2. Wire the **period/time-of-day** into the payload builder as a named context
   section (`narrative-spec.md` §5.3).
3. Add `dayLogs` / `daySummaries` to the Dexie schema at the right milestone
   (`tech-spec.md` §7.2).
4. Validate the **output-limit batching** (2 vs 1 per call) on the platform via
   `test-prompt.txt`.
5. Keep this spec as a living document — add/remove items as tests reveal what
   works.
