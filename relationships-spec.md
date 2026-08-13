# VN-RPG — Relationships System Spec

> **Status:** Draft — **highly speculative and open**, like the narrative spec.
> This is **not a statute**: nothing here is closed; the system may pass through
> countless modifications. It is an initial idealization.
> **Scope:** the relationship web (bonds between characters), the two systems
> that drive relationship levels, and the world-generation vision.
> **Owner:** project owner + primary dev agent
> **Related:** `narrative-spec.md` (memory, NPC poses §6), `vn-rpg-spec.md`
> (scenes & assets), `pending-decisions.md`, `PERCHANCE-GUIDE.md`, `AGENTS.md`.

---

## 1. Purpose & Nature

This document idealizes the **relationship system** — how characters relate to
each other in the game world. It works like in real life: there is life beyond
the user, and NPCs know other NPCs without any user mediation.

Like the narrative spec, this is a living, initial idealization. Ideas may be
added, altered, or removed at any time.

## 2. The Relationship Web (teia)

Relationships are seen as a **web/network** — the only sensible mental model.
The best concrete implementation is **to be discovered** (open item), but the
base model is:

- **Nodes** = characters (user + NPCs).
- **Edges** = bonds, each with:
  - **type** (what kind of bond),
  - **intensity** (how strong), and
  - **direction** (A→B may differ from B→A).

**Initial bond types** (extensible):

- Friendship
- Enmity / rivalry
- Family
- Romance

## 3. How Bonds Are Born (hybrid)

1. **Born with the character.** Characters "are born" into the world already
   carrying some defined bonds — even with characters who are **not in the
   scene and have not appeared in the world yet**.
2. **From events.** Bonds are created/changed through interaction events.

**The auto-existence rule:** the moment an NPC has a bond to someone in its
data, that someone **automatically exists in the world** — even if only by
definition inside another NPC's bond. That character may or may not ever be
**found** in the world:

- If found → the same generation process happens: the AI creates the complete
  character, already linked by the bond that referenced it, plus its own set of
  relationships.

This gives the world real life: NPCs live their own social fabric, independent
of the user.

## 4. The Two Systems (relationship levels from events)

Relationship levels are driven by events, initially in two forms:

### 4.1 System 1 — User ↔ World (AI judgment)

- Governs the user's relationships with others: the bonds the user forges —
  friendship, enmity, etc.
- Based on an **AI judgment system** that **scores the user's dialogue
  interactions** with the NPCs they interact with (actions, choices, tone).
- Output feeds the user↔NPC edges of the web.

### 4.2 System 2 — NPCs ↔ World (pure code, no LLM)

- Governs events between NPCs that have some relationship between them.
- **Purely code-driven** (no LLM): a periodic algorithm modifies relations
  between characters over time.
- Triggered by **periodic random world events** at intervals.
- The algorithm can:
  - adjust the **intensity** of existing bonds, **and**
  - **create or remove** bonds between NPCs.

**Baseline v1 algorithm (deterministic, seeded — from
`research-resolutions.md` §4.2):**

- **Tick:** one world tick per scene change / N in-game time units.
- **Drift:** each existing NPC↔NPC edge drifts toward its bond type's baseline
  (e.g. family mean-reverts toward +60, rivalry toward −40) by a small step —
  prevents runaway and models "life goes on" between the user's visits.
- **Co-presence (Proximity):** NPCs present in the same scene accumulate a
  co-presence counter; crossing a threshold creates/strengthens a positive
  bond — the simplest implementation of the *proximity* factor of the
  friendship model.
- **Rare events:** seeded RNG roll per tick per edge (low probability): a
  world event modifies intensity (±), rarely changes type or creates a bond
  between co-present NPCs.
- **Constraints:** bonds are only *created* for characters that have met
  (co-presence) or were born with the bond (§3); new NPCs "born" with edges
  already exist in the graph.
- **Determinism:** all rolls use the seeded PRNG (`seedrandom`) so System 2 is
  reproducible in tests (`tech-spec.md` §8.1).

