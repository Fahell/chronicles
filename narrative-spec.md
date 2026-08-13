# VN-RPG — Narrative System Spec

> **Status:** Draft — **highly speculative and initial**. This is **not a
> statute**: it will change, gain and lose items as the project evolves. The
> whole point is dynamism — nothing here is fixed. Ideas may be added, altered,
> or removed at any time.
> **Scope:** narrative system — world narrator, AI character dialogue, and
> context management. Complements `vn-rpg-spec.md` (scenes & visual
> techniques). Stack/tooling are still TBD.
> **Owner:** project owner + primary dev agent
> **Related:** `vn-rpg-spec.md`, `relationships-spec.md`, `gameplay-spec.md`,
> `day-cycle-spec.md` (day structure, day logs, two-tier summarization),
> `pending-decisions.md`, `PERCHANCE-GUIDE.md`, `AGENTS.md`, `README.md`.

---

## 1. Foundational Model (the base minimum)

For narration to work, at minimum:

1. **Context** — the world/situation in which the narration happens.
2. **Two characters** — one of them is the user themself.
3. **Character contexts** — who each of them is.

A **story** must exist, even a basic one, to guide the narrative over time.

### 1.1 Two narration voices

| Voice | Role |
| --- | --- |
| **World narrator** | Third-person narrator, like a book. Descriptive and narrative role. |
| **AI characters (NPCs)** | Characters present in the scene who speak via AI dialogue. |

### 1.2 The user is outside the AI description loop

The user **sees the scene and who is in it by themselves** — the AI does not
need to describe to the user what the user can already see. The user is not
"narrated to" about the current scene; they experience it directly.

## 2. Context Injection Model (how the voices know the world)

The core idea: the **image generation prompts** double as **narrative
context** — but payloads receive **visual descriptions derived from the
prompts**, never the raw prompts (see §2.2).

- **World narrator** receives "what is in the scene":
  - the **scene description** (what the backdrop shows), and
  - the **visual descriptions** of the characters present.
- **NPCs** receive their **own** context: who they are (their background),
  plus the **appearances of everyone present** — including the user's — so
  they know who they are talking to (§2.2).
- **The user is not part of this injection** — again, they see the scene
  themselves; nothing about the visible scene is narrated *to* them.

### 2.1 Privacy of backgrounds (current stage)

- **No NPC carries another NPC's background history in its payload.**
- **No NPC carries the user's background history in its payload.**
- **Appearances, however, are shared** (§2.2): knowing what someone looks like
  is not the same as knowing their history.
- At this stage, everyone is a **stranger** to everyone else: background
  histories are *not* shared. Knowledge between characters develops through
  **in-scene interaction** (dialogue), not through payload injection.

