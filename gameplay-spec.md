# VN-RPG — Gameplay Systems Spec (Stats, Inventory & Progression)

> **Status:** Draft — **highly speculative and initial**, like the narrative and
> relationships specs. This is **not a statute**: it will change, gain and lose
> items as the project evolves. It is the first idealization of the gameplay
> layer, resolved in a dedicated interview turn (previously `pending-decisions.md`
> §1 — ⏳ open).
> **Scope:** the gameplay layer — player stats, inventory, and progression.
> It defines how gameplay interacts with the dialogue machine, the relationship
> web, and the LLM context, without redefining those systems.
> **Owner:** project owner + primary dev agent
> **Related:** `narrative-spec.md` (dialogue, payload taxonomy), `relationships-spec.md`
> (web, System 1/2), `vn-rpg-spec.md` (scenes & assets), `day-cycle-spec.md`
> (day logs — the interaction-history store this idea extends),
> `tech-spec.md` (architecture, save schema), `pending-decisions.md`,
> `PERCHANCE-GUIDE.md`, `AGENTS.md`.

---

## 1. Purpose & Nature

This document defines the **gameplay layer** of the VN-RPG: what the player
*is* (stats), *carries* (inventory), and how the game *moves forward*
(progression). It is deliberately light — the project vision (vn-rpg-spec §2)
calls for **"light RPG systems"**, and this game is dialogue-driven: there is no
combat defined, and interaction happens through choices and AI-generated
dialogue.

Like the other ideation specs, nothing here is closed. Ideas may be added,
altered, or removed at any time.

## 2. Design Principles (from the interview)

These principles came out of the definition interview and govern everything
below:

1. **Stats never gate dialogue options.** Dialogue options are generated
   **dynamically by the LLM at interaction time** — the model already decides
   which options fit the context. Asking the AI to produce options that only
   appear if a stat passes would generate options that may never be used.
   Stats instead influence the **tone of the narrative** and **outcomes**.
2. **Code decides mechanics; AI reacts narratively.** Mechanical effects
   (item effects, gift acceptance, stat deltas) are deterministic code. The AI
   narrates the reaction to those mechanics — it does not judge them.
3. **Deterministic where possible.** Stat growth and trait derivation are
   code-driven and testable. AI judgment (System 1) is reserved for the
   relationship web only (`relationships-spec.md` §4.1).
4. **Zero gameplay in the MVP slice.** The base slice (narrative-spec §9)
   validates scene + dialogue only; gameplay starts at a later milestone.

## 3. Stats Model (hybrid)

**Model:** a small **numeric core** + **descriptive traits** derived from it —
hybrid, per the interview.

- The **numeric core** is small (target 3–5 stats, to be pinned at the gameplay
  milestone).
- **Traits** are human-readable descriptors ("empathic", "cold-blooded") derived
  **by code** from a deterministic threshold table (§7.3). Traits — not numbers —
  are what the narrative sees.

### 3.1 Domains (initial)

From the interview, two domains were confirmed (multi-select — the others were
**not** selected and may be revisited later):

| Domain | Axis | What it is |
| --- | --- | --- |
| **Emotional / Empathy** | **Internal** | How well the user reads people and handles their own emotions; perception and self-control. |
| **Reputation** | **External** | How the **world** sees the user — a single, global value. |

> Not selected (open to revisit): Social/Charisma, Mental/Knowledge, Physical,
> Vitality/Energy. Social effects are largely absorbed by the relationship web;
> combat is out of scope, so Physical has no clear use yet.

### 3.2 Reputation vs the relationship web (separate axes)

- **Relationship web** (`relationships-spec.md` §2): **per-NPC** typed bonds
  (friendship, enmity, family, romance) with intensity and direction.
- **Reputation**: a **single global value** — how the world at large sees the
  user, independent of any one bond.
- They are **separate systems** that **feed each other indirectly** (e.g., a
  strong bond contributes to reputation through world reactions, §7.2), but
  neither derives from the other.

### 3.3 Visibility (partial)

Stats are **partially visible**: the player sees **tiers/ranges** ("moderate",
"high") in the **character stats menu** — never exact numbers. The menu is the
same surface defined in `relationships-spec.md` §6 (player stats + NPC
backgrounds read under the relationship gate).

## 4. Stat Growth (deterministic)

Confirmed growth sources (multi-select — the others were **not** selected):