## 5. Levels & Scaling (hybrid)

- A **numeric value** per bond (e.g., −100 … +100), from which **named tiers**
  are derived.

**Baseline tier mapping (from `research-resolutions.md` §4.1; thresholds are
the tunable part):**

| Range | Tier | Notes |
| --- | --- | --- |
| −100 .. −61 | **Enemy** | Strong negative bond |
| −60 .. −21 | **Rival** | Active conflict/competition |
| −20 .. −1 | **Cold** | Negative lean, still stranger-level |
| 0 .. 19 | **Stranger** | No real bond (default) |
| 20 .. 39 | **Acquaintance** | **Visibility gate opens here** (§6) |
| 40 .. 59 | **Friend** | Reciprocity established |
| 60 .. 79 | **Close friend** | Deep trust |
| 80 .. 100 | **Intimate** | Max positive tier |

> Grounded in the Project Horseshoe friendship spectrum
> (stranger → acquaintance → friend → close → intimate) and the 5-level
> system of games like Wildermyth. Poses stay **decoupled** from tiers
> (stranger pose set = baseline for anyone below Acquaintance).

> **Poses note:** currently NPC poses are **not** tied to relationship levels
> (the pose gating in `narrative-spec.md` §6 remains as-is — strangers get a
> limited pose set). Reconnecting relationship tiers to pose unlocking is
> deferred/open.

## 6. Visibility (realism rule)

The user's view of the web is gated by relationship level:

- The user only sees an NPC's bonds after reaching a **minimum relationship
  level** with that NPC — "knowing them well enough to know who they relate
  to."
- The user **cannot** see the relationships of someone they have no bond with.
- Exact thresholds: open item.

**Character stats menu (concept):** a UI surface where the player can read a
character's **background story** — the **UI version** (`narrative-spec.md`
§5.4), not the payload version — under the **same gate** that reveals their
bonds: the minimum relationship level. The menu is a new concept and its full
scope is open; for now it is the intended home for player-facing authored
stories (see also `pending-decisions.md` §4).

## 7. World Generation Vision (future)

With a base story mounted and a more molded world idea, the world should
**generate new characters in new locations** through **AI + deterministic
code**:

1. Establish a **pool of character definitions**: species, traits, background
   templates.
2. Hand a template to the AI, which generates the **complete character** —
   from image to background — **and** its bonds (relationships).

This is the mechanism behind §3 (auto-existence → on-demand full generation).

> **Organization note:** where each piece lives is flexible — asset/image
> generation details belong to the scene spec (`vn-rpg-spec.md`); the bond and
> world-generation logic belongs here.

**Future possibilities** (marked, not implemented): encounters where the user
meets characters who already know each other — NPCs that know other NPCs
showing up together, reacting to the user through their own web.

## 8. Persistence

The relationship web **persists across sessions** (saved state) — relationships
survive between play sessions.

## 9. Explicitly Open Items / To Be Tested

| Item | Notes |
| --- | --- |
| Concrete web implementation | Data structure, algorithms, best way to model the teia |
| Bond types beyond the initial 4 | Extensible — future additions |
| Event model details | What counts as a dialogue event (system 1); world-event catalog (system 2) |
| Tier thresholds & names | Baseline mapping in §5; thresholds tunable (research-resolutions §4.1) |
| Relationship ↔ poses | Currently decoupled; may reconnect later |
| Character stats menu scope | The UI surface gated by relationship level (§6) — contents/format open |
| Generation pool | Species/traits/background templates — content and structure |
| Encounters with the web | Future feature (§7) |
| Stack, tooling, framework | Decided after the ideation phase |

## 10. Next Steps

1. Define the **graph data model + bond schema** (type, intensity, direction).
2. Prototype **system 1** scoring from dialogue events (AI judgment).
3. Prototype **system 2** periodic algorithm (code-driven world events).
4. Validate **visibility gating** in the base slice.
5. Keep this spec as a living document — add/remove items as tests reveal what
   works.