> **Future feature (marked, NOT implemented now):** the *known/unknown* model.
> In the world there are two kinds of people — *known* (who share each other's
> backgrounds) and *unknown* (who don't). This adds realism but is deferred for
> complexity reasons.

### 2.2 Prompt vs visual description (never send the recipe)

Sending a raw image prompt as narrative context is like giving someone a cake
recipe when they asked for a slice of cake. Instead, every generated character
(and scene) produces **two artifacts** from the same definition input:

1. **Image prompt** → used only for image generation.
2. **Visual description** → a short, plain-language description of what the
   character/scene looks like; this is what goes into narrator and NPC
   payloads.

The AI derives both. Visual descriptions are compact (a short paragraph) and
are **never summarized** context.

- **Appearances are shared** (unlike backgrounds): an NPC receives the visual
  description of the user and of the other NPCs present in the scene, so
  everyone knows who is in front of them.
- **Backgrounds remain private** (§2.1): appearance ≠ background.
- For scenes, the description is authored as part of the scene definition (or
  AI-derived from the scene prompt at authoring time).

## 3. Dialogue Mechanics

- **User voice: hybrid.** Predefined choices (classic VN style) as the main
  path, plus an option to type **free text**. NPCs react to both.
- **Narrator frequency: hybrid.** Opening (descriptive) narration when entering
  a scene + short narrations between dialogue turns + on-demand/reactive
  narration. Exact balance is to be tuned in experiments.
- **Narrator scope: hybrid.** Describes the world, and sometimes the user's
  actions ("You approach the fire") — situation-dependent, to be tested.
- **Story guide: emergent.** Initially there is **no scripted skeleton** — the
  AI conducts the narrative freely within the given context (scene + characters
  + lore). A basic story exists to give direction over time, but the path is
  not pre-scripted.
- **Always-escape.** The user must **always be able to end a dialogue** — a
  fixed exit option, inside or near the dialogue box, that ends the
  interaction with the NPC. The player is never trapped in a conversation.

### 3.1 AI-proposed choices (action options)

- **Choices are not narrative text:** they can be **selected** and carry
  interaction/action.
- The AI prompt says it **may** (not *must*) include action options for the
  user, when convenient.
- **Parsable format, not JSON.** Choices arrive in the same output as the
  dialogue, but in a simple delimiter format that our code parses and turns
  into selectable options. A simple parseable format is deliberately preferred
  over asking the model for JSON, which can come malformed and break
  everything.
- **Baseline format (line-oriented, from `research-resolutions.md` §1):**
  dialogue text first, then a choice block at the end, one option per line:
  ```
  (normal dialogue text here — as many paragraphs as needed)

  [choices]
  1. Accept — you're not confident
  2. Refuse — you have your principles
  ```
  - `[choices]` alone on its own line starts the block; everything before it
    is dialogue.
  - Each option is `N. <text>` on its own line; at most 4 options.
  - A literal `[choices]` inside dialogue is escaped as `\[choices\]`.
  - If no choices are appropriate, the model omits the block.
- **Parser contract (robust, never crashes):** marker absent → all dialogue,
  no choices; marker present with zero valid options → treat as dialogue;
  malformed lines → dropped individually; dedupe/trim/cap at 4; **any parse
  failure degrades to dialogue-only** — the player is never stuck and the UI
  never shows garbage. No re-ask (plugins self-retry, `pending-decisions.md`
  §5). The delimiter string is the only part worth tuning; the parser
  contract is what matters.
- **Lore filtering.** The *offered* option texts are **not lore** — they must
  not be included in anyone's lore/context. The *selected* option **is lore**:
  it counts as if the player themselves wrote the action they take.
- General rule: **filter what enters the LLM context** — never put non-lore or
  pre-defined information into the window (§5.3).

## 4. Scene Progression

- **User-driven:** the user chooses the next scene from the available options.
  (Scene options themselves are defined by the scene system — see
  `vn-rpg-spec.md`.)

## 5. Memory & Context Window (one of the biggest challenges)

### 5.1 Memory model (starting point)

- **Session memory** as the initial scope.
- **Each voice has its own memory**: the world narrator and each NPC keep
  separate memories. Whether an NPC's payload includes what the narrator says
  (or vice-versa) is **undecided and must be tested**.
- **Real-world inspiration:** NPCs remember what happens while they are *on
  scene* with the user; when they leave the scene, they don't carry it. The
  narrator holds a **unified world memory** that needs **recurring
  summarization** so the window doesn't inflate. NPCs may also need
  summarization.
- **Shared scene memory:** if 2+ NPCs are present with the user, they share the
  memory of that same scene.

### 5.2 The hard constraint (context window)

Per the community-reported plugin limits, the text plugin's LLM has a total
context of roughly **6k tokens**. This space is shared by everything: character
description, instructions/reminders, story summary (lore), previous memories,
and exchanged messages.

**Consequence:** every payload (and every generation call) must fit in this
window — target an average of **≈ 24k characters total, at most**, whenever the
AI generates text.

### 5.3 Context taxonomy (what can and cannot be summarized)

Context must be organized into distinct types, with a clear rule for each:

| Context type | Contains | Policy |
| --- | --- | --- |
| **System instructions** | Voice rules, style, language, format | **Never summarized** — always full |
| **Scene description** | What the backdrop shows (derived from the scene prompt) | **Never summarized** (narrator needs it complete) |
| **Visual descriptions** | What each character/scene looks like (derived from prompts) | **Never summarized** — injected into narrator/NPC payloads |
| **Character background** | Who each character *is* | Full for its own character; **never shared** with others (current stage) |
| **Game lore** | What happens in dialogues and in the game world | **Summarizable** — this is the main thing that gets summarized |
| **Offered choices (unselected)** | Option texts shown to the player | **Not lore** — filtered out of context |
| **Selected choice** | The option the player picked | **Lore** — treated as the player's own action (§3.1) |
| **Memories / exchanged messages** | Past conversation | Summarizable (with recurring summarization) |
| **Day summaries (daily lore)** | Per-character daily summaries of the day's interactions | **Summarizable** — the daily tier of the two-tier mechanic (§5.6); injected into that character's context |
| **Time of day (period)** | Morning / Afternoon / Night — from the day system | **Never summarized** — injected as a named section (`day-cycle-spec.md` §3) |
| **User identity** | The player's name/story/appearance | Background: **private** (strangers). Name + appearance (visual description): **shared** with present NPCs |

> **User stats/traits:** the player's gameplay traits enter payloads as
> **compact, organized content** (never raw numbers) under the same discipline
> — see `gameplay-spec.md` §5. The payload must be structured so what enters
> is analyzable (ties to the payload builder, `tech-spec.md` §7.3).

Rule of thumb: **lore and old memories are summarized; everything a voice needs
to act correctly (instructions, scene/visual descriptions, own identity) stays
complete.** The narrator always gets the full scene + visual descriptions;
NPCs must not have non-lore information summarized.

### 5.4 Content size limits (protecting the lore budget)

The window must reserve space for the **current story's lore**. Initial limits
(compact; tunable in tests):

| Content | Initial limit | Enforced by |
| --- | --- | --- |
| User background story | **≤ ~300 chars** | UI blocks submission until it fits |
| Character (NPC) backgrounds | **≤ ~300 chars** | Authored within limit |
| Visual descriptions | Short paragraph (budget TBD) | AI derives them compactly |

If these grow unchecked, the window gets compromised and there is no room left
for the current story's lore.

**Dual versions of background stories** (efficiency optimization, §8.2):

- **Payload version** — concise, direct, no narrative preamble, **in English**.
  This is the version that enters the LLM context: compact, protecting the
  window.
- **UI version** — the full/translated version, shown to the player when they
  read a character's story (e.g. in a **character stats menu** once the minimum
  relationship level is reached — see `relationships-spec.md` §6).

