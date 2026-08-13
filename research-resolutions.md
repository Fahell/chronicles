# VN-RPG — Research Resolutions (ready-made solutions for open items)

> **Status:** Research report — selects open items from the specs that can be
> resolved **now** with battle-tested patterns, and provides ready-made
> solutions. The technical baselines proposed here are applied into the specs
> (marked as *baseline proposals*); numbers are tunable and final calibration
> happens in tests / on the platform via `test-prompt.txt`.
> **Owner:** project owner + primary dev agent
> **Related:** `pending-decisions.md`, `narrative-spec.md`, `relationships-spec.md`,
> `vn-rpg-spec.md`, `tech-spec.md`, `tools-report.md`.

---

## 0. Selection & method

Chosen from the open items across the specs — only items where research can
produce a **ready-made answer** (product-decisions stay out):

| # | Resolved item | Source spec | Evidence base |
| --- | --- | --- | --- |
| 1 | AI-proposed choices: format & parsing | `narrative-spec.md` §3.1 | LLM output-parsing community practice; dialogue tag systems |
| 2 | Scene definition format + `SceneManifest` schema v1 | `vn-rpg-spec.md` §3.5, `tech-spec.md` §5.3 | Ren'Py, Monogatari, web VN engine patterns |
| 3 | Memory & summarization initial design | `narrative-spec.md` §5 | Mem0 / Microsoft contextual summarization; MemGPT hierarchical memory; recursive summarization |
| 4 | Relationship tiers + System 2 baseline algorithm | `relationships-spec.md` §4.2/§5 | Project Horseshoe friendship model; Wildermyth 5-level system; affinity grids |
| 5 | Factual pins: 5 languages + exact tool versions | `narrative-spec.md` §8.1, `tech-spec.md` §11 | Ethnologue 2026; npm registry (2026-08) |

---

## 1. AI-proposed choices — format & parsing (baseline proposal)

### 1.1 Why not JSON / why not free text

- The Perchance text plugin has **no structured-output API** — only free text.
- Community consensus (LLM output-parsing guides, AI-app engineering threads):
  regex/string-splitting over free-form output is fragile, and asking for JSON
  invites malformed output that breaks everything. A **line-oriented marker
  format** is the battle-tested middle ground: cheap in tokens, easy to
  instruct, and degrades gracefully.
- Dialogue tag systems (e.g. in-game dialogue markup) use exactly this pattern:
  *inline markers + escape characters*.

### 1.2 The format (proposal)

The model emits the dialogue text, then a **choice block at the end**, each
option on its **own line**:

```
(texto de diálogo normal aqui — as many paragraphs as needed)

[choices]
1. Accept — you're not confident
2. Refuse — you have your principles
```

Rules the prompt instructs the model to follow:

1. `[choices]` must be **alone on its own line** — everything before it is
   dialogue.
2. Each option is `N. <text>` on its own line (number + period + space).
3. **At most 4 options** (parser caps).
4. If the model wants a literal `[choices]` inside dialogue, it escapes it as
   `\[choices\]`.
5. If no choices are appropriate, the model simply **omits the block**.

### 1.3 Parsing rules (robust, never crashes)

| Rule | Behavior |
| --- | --- |
| Marker absent | Whole output is dialogue; no choices — normal flow |
| Marker present, zero valid options | Treat block as dialogue (or drop block) — no choices |
| Malformed option line (`no N. prefix`) | Drop that line only |
| Duplicate/empty options | Dedupe, trim, drop empties |
| More than 4 options | Keep first 4 |
| Escaped `\[choices\]` | Unescaped back to literal text, never treated as marker |
| **Fallback** | **Any parse failure → degrade to dialogue-only.** The player is never stuck and the UI never shows garbage. No re-ask (plugins self-retry, `pending-decisions.md` §5) |

### 1.4 Status

- Replaces the "exact delimiters/format **to be studied**" open item with a
  concrete baseline. The **delimiter string** (`[choices]`) and the option
  prefix are the only parts worth tuning; the parser contract is what matters.
- Validation: unit tests for the parser (tiers `unit`), exercised in the mock
  harness (`tech-spec.md` §6.2) with canned malformed outputs.

---

## 2. Scene definition format + `SceneManifest` schema v1 (baseline proposal)