1. **Dialogue choices / actions** — each choice or action in dialogue moves
   stats, with **per-choice deterministic effects** (the classic pattern; the
   effect is authored/engine-side, not AI-judged).
2. **World events** — periodic world events (System 2 style,
   `relationships-spec.md` §4.2) also move stats, especially **reputation**:
   the world talks about you even when you are absent.

**Not** growth sources:

- **System 1 AI judgment** — it feeds **only the relationship web edges**, not
  stats (principle 3).
- **Item use** — items do not move stats (not confirmed; may be revisited).

## 5. Stats in the LLM Payload

- Stats enter payloads as **compact, organized traits** — "empathic, respected
  in the village" — **never raw numbers** (protects the ~24k budget,
  narrative-spec §5.2, and keeps tone natural).
- **Organization requirement (owner mandate):** the payload must be
  **organized into clear, structured sections** so that what enters is easy to
  **analyze afterwards** (which content is being injected). This ties into the
  payload builder (`tech-spec.md` §7.3) and the WebMCP payload dump
  (`tech-spec.md` §6.3) — both must expose the organized structure.
- **Injection scope (user):** the user's traits go to the **narrator** and to
  **NPCs present in the scene**, following the existing injection model
  (narrative-spec §2).
- **Injection scope (NPC→NPC):** NPCs interacting with each other also carry
  each other's relevant traits. **PENDING** — this requires a **loop-control
  mechanism** (preventing infinite loops in NPC↔NPC interaction); deferred
  until that control is designed.
- **Baseline v1 (direct injection):** own background + relevant key items
  (name + description). Everything else stays out of the window until the
  on-demand retrieval idea lands (§8).

## 6. Inventory

### 6.1 Scope (initial)

| Category | Included | Notes |
| --- | --- | --- |
| **Key items** | ✅ | Quest/plot items — few, meaningful, advance the story. |
| **Currency** | ✅ | Gold/resources — exchanged for goods or favors. |
| **Gifts** | ✅ | Given to NPCs to strengthen bonds (dating-sim pattern; connects inventory ↔ web). |
| Consumables | ❌ | Not in the initial scope. |

### 6.2 Gifts (the connecting mechanic)

- A gift is offered to an NPC; **acceptance is a chance based on the bond
  level** between the user and that NPC (bond tier → probability curve,
  code-decided, seeded RNG).
- **Code decides the effect; AI reacts narratively** (principle 2): on
  acceptance the bond gains intensity (deterministic); the AI narrates how the
  NPC receives it. A rejected gift is narratively acknowledged, not a failure
  state.
- **NPCs may also give the user gifts** (e.g., special events).
- **NPCs never give gifts to other NPCs** — explicitly excluded as unnecessary
  complexity.

### 6.3 Item data (three parts)

Each item carries:

1. **Name** — enters the payload when relevant.
2. **Description** — short; enters the payload when relevant.
3. **Lore** — the deeper story of the item; lives in a **separate DB** and is
   retrieved **on demand** (v2+ idea, §8) instead of being injected always.

### 6.4 Item visuals (dependency, not generation)

Item sprites come from a **battle-tested sprite/icon dependency** — we do not
generate or author item art. Baseline candidate: **Kenney asset packs** (CC0
public domain — 40k+ assets, the indie standard; also OpenGameArt CC0 as a
secondary source). **License verification is a setup step** (the project ships
publicly on Perchance). The choice is integrated, not created.

## 7. Progression

### 7.1 Model — story-driven, pure

**No XP and no levels.** Progression **is the story**: scenes unlock through
events, bonds, and flags (user-driven scene progression, narrative-spec §4).
Stats/traits/reputation **grow as consequences** of play (§4), not as a
leveling treadmill.

### 7.2 What higher stats/reputation unlock (all four confirmed)

| Effect | How |
| --- | --- |
| **Initial disposition of unknown NPCs** | Strangers arrive with a different initial stance (respect / distrust) depending on reputation — enters the payload as **tone**, not a gate. |
| **New scenes / locations** | Reputation/traits open access: new areas, invitations, special events. |
| **New traits** | Crossing thresholds in the numeric core generates new descriptors (§7.3). |
| **World reactions** | System 2 / world events mention the user — the living world reacts to fame (reputation feeds the world-event catalog). |

### 7.3 Trait derivation — code (threshold table)