Both versions derive from the same authored story; the payload version is the
budgeted one (≤ ~300 chars), while the UI version is not context-bound.

### 5.5 Summarization baseline (initial design, from `research-resolutions.md` §3)

**Pattern:** contextual summarization — the *recent turns stay verbatim*, the
*older lore gets compressed* into a rolling summary (summary-of-summary).

**Starting budget split (≈24k chars total; tuned on-platform):**

| Section | Budget | Policy |
| --- | --- | --- |
| System instructions | ~3k | Never summarized |
| Scene + visual descriptions | ~3k | Never summarized |
| Character background (own) | ~1k | Own only; payload version (§5.4) |
| Lore summary (rolling) | ~6k | The summarized part |
| Recent turns (verbatim) | ~8k | Last ~8–10 turns kept verbatim |
| Safety margin | ~3k | Headroom |

**Rules:**

- **Trigger:** summarize when a voice's accumulated raw turns exceed the
  "recent turns" budget (~8k chars) — not a fixed message count.
- **Action:** oldest turns beyond the last ~10 compress into the rolling lore
  summary; the last ~10 stay verbatim.
- **Never summarized:** the taxonomy's never-summarized rows (§5.3) — system
  instructions, scene/visual descriptions, own background.
- **Summarization prompt:** imperative, extract-only-what-matters (decisions,
  promises, revealed facts, emotional shifts, open threads), **in English**
  (§8.2), output ≤ the lore budget.