### 2.1 What the engines show

- **Ren'Py:** imperative statements — `scene <bg>` (clears the layer, shows
  the background), `show/hide <character>` for actors, named layers, defined
  image aliases. Scenes are **data-plus-flow**: declarations (data) +
  script (flow).
- **Monogatari (web, TypeScript):** a **script of statements** matched to
  *actions* that update components; an **assets JSON** as the ground truth
  (what the game needs) consumed by the script. Same split: *data (assets) +
  flow (script)*.
- Both converge on the split our spec already sketches: **declarative data
  (manifest) + code escape hatch (ScenePlugin)** — `vn-rpg-spec.md` §3.5 and
  `tech-spec.md` §5.3. The open question was the concrete shape of the data.

### 2.2 Schema v1 (typed TS, validated with Valibot)

```ts
interface SceneManifest {
  schemaVersion: 1;
  id: string;                       // stable scene id (cache/payload key)
  type: 'A' | 'B' | 'C';
  backdrop: {
    assetKey: string;               // cache key → generated image (dev/prod modes)
    prompt?: ImagePrompt;           // prompt params if generation is on-demand
    description: string;            // visual description for narrator payload (§2.2 narrative-spec)
  };
  effects: EffectConfig[];          // declarative, from vn-rpg-spec §3.3
  actors: ActorPlacement[];         // character + pose + position + depth
  transitions?: { enter?: string; exit?: string };  // named transitions (fade/pose-swap)
  floor?: {                        // type-A de-risking hooks (tech-spec §5.4)
    line?: number;                  // pixel row of the floor plane
    scaleAnchor?: { x: number; y: number; size: number };  // reference object size
  };
  camera: { mode: 'fixed' };       // contain/letterbox viewport (tech-spec §5.1)
}

interface ActorPlacement {
  characterId: string;
  pose: string;                     // pose id from the character's pose set
  position: { x: number; y: number };  // stage coordinates
  depth: number;                    // z-order within the character layer
  dimmed?: boolean;                 // active-speaker dimming initial state
}
```

Key decisions grounded in research:

- **Assets referenced by key, not inlined** — the manifest declares *what* the
  scene needs; the loader resolves images through the cache/generation service
  (Monogatari's "assets JSON as ground truth" pattern). Keeps manifests small
  and the cache the single source of truth for pixels.
- **`description` is first-class** — the scene's visual description lives in
  the manifest so the narrator payload builder can read it directly
  (`narrative-spec.md` §2.2 — never send the raw prompt).
- **Effects are declarative configs** (emitter JSON, fog density/color,
  lighting sprites, day-night curve) — reusable across scenes, unit-testable
  with seeded RNG (`tech-spec.md` §5.2).
- **`ScenePlugin` escape hatch stays** for anything non-declarative
  (type C/B scenes, special cases).

### 2.3 Status

Resolves the "scene definition format" open item (vn-rpg §3.5) and drafts the
"Scene manifest schema v1" open item (tech-spec §11). The schema is authored
as typed TS data compiled into the bundle; validated at load.

---

## 3. Memory & summarization — initial design (baseline proposal)

### 3.1 Patterns from the field

| Pattern | Source | Fit for us |
| --- | --- | --- |
| **Contextual summarization** (summarize older than N messages, keep last M verbatim) | Microsoft chat-completion guidance; Mem0 guide | ✅ **Core pattern** — matches "narrator keeps recent turns + summarized lore" |
| **Threshold-triggered summarization** (compress when token count crosses a limit) | SummarizingTokenWindowChatMemory; LangGraph guides | ✅ Trigger mechanism |
| **Rolling summaries** (incremental compression, summary of summary) | Community consensus (multiple guides) | ✅ For long sessions |
| Hierarchical memory (working / episodic / semantic) | MemGPT, Mem0 | 📌 Future — session scope first, per spec §5.1 |
| Memory formation (selective fact extraction) over pure compression | Mem0 | 📌 Future — promising upgrade |
| Story context beats summary-only (DCP/P paper) | arXiv 2411.14672 | ✅ Validates keeping recent turns verbatim + full fixed context |

### 3.2 Initial payload budget (≈24k chars total, `narrative-spec.md` §5.2)

Starting allocation per generation (tunable; calibrated on-platform):

| Section | Budget | Notes |
| --- | --- | --- |
| System instructions | ~3k | Never summarized |
| Scene + visual descriptions | ~3k | Never summarized |
| Character background (own) | ~1k | Own background only; payload version (§5.4 narrative) |
| **Lore summary (rolling)** | ~6k | The summarized part — grows into the budget |
| **Recent turns (verbatim)** | ~8k | Last ~8–10 turns, kept verbatim (contextual summarization) |
| Safety margin | ~3k | Headroom for output/generation variance |

> These are starting numbers, not law. The payload builder (`tech-spec.md`
> §7.3) measures and fails loudly over the hard cap; the *split* is what gets
> tuned on the platform.

### 3.3 Summarization rules (initial)

- **Trigger:** when a voice's accumulated raw turns exceed the "recent turns"
  budget (≈8k chars) — not on a fixed message count (message length varies).
- **Action:** the oldest turns beyond the last ~10 are **compressed into the
  rolling lore summary** (summary-of-summary style); the last ~10 turns stay
  verbatim.
- **What never gets summarized:** system instructions, scene description,
  visual descriptions, own background (the taxonomy's never-summarized rows,
  `narrative-spec.md` §5.3).
- **Summarization prompt:** imperative, extract-only-what-matters (decisions,
  promises, revealed facts, emotional shifts, open threads), **in English**
  (token-efficient, §8.2), output ≤ the lore-summary budget.
- **Per-voice:** narrator and each NPC summarize **their own** memory
  independently; co-present NPCs share the scene's raw turns (shared scene
  memory, §5.1) but summarize into their own stores.
