# VN-RPG — Pending Decisions (definitions to resolve)

> **Status:** Living document — tracks project-level definitions that were
> identified as gaps in the gap analysis. Each entry carries the **owner's
> answer** where one exists, or is marked **open** until a dedicated turn
> resolves it.
> **Purpose:** a single place to see, at project level, what is decided vs
> open — so no important definition is lost between turns.
> **Owner:** project owner + primary dev agent
> **Related:** `vn-rpg-spec.md`, `narrative-spec.md`, `relationships-spec.md`,
> `tech-spec.md`, `research-resolutions.md` (resolved-by-research sub-items),
> `AGENTS.md`, `PERCHANCE-GUIDE.md`.

---

## How to use this document

- One entry per project-level definition that was missing.
- **Status legend:**
  - ✅ **Answered** — the owner has answered; the decision is recorded here
    *and* propagated into the relevant spec(s).
  - 🔄 **Partially answered** — the direction is set; details remain open.
  - ⏳ **Open** — no decision yet; scheduled for a dedicated turn.
- When a decision is finalized elsewhere (a spec, a dedicated turn), keep this
  doc as the index and point to where it landed.
- **Spec-level open items resolved by research** (choice format, scene
  manifest schema v1, memory/summarization baseline, relationship tiers,
  System 2 v1, exact versions, language list) are tracked in
  `research-resolutions.md` — this doc indexes project-level gaps only.

---

## 1. Gameplay scope — stats / inventory / progression

| | |
| --- | --- |
| **Status** | ✅ **Answered** (dedicated interview turn) |
| **Why it matters** | It is the game layer that defines what the player *is* (stats), *carries* (inventory), and how the game *moves forward* (progression) — and how those interact with the dialogue machine, the relationship web, and the LLM context. |
| **Owner answer** | Defined in **`gameplay-spec.md`** (dedicated turn): hybrid stats (small numeric core + code-derived traits; Emotional/Empathy + Reputation domains), **stats never gate AI-generated dialogue options** (they shape tone/outcomes), deterministic growth (choices + world events), inventory = key items + currency + gifts (gift acceptance by bond tier; code decides, AI reacts), **story-driven progression** (no XP/levels), item sprites from a **CC0 sprite dependency** (Kenney), on-demand lore retrieval as a **v2+ idea**, and **zero gameplay in the MVP slice**. |
| **Landing spot** | `gameplay-spec.md` (new spec). |
| **Immediate impact** | Confirmed: the MVP slice (`narrative-spec.md` §9) stays **scene + dialogue only** — no stats/inventory/reputation. The save schema evolves later via Dexie versioning. |

---

## 2. Asset generation & distribution model

| | |
| --- | --- |
| **Status** | 🔄 **Partially answered** — direction set; specifics open |
| **Why it matters** | Decides the generation service architecture, first-play latency, quota usage, and generation discipline. |
| **Owner answer** | **Hybrid of A and C** (from the gap analysis): |
| | - **Initial path:** **full generation on the Perchance platform** (per player/device) with a **persistent cache**, so assets are **not regenerated on reload**. |
| | - Some assets **may** be pre-generated and shipped as **webp** where instant availability pays off — but that is **not** the initial path. |
| | - **Regeneration control (important):** the image plugin can **regenerate a generated image**. A generated asset can come out with a defect (e.g. artifacts), so regeneration must be integrated **intelligently as user control** — the player must not be stuck with a bad asset. **How** the regenerate option is surfaced to the player is **not yet defined**. |
| **Landing spot** | `vn-rpg-spec.md` §4.2 (distribution) and §4.3 (regeneration). |
| **Open details** | Which assets (if any) become pre-generated webp; the regeneration UI/UX; whether regeneration re-rolls the seed or keeps it. |

---

## 3. Onboarding flow (screens)

| | |
| --- | --- |
| **Status** | 🔄 **Partially answered** — direction set; contents open |
| **Why it matters** | Defines the Preact UI structure, app boot, and the first `test-prompt.txt`; the MVP slice includes identity creation, which needs a home screen flow. |
| **Owner answer** | **Yes — there must be an intro screen**, with at least: **New Game**, **Load Game**, and **Settings**. |
| | The look and contents of the title screen and of the New Game / Load / Settings screens are **not yet defined**. |
| **Landing spot** | `vn-rpg-spec.md` §8 (screen & presentation). |
| **Open details** | Layout, contents, flow (title → new game → identity creation → first scene), settings screen contents. |

---

## 4. Languages, detection & i18n scope (MVP)