- **Per-voice:** narrator and each NPC summarize their own memory; co-present
  NPCs share the scene's raw turns but summarize into their own stores.
- **Session scope:** summaries live in the `memory` table keyed by
  `(voiceId, type)`, session-scoped for now.

### 5.6 Two-tier summarization (daily + window — complementary)

Per the owner, the **daily summary does NOT replace the window summary** —
they are **two complementary mechanics** (defined in detail in
`day-cycle-spec.md` §6):

| Mechanic | What it summarizes | When it runs |
| --- | --- | --- |
| **Daily summary** | One day of a character's interactions | End of day (same call as the relationship scoring run, `day-cycle-spec.md` §5) |
| **Window summary** | The pile of daily summaries (and older lore) filling a character's window | When the character's **total context reaches ~22k chars** (safe margin below the ~24k budget) — not a fixed day count |

- The daily summaries populate each character's window day by day; the window
  summary compresses that pile when space is unavoidable.
- **Only the lore context is summarized** (the daily summaries / older lore).
  Every other context piece stays **never-summarized** (§5.3).
- **Naming:** each piece of information that goes into context is **named** in
  the taxonomy (§5.3) so there is no confusion about what can and cannot be
  summarized.
- Calibration (budgets, the ~22k trigger) happens on-platform via
  `test-prompt.txt`; the tokenizer gives exact counts locally.

## 6. Relationship System & NPC Poses

A **relationship system** will track each NPC's bond with the user — likely as
complex as the memory system (flagged as a major future system). For now, only
the baseline that drives **pose availability** is defined.

### 6.1 NPC pose set (initial definition)

Every NPC has, initially:

| Pose | Count |
| --- | --- |
| Idle | **2** |
| Default (standard) | **1** |
| Emotional (happy, sad, angry, in love) | **4** |

### 6.2 Pose availability by relationship (efficiency rule)

To avoid inefficient generation, poses are **gated by the relationship level**:

- **Stranger** (no bond with the user — the current stage): only the
  **default pose**, **1 idle pose**, and the **angry pose** are generated.
- The remaining poses (2nd idle, happy, sad, in love) are **only activated on
  demand during tests** (development) — not generated by default.

> The full relationship system is defined in `relationships-spec.md`.
> Pose unlocking by relationship tiers is currently **decoupled** from
> relationship levels.

## 7. User Identity & Creation

- The user defines their identity at the start:
  - **Name:** the player provides a name — or a **generic name is chosen** if
    none is given, **changeable later**. The name personalizes the title
    screen ("Chronicles of {name}", `vn-rpg-spec.md` §8) and is how NPCs
    address the user (surface identity — shared, like appearance, not
    background).
  - **Appearance:** free description, **or** a pre-defined archetype (e.g.,
    medieval RPG class).
  - **Background story:** write their own, **or** choose a pre-defined template.
- **Generation & description:** the AI takes the appearance definition and
  derives **two artifacts** — the **image prompt** (for image generation, in
  the project's RPG style / pixel art) and the **visual description** (what
  NPCs and the narrator receive). See §2.2.
- The user's identity exists so the story has its second character. NPCs know
  the user's **appearance** (visual description), but **not** their background
  — they meet as strangers (§2.1).

## 8. Language & i18n

- The AI must **always speak in the user's language**. Achieved via:
  1. **i18n** for the UI: a language definition that translates hardcoded
     interface text; and
  2. a **language variable** injected into the LLM prompt, informing the model
     which language to generate in.