- **Session scope:** summaries live in the `memory` table keyed by
  `(voiceId, type)` with `createdAt`; session-scoped for now (persistence of
  memory across sessions remains open/future).

### 3.4 Status

Turns the "summarization cadence & budget" open item into a concrete baseline:
threshold-triggered rolling summary, verbatim recent window, never-summarized
set protected. Cadence/budget calibration is explicitly deferred to on-platform
validation via `test-prompt.txt`.

---

## 4. Relationship tiers + System 2 baseline (baseline proposal)

### 4.1 Tier model (grounded)

- **Project Horseshoe friendship model (Daniel Cook et al.):** friendship is a
  spectrum — *stranger → acquaintance → friend → close → intimate* — formed by
  four factors: **Proximity, Similarity, Reciprocity, Disclosure**.
- **Wildermyth:** relationships have **5 levels**; **affinity grids** (RPG
  Maker): numeric value per pair, up/down from events.
- Our spec already sketches numeric −100..+100 + named tiers; the research
  validates that shape and provides the tier names and a natural **visibility
  gate**.

Proposed mapping (numeric per directed edge → named tier):

| Range | Tier | Notes |
| --- | --- | --- |
| −100 .. −61 | **Enemy** | Strong negative bond |
| −60 .. −21 | **Rival** | Active conflict/competition |
| −20 .. −1 | **Cold** | Negative lean, still stranger-level |
| 0 .. 19 | **Stranger** | No real bond (default) |
| 20 .. 39 | **Acquaintance** | **Visibility gate opens here** (knows them "well enough", `relationships-spec.md` §6) |
| 40 .. 59 | **Friend** | Reciprocity established |
| 60 .. 79 | **Close friend** | Deep trust |
| 80 .. 100 | **Intimate** | Max positive tier |

> Poses stay **decoupled** from tiers (already decided); the stranger pose set
> is the baseline for anyone below Acquaintance.

### 4.2 System 2 baseline algorithm (deterministic, code-driven)

Per `relationships-spec.md` §4.2: pure code, periodic, seeded RNG, testable.

- **Tick:** one world tick per scene change / N in-game time units.
- **Drift:** each existing NPC↔NPC edge drifts toward its type's baseline
  (e.g. family edges mean-revert toward +60; rivalry toward −40) by a small
  step — prevents unbounded runaway and models "life goes on".
- **Co-presence (Proximity):** NPCs present in the same scene accumulate a
  co-presence counter; crossing a threshold creates/strengthens a positive
  bond (weak friendship) — the simplest Proximity implementation from the
  Horseshoe model.
- **Rare events:** seeded RNG roll per tick per edge (low probability):
  a world event modifies the edge (intensity ±, rare type change, rare bond
  creation between co-present NPCs).