| | |
| --- | --- |
| **Status** | ✅ **Answered** (details tunable in setup) |
| **Why it matters** | Drives i18n resources, the payload language variable, and authored-content strategy. |
| **Owner answer** | - **Detection:** **browser language detection** + **manual override** (the user can change the language in settings). |
| | - **Initial scope:** the **five most spoken languages** for the UI (exact list pinned at i18n setup); **fallback to English**. |
| | - The AI receives the **detected/selected language** (via the payload language variable). |
| | - **Token-efficiency rule:** English is the most token-efficient language, so: |
| |   - texts that **never reach the player's eyes** (e.g. image prompts, internal payload text) stay **in English**; |
| |   - texts that **can appear in the UI** for the player must be **translated**. |
| | - **Dual-version background stories** (efficiency optimization): |
| |   - **Payload version** — concise, direct, no narrative preamble, **in English**; this is what enters the LLM context (compact, protects the window). |
| |   - **UI version** — the translated version shown to the player (e.g. read in a **character stats menu** once the minimum relationship level is reached — see `relationships-spec.md` §6). |
| | - **Character stats menu (concept):** a UI surface where the player reads a character's background story (UI version) — same "you know them well enough" gate that reveals their bonds. The menu is a new concept; its full scope is open, but it makes sense to design around it. |
| **Landing spot** | `narrative-spec.md` §5.4 and §8; `relationships-spec.md` §6. |
| **Open details** | 5-language list **pinned** (`en`, `zh`, `hi`, `es`, `ar` — `research-resolutions.md` §5.1); how the UI version of authored content is produced/translated (author-time vs on-demand); stats menu scope. |

---

## 5. Error & degradation policy (plugin generation)

| | |
| --- | --- |
| **Status** | ✅ **Answered** |
| **Why it matters** | Prevents wasted generations and defines the adapter's failure behavior before mocks/adapter are built. |
| **Owner answer** | The Perchance **text and image plugins already have their own retry tooling** for content-generation failures. Therefore: |
| | - The app implements **NO retry/timeout of its own** for plugin-generated content. |
| | - Any timeout on text/image generation is **purely heuristic and discouraged**: the plugins do not define how long generation takes — they only guarantee they handle their own failures until the content succeeds. A timeout firing while a generation is merely slow would **waste** an in-flight generation. |
| | - The app still shows **loading indicators** while waiting (UX), and caches results — but that is not a timeout. |
| **Landing spot** | `tech-spec.md` §6.1 (adapter); `vn-rpg-spec.md` §5 (runtime constraints). |
| **Open details** | None — the rule is complete; error *state* UX (what the player sees on a rare plugin failure) remains a UI detail. |

---

## 6. Support matrix & accessibility baseline

| | |
| --- | --- |
| **Status** | ⏳ **Open** |
| **Why it matters** | Browsers/devices minimums (e.g. evergreen + WebGL2 with PixiJS fallback) and the a11y baseline (keyboard, screen-reader basics for the VN UI). |
| **Owner answer** | **No decision yet** — to be defined in the future. Left as a pending item. |
| **Landing spot** | TBD (likely a section of `tech-spec.md`). |
| **Immediate impact** | None on the scaffold; the PixiJS + DOM-overlay architecture already keeps the door open. |

---

## 7. Version testing on Perchance

| | |
| --- | --- |
| **Status** | ✅ **Answered** (platform fact) |
| **Why it matters** | Defines the runtime-test loop: what version is testable and whether GitHub import is an option. |
| **Owner answer** | On Perchance **only one version of the project can be tested at a time** — always the **latest version the owner uploads**. Perchance does **not** load the project from GitHub (unless imported directly from GitHub via a CDN, e.g.), but a CDN import would make runtime tests **harder for the Perchance agent**: it would have **no access to the source loaded in its workspace** and could only observe the generator's behavior "blindly" on the platform. |
| | **Conclusion:** the flow stays as defined — local build → upload the latest version → `test-prompt.txt` handoff. |
| **Landing spot** | `tech-spec.md` §4.3 (upload protocol). |
| **Open details** | None — the loop is fixed by the platform. |

---

## Quick status table

| # | Definition | Status |
| --- | --- | --- |
| 1 | Gameplay scope (stats/inventory/progression) | ✅ Answered (`gameplay-spec.md`) |
| 2 | Asset generation & distribution | 🔄 Partially answered (`vn-rpg-spec.md` §4.2–4.3) |
| 3 | Onboarding flow (screens) | 🔄 Partially answered (`vn-rpg-spec.md` §8) |
| 4 | Languages, detection & i18n scope | ✅ Answered (`narrative-spec.md` §5.4/§8, `relationships-spec.md` §6) |
| 5 | Error & degradation policy (plugins) | ✅ Answered (`tech-spec.md` §6.1, `vn-rpg-spec.md` §5) |
| 6 | Support matrix & accessibility baseline | ⏳ Open — future turn |
| 7 | Version testing on Perchance | ✅ Answered (`tech-spec.md` §4.3) |

---

## Next Steps

1. Keep this doc updated every time a gap is identified or a decision lands.
2. When a dedicated turn resolves an ⏳ item, move its detail into the owning
   spec and leave the index entry here.
3. The ⏳ item (6 — support matrix & a11y) is a candidate for its own
   dedicated turn before the corresponding development work begins.