### 8.1 Detection & scope (MVP)

- **Detection:** the browser's language is detected automatically, with a
  **manual override** — the user can change the language in settings.
- **Initial scope:** the **five most spoken languages** for the UI — pinned
  from Ethnologue 2026 (`research-resolutions.md` §5.1): **English (`en`),
  Mandarin Chinese (`zh`), Hindi (`hi`), Spanish (`es`), Standard Arabic
  (`ar`)**; **fallback to English** for anything untranslated. The list can
  grow later (French is #6); the i18n architecture is list-agnostic.
- The AI receives the **detected/selected language** (the language variable).

### 8.2 Token-efficiency rule (what gets translated)

English is the most token-efficient language, so translation is applied only
where the player can actually see the text:

- **Never translated (always English):** text that never reaches the player's
  eyes — image prompts, visual descriptions for payloads, internal/system
  prompt text, and the **payload version** of backgrounds (§5.4).
- **Translated (i18n resources or the UI version):** any text that can appear
  in the UI for the player to read — hardcoded interface text, and authored
  content such as an NPC's background story (**UI version**, §5.4).

## 9. Initial Test Scenario (validation slice)

Purpose: validate the base loop with minimal complexity — only the basics that
work initially.

- **One scene** (the first scene type: static image + effects).
- **One character** drawn from **3 example types** (see examples below).
- **One background** drawn from **3 example context stories**.
- The **user creates their identity** (template or custom, with visual
  archetype).
- **Then dialogue happens**, with the world narrator providing scene-context
  description.

> The 3 types and 3 background stories are **illustrative examples only** —
> final content is decided later.

*Example types (illustrative):* a wandering knight / a forest mage / a street
rogue.

*Example backgrounds (illustrative):* lost memory of a past battle / searching
for a missing sibling / sworn to protect a hidden village.

## 10. Explicitly Open Items / To Be Tested

| Item | Notes |
| --- | --- |
| Memory sharing rules (narrator ↔ NPC) | Whether NPCs carry narrator output — must test |
| Summarization cadence & budget | Baseline split + trigger in §5.5; **two-tier (daily + window)** in §5.6/`day-cycle-spec.md` §6 — numbers calibrated on-platform |
| Narration frequency & scope tuning | Opening / between turns / on-demand mix |
| Known/unknown mechanic | Future feature — deferred |
| User identity in NPC payloads | Background: never (strangers). Appearance: shared. May evolve with the known/unknown feat |
| Visual description budget | Exact size/cadence of derived descriptions — tune in tests |
| Choice format & parsing | Baseline in §3.1 (line-oriented) — delimiter string tunable |
| Content (types, backgrounds, templates, archetypes) | Examples only for now |
| Scene options & user-driven progression details | Bridges with the scene spec |
| Relationship tiers ↔ poses | Currently decoupled; may reconnect — see `relationships-spec.md` |
| Language list & i18n resources | Pinned: en, zh, hi, es, ar (§8.1) — list-agnostic architecture |
| Background dual versions (payload vs UI) | Payload budget vs UI presentation — how both derive from one authored story (§5.4) |
| Stack, tooling, framework | Decided after the ideation phase |

## 11. Next Steps

1. Validate the **base slice** (§9) with mocked plugins locally.
2. Once the stack is chosen, design the **context payload builder** (taxonomy →
   per-voice payload, budgeted to ≈24k chars).
3. Prototype session memory + summarization; measure real window usage on the
   platform via the `test-prompt.txt` handoff.
4. Experiment with narration frequency/scope and dialogue mechanics (choices +
   free text).
5. Define and validate the **choice formatting + parsing** (§3.1), including
   lore filtering (offered vs selected options).
6. Validate **pose-gated asset generation** (stranger pose set, §6) in the
   base slice.
7. Keep this spec as a living document — add/remove items as tests reveal
   what works.