Traits are derived **by code** from a **deterministic threshold table** per
domain (e.g., Empathy ≥ X → "perceptive"; Reputation ≥ Y → "respected in the
village"). Pre-defined, predictable, unit-testable. The AI never generates
traits.

## 8. On-Demand Lore Retrieval (idea — future, v2+)

Registered idea from the interview: a **keyword-search / retrieval system
(RAG or BM25-style)** that stores lores so they are **loaded on demand by the
LLM itself**, instead of loading everything into the window.

- **Applies to item lore** (only fetched when the LLM will use the item).
- **Applies to backgrounds too:** in a scene with N NPCs, an NPC interacting
  with the user loads **its own background** and — if the bond rule allows
  (stranger rule, narrative-spec §2.1) — the **user's**; it does **not** load
  the other NPCs' backgrounds. Each character only loads what the character it
  is interacting with needs.
- **Status:** idea registered. **Baseline v1 = direct injection** (§5). The
  mechanics (likely a multi-call generation loop: the LLM requests a lore → the
  app fetches it → a second generation pass with the lore injected), the
  feasibility, and the exact retrieval technique are **to be prototyped in a
  later milestone** — complexity is unknown and explicitly flagged.
- **Extended to interaction history:** the same idea applies to **per-character
  day logs** (`day-cycle-spec.md` §7) — when an NPC lacks context for something
  the user mentions (its window was compressed by summaries), it queries the
  day-log store (its full interaction history with the user) **instead of
  inventing**. Same mechanics/feasibility caveats apply.
- **Design note:** the payload builder is being designed **organized** (§5) so
  this mechanism can slot in later without rework.

## 9. MVP Scope (base slice)

**Zero gameplay in the MVP slice.** The base slice (narrative-spec §9)
validates scene + dialogue only — no stats, no inventory, no reputation. The
save schema may evolve freely later via Dexie versioning (`tech-spec.md` §7.2).

## 10. Persistence & Data Model (future sketch)

When the gameplay milestone starts, the Dexie schema (`tech-spec.md` §7.2)
gains gameplay tables, e.g.:

| Table | Purpose |
| --- | --- |
| `stats` | Per-character numeric core + derived traits (user and NPCs) |
| `reputation` | The user's global reputation value (or a field in `save`) |
| `inventory` | Owned items: key items, currency, gifts (item key, count, state) |
| `itemLore` | Item lores (name/description vs lore split, §6.3) — the retrieval DB for §8 |

This is a **sketch only** — deferred until the gameplay milestone begins.

## 11. Explicitly Open Items / To Be Tested

| Item | Notes |
| --- | --- |
| Numeric core final shape | Target 3–5 stats; only **Emotional/Empathy** and **Reputation** confirmed; others (social, mental, physical, vitality) may be revisited |
| Ranges & scales | Exact ranges per stat — pin at the gameplay milestone |
| Trait threshold tables | Content per domain (code-derived, §7.3) — author at the gameplay milestone |
| Gift acceptance curve | Bond tier → probability mapping; seeded RNG semantics (reuse of `seedrandom`, tech-spec §8.1) |
| NPC→NPC stat injection | PENDING — needs loop-control design before implementation (§5) |
| On-demand retrieval (v2+) | Mechanics, feasibility, RAG vs BM25 vs alternatives (§8) |
| Item sprite library | Kenney baseline; exact pack + license verification at integration (§6.4) |
| Reputation ↔ web coupling rules | Indirect feed details (bond → reputation via world events; §7.2) |
| World-event catalog that moves stats | Content and cadence — ties to System 2 (`relationships-spec.md` §4.2) |
| Organized payload format | Exact section structure for gameplay content (§5) — design with the payload builder |
| Character stats menu layout | Player stats + NPC backgrounds in one surface (relationships-spec §6); ranges vs tiers presentation |

## 12. Next Steps

1. **Approve this spec** and update `pending-decisions.md` §1 (open → answered,
   landing spot = this document).
2. When the **gameplay milestone** begins: pin the numeric core (domains,
   ranges), author the trait threshold tables, and draft the gift acceptance
   curve.
3. Design the **organized payload format** with gameplay sections as part of
   the payload builder work (`tech-spec.md` §7.3).
4. Prototype the **gift flow + acceptance** in the slice after MVP.
5. Keep this spec as a living document — add/remove items as the game takes
   shape.