- **Constraints:** bonds are only *created* for characters that have met
  (co-presence) or that were born with the bond (`relationships-spec.md` §3);
  new NPCs "born" with edges already exist in the graph.
- **Determinism:** all rolls use the seeded PRNG (`seedrandom`, already in the
  tools report) so System 2 is reproducible in tests (`tech-spec.md` §8.1).

### 4.3 Status

Resolves the "tier thresholds & names" open item (baseline numbers) and gives
System 2 a concrete v1 algorithm. Thresholds are the tunable part; the
algorithm shape (drift + co-presence + rare events, seeded) is the stable part.

---

## 5. Factual pins

### 5.1 The 5 most spoken languages (MVP UI scope)

Source: Ethnologue 2026 (by total speakers, incl. L2), consistent across
Visual Capitalist / Babbel / ICLS rankings:

| Rank | Language | i18next locale | Notes |
| --- | --- | --- | --- |
| 1 | English | `en` | **Fallback + internal/payload language** (token-efficient) |
| 2 | Mandarin Chinese | `zh` | Simplified (zh-Hans) for UI |
| 3 | Hindi | `hi` | |
| 4 | Spanish | `es` | |
| 5 | Standard Arabic | `ar` | Modern Standard Arabic |

- Fallback chain: detected → list → `en`.
- Internal/payload text stays English (`narrative-spec.md` §8.2); only
  player-visible UI strings get `en/zh/hi/es/ar` resources.
- The list can grow later (French is #6); the i18n architecture is list-agnostic.

### 5.2 Exact tool versions (pinned at research time — 2026-08)

| Package | Version | Note |
| --- | --- | --- |
| `typescript` | **7.0.2** | Current stable (native compiler line); verify toolchain compat at setup |
| `vite` | **8.2.1** | |
| `vitest` | **4.1.10** | |
| `@biomejs/biome` | **2.5.8** | |
| `pixi.js` | **8.19.0** | |
| `pixi-filters` | **6.1.5** | |
| `@pixi/particle-emitter` | **5.0.10** | ✅ Official repo now supports v8 — use it, not the fork (updates `tools-report.md` §1) |
| `three` | **0.185.1** | Lazy chunk only |
| `preact` | **10.29.8** | |
| `@preact/signals` | **2.11.0** | |
| `i18next` | **26.3.6** | |
| `dexie` | **4.4.4** | |
| `valibot` | **1.4.2** | |
| `gpt-tokenizer` | **3.4.0** | |
| `gsap` | **3.15.0** | |
| `seedrandom` | **3.0.5** | |
| `@playwright/test` | **1.62.1** | |
| `fake-indexeddb` | **6.2.5** | |
| `rollup-plugin-visualizer` | **7.0.1** | |
| `pnpm` | **11.21.0** | |

> Versions are a snapshot; re-pin at actual setup (they may move). The
> particle-emitter finding **updates the tools report**: the official
> `@pixi/particle-emitter` v5 is v8-ready, so the fork is no longer needed.

---

## 6. What was applied to the specs

| Item | Spec change |
| --- | --- |
| Choice format & parsing | `narrative-spec.md` §3.1 — concrete format + parser rules |
| Memory & summarization baseline | `narrative-spec.md` §5.5 — budget split + trigger + rules |
| Scene manifest schema v1 | `vn-rpg-spec.md` §3.5 note; `tech-spec.md` §5.3 — schema sketch |
| Relationship tiers + System 2 v1 | `relationships-spec.md` §4.2/§5 — tiers + algorithm |
| Languages pinned | `narrative-spec.md` §8.1 — the 5 locales |
| Versions pinned | `tech-spec.md` §11 — versions table |
| Index updated | `pending-decisions.md` — statuses + links |

## 7. What remains genuinely open (not research-resolvable)

- Gameplay scope (stats/inventory/progression) — product decision, dedicated
  turn.
- Support matrix & a11y baseline — product decision, future turn.
- Regeneration UI surfacing — product/UX decision.
- Intro/New Game/Load/Settings screen contents — product/UX decision.
- Narration frequency/scope, visual-description budget, summarization
  calibration — empirical, tuned on-platform via `test-prompt.txt`.
