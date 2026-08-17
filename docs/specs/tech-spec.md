# VN-RPG — Technical Spec (Stack, Tooling & Architecture)

> **Status:** **Approved** (stack approval turn, 2026-08). The stack is
> decided (§2), versions are pinned (`research-resolutions.md` §5.2), and the
> `rpg/` scaffold is built and green. Implementation details marked "open" in
> §11 remain to be validated during development.
> **Scope:** development stack, tooling, build/ship pipeline, and the app's
> technical architecture. It translates the ideation specs
> (`vn-rpg-spec.md`, `narrative-spec.md`, `relationships-spec.md`) into
> concrete technical decisions.
> **Owner:** project owner + primary dev agent
> **Related:** `vn-rpg-spec.md`, `narrative-spec.md`, `relationships-spec.md`,
> `gameplay-spec.md`, `day-cycle-spec.md`, `pending-decisions.md`, `AGENTS.md`
> (conventions), `PERCHANCE-GUIDE.md` (platform reference), `README.md`
> (platform-facing orientation).

---

## 1. Context & Non-Negotiables (recap)

Anything in this spec must respect these platform facts:

- **The app ships to Perchance as static files.** The platform has **no build
  tooling** (no `tsc`, no `vite`, no bundlers) — everything the runtime needs
  must be pre-built locally/CI and uploaded. `index.html` references
  `src/rpg/build/rpg.js` (+ `rpg.css`), so the build output lands in
  `rpg/build/` locally ↔ `src/rpg/build/` on the platform.
- **Quotas:** `src/` = 100 MB total, 5 MB per file, 1000 files max. Every
  shipped file is publicly visible. No secrets.
- **The AI plugins are not APIs.** `root.generateImage` / `root.generateText`
  only execute inside the platform. Locally they are **mocked**; final runtime
  validation happens via the `test-prompt.txt` handoff to the Perchance AI
  agent.
- **Context window:** the text plugin's LLM window is ~6k tokens
  (~≈ 24k characters per payload, at most). The context payload builder must
  respect this budget.
- **Output limit:** the text plugin's LLM output is ~**3.5k characters** per
  call (owner-reported — to verify on-platform). Consequences: daily summaries
  are sized to fit; the end-of-day scoring batch (2 NPCs per call) must be
  verified against this limit (`day-cycle-spec.md` §5.2/§8).
- **Generation is slow** (up to ~1 min). Always show loading indicators and
  cache aggressively.
- **Ship policy:** only the built app code and `README.md` go to Perchance.
  Everything else (configs, tests, CI, this spec) stays local, git-tracked.
- **Language:** all artifacts in English (UI + docs + code).

---

## 2. Stack Decision (approved)

> **Status: APPROVED by the owner** (dedicated turn). This is the baseline for
> scaffolding `rpg/`. Exact versions are re-pinned at setup
> (`research-resolutions.md` §5.2).

| Concern | Choice | Rationale |
| --- | --- | --- |
| Language | **TypeScript (strict)** | Minimum requirement from day one; typed across the whole codebase. |
| Package manager | **pnpm** | Fast, disk-efficient, workspace-ready; owner's choice. |
| Dev server / bundler | **Vite** (dev + build) | HMR in dev; production build with `base: './'` (relative paths work inside the Perchance iframe). Code-splitting for lazy three.js. |
| Scene rendering | **PixiJS v8** (scene type A + effects) | Best-in-class 2D WebGL/WebGPU renderer for layered sprites, particles, and 2.5D effects; high performance on mobile. |
| 3D rendering | **three.js** (lazy async chunk) | **Approved baseline for scene construction** (type C hybrid, `vn-rpg-spec.md` §3.8). Dynamically imported so it never costs initial load until a 3D scene exists. |
| UI layer | **Preact + signals/context** | Tiny (~4 KB) React-compatible runtime; `@preact/signals` gives fine-grained reactivity for the dialogue/choices/HUD overlay. |
| Persistence | **Dexie / IndexedDB** | Standard web API: works identically locally and on the platform; testable in CI; one DB, several tables. (Precedent: previous Mathema project.) |
| i18n | **i18next** | Mature, pluralization + interpolation + lazy resources; feeds the language variable into AI payloads (narrative-spec §8). (Precedent: Mathema.) |
| Lint + format | **Biome** | Single fast Rust-based tool for lint + format + TS-aware checks. |
| Tests | **Vitest** (unit/integration) + **browser E2E via Chrome DevTools MCP + WebMCP harness** (local, owner preference — no Playwright script dependency, §8) | Tiered by tag (see §8); no duplicated coverage between CI and local. |
| CI | **GitHub Actions** (once the repo is pushed) | Typecheck + lint + unit/integration tests + production build. |
| Build artifact | **`rpg/build/` committed to git** | The upload step is a plain copy of tracked files; the Perchance agent sees exactly what is in production. |

### 2.1 Rendering strategy — PixiJS 2D layers + three.js for type C (owner decision, updated)

- **Scene type C (hybrid three.js + plugin images) is now the APPROVED
  baseline for scene construction** (owner decision after the open-scene POC,
  `vn-rpg-spec.md` §3.8). three.js is therefore a **primary** renderer for
  scene construction, not a later experiment.
- Scene type A (static image + code effects) remains a **valid fallback** for
  selected moments/settings, but its floor/scale challenges (§3.6) are not yet
  solved; type B (pure three.js) is not excluded.
- **three.js is still loaded lazily** (async chunk) and the scene layer
  declares which renderer it needs, so initial load never pays for a 3D
  renderer until a 3D scene is actually instantiated.
- **PixiJS v8 remains** for the 2D overlay stack that complements hybrid
  scenes: UI sprites, particles, fog, dynamic lighting, day/night effects, and
  sprite layers that live on top of the 3D stage.
- The render layer exposes a **thin `Stage` interface** (add/remove layers,
  resize, tick) with a three.js implementation for scenes and a PixiJS
  implementation for 2D overlays — the rest of the app never imports a
  renderer directly.

---

## 3. Repository Layout (proposal)

```
rpg/
  index.html              # Vite entry (dev harness page — local only, NOT shipped)
  vite.config.ts          # base './', entry rpg.js, code-split, output to build/
  tsconfig.json
  biome.json
  package.json            # scripts per tier (see §8)
  src/
    main.ts               # boot: mount stage + Preact UI, wire services
    render/               # thin Stage interface + PixiJS impl
      stage.ts            # Stage abstraction (PixiJS now, three.js later)
      viewport.ts         # contain/letterbox scaling, devicePixelRatio cap
      effects/            # particles.ts, fog.ts, lighting.ts, dayNight.ts
      sprites.ts          # layered 2D sprite compositing (poses, dimming)
    scene/
      types.ts            # SceneManifest schema (typed, versioned)
      loader.ts           # manifest → Stage; plugin escape hatch
      manifest/           # scene data files (typed TS/JSON)
    game/
      state/              # @preact/signals stores (dialogue, scene, ui)
      dialogue/           # dialogue machine, choices, always-escape
    services/
      perchance-runtime.ts# adapter isolating root.generateImage/generateText
      generation.ts       # cache orchestration (dev/prod caches)
      memory.ts           # per-voice memory + summarization hooks
      relationships.ts    # graph model + two systems
      payload.ts          # context payload builder (taxonomy → budgeted payload)
      i18n.ts             # i18next setup + language variable
      mock/               # local mock harness (dev-only)
    ui/                   # Preact components: dialogue box, choices, HUD, menus
    webmcp/               # dev-only WebMCP test tools (gated by build flag)
  build/                  # committed production output (the ship artifact)
  tests/
    unit/  integration/  e2e/
```

**What ships to Perchance (upload set):** the contents of `rpg/build/`
→ platform `src/rpg/build/`, plus root `README.md` → `src/README.md`.
**Source, configs, tests, docs stay local** (git-tracked, never uploaded).
> Note: this refines the AGENTS.md ship policy — "app code" means the *built*
> app, since the platform cannot compile.

---

## 4. Build & Shipping Pipeline

### 4.1 Vite configuration

- `base: './'` — all emitted asset URLs are relative, so the bundle works
  under the Perchance iframe path regardless of hosting.
- `build.outDir: 'rpg/build'`, emptyOutDir true.
- Entry naming to match the platform shell:
  - `entryFileNames: 'rpg.js'` (the `<script type="module" src="src/rpg/build/rpg.js">` reference),
  - `assetFileNames`: CSS → `rpg.css`, other assets → `assets/[name]-[hash][ext]`,
  - `chunkFileNames: 'chunks/[name]-[hash].js'`.
- **Code splitting:** PixiJS + Preact + i18next + Dexie in the main chunk;
  **three.js behind a dynamic `import()`** (async chunk) loaded only when a
  scene type B/C is instantiated. Rollup tree-shaking keeps the main bundle
  lean.
- `build.target`: modern browsers (es2020+) — the platform iframe runs current
  browsers; no legacy polyfills.

### 4.2 Dev workflow

- `pnpm dev` → Vite dev server for `rpg/` with HMR, serving the local harness
  page **with the mock harness injected** (see §6.2).
- The harness page is the Vite entry (`rpg/index.html`) — **local-only**, not
  part of the upload set.
- Mock injection is gated: in dev the app boots with `window.root` mocked;
  the same build with the mock disabled runs against the real plugins on the
  platform (production flag at build time, e.g. `import.meta.env.PROD` +
  an explicit `RPG_MOCK` flag).

### 4.3 Upload protocol (per test round)

1. `pnpm build` produces `rpg/build/` (committed).
2. Upload `rpg/build/*` → `src/rpg/build/` and `README.md` → `src/README.md`
   via the Perchance editor.
3. Local tests + CI green → write `test-prompt.txt` for the Perchance agent.
4. Agent runs runtime validation; results feed back into local fixes.

> **Single-version testing (platform fact — `pending-decisions.md` §7):** only
> one version of the project can be tested on Perchance at a time — always the
> **latest uploaded**. The platform does not pull the project from GitHub;
> direct GitHub→CDN import is possible but would make the Perchance agent test
> "blindly" (no access to the workspace source, only observable generator
> behavior), so the flow stays as above: local build → upload latest →
> `test-prompt.txt`.

---

## 5. Rendering & Scene System (technical)

### 5.1 Viewport strategy — contain (letterbox)

- The stage has a **fixed logical resolution** (baseline 1280×720, landscape)
  and is **scaled to fit** the viewport (`contain`), letterboxing the
  remainder. Nothing of the scene is ever cropped.
- `devicePixelRatio` is capped (max 2) to protect mobile fill rate.
- UI (dialogue box, choices, HUD) is a DOM overlay anchored to the stage box
  (letterbox-aware), so it scales consistently with the scene.
- Pixel-art crispness: `image-rendering: pixelated` for raster assets;
  PixiJS `NearestFilter` for sprite scaling.

### 5.2 Scene type A pipeline (PixiJS)

Layers back-to-front (mirrors vn-rpg-spec §3.2):

1. **Backdrop** — generated image as a stage-sized sprite.
2. **Effects layer** (all code-driven, all reusable across scenes):
   - **Particles** — `ParticleContainer` (rain, snow, embers, dust, petals);
     emitter config lives in the scene manifest.
   - **Fog / haze** — procedural canvas texture sprite + additive/normal
     blending, drifting slowly; density/color per manifest + time of day.
   - **Dynamic lighting** — blended gradient/glow sprites (torch flicker,
     window light) using PixiJS filters (`pixi-filters` for glow/blur).
   - **Day/night cycle** — a full-stage color-grading overlay (ColorMatrix /
     tint) whose curve is defined by the time-of-day value; also drives the
     ambient side-color of type C scenes (vn-rpg-spec §3.8).
3. **Character layer** — layered 2D sprites; pose swapping with fade
   transitions (vn-rpg-spec §3.7); active-speaker dimming.
4. **UI layer** — Preact DOM overlay (dialogue box, choices, HUD).

Effects are **declarative in the manifest** and each effect is an isolated,
unit-testable module (deterministic with a seeded RNG for particle config).

### 5.3 Scene manifest (hybrid — data + escape hatch)

- A **typed, versioned `SceneManifest`** is the default: `{ schemaVersion,
  type: 'A'|'B'|'C', backdrop, effects[], actors[], transitions, ... }`,
  authored as typed TS data files (compiled into the bundle). Schema v1
  (baseline from `research-resolutions.md` §2, grounded in Ren'Py/Monogatari
  patterns):
  ```ts
  interface SceneManifest {
    schemaVersion: 1;
    id: string;                    // stable scene id (cache/payload key)
    type: 'A' | 'B' | 'C';
    backdrop: {
      assetKey: string;            // cache key → generated image (dev/prod modes)
      prompt?: ImagePrompt;        // prompt params if generation is on-demand
      description: string;         // visual description for narrator payload
    };
    effects: EffectConfig[];       // declarative (particles/fog/lighting/dayNight)
    actors: ActorPlacement[];      // characterId + pose + position + depth
    transitions?: { enter?: string; exit?: string };
    floor?: {                      // type-A de-risking hooks (§5.4)
      line?: number;               // pixel row of the floor plane
      scaleAnchor?: { x: number; y: number; size: number };
    };
    camera: { mode: 'fixed' };     // contain/letterbox viewport (§5.1)
  }
  ```
  Assets are referenced **by key, not inlined** (the cache is the source of
  truth for pixels); the scene's `description` is first-class so the narrator
  payload builder reads it directly (`narrative-spec.md` §2.2).
- The **loader** (`scene/loader.ts`) validates the manifest against its schema
  (runtime validation + unit tests) and builds the stage.
- **Escape hatch:** a scene may provide a `ScenePlugin` (code) that receives
  the stage and can build anything — the path for type C/B scenes and future
  special cases. This keeps vn-rpg-spec §3.5 open in practice while giving the
  default a stable mechanism.
- Scene **style/composition/angle** of generated backdrops remain open
  (vn-rpg-spec §9) — the manifest carries those prompt parameters, to be tuned
  in the floor/scale experiments.

### 5.4 Floor/scale de-risking (type A, vn-rpg-spec §3.6)

Technical hooks to support the experiments (not solutions yet):

- Manifest fields for **floor line and scale anchor** (the pixel row where the
  floor plane is, and a reference object size) so character placement can be
  authored and iterated per scene.
- A **debug overlay** (dev-only) that draws the floor line / scale guides on
  the stage — lets us tune backdrops quickly before art generation.

### 5.5 Support matrix & accessibility baseline

Resolves `pending-decisions.md` §6 (owner interview).

**Support matrix:**

- **Browsers — evergreen latest-2:** Chrome / Edge / Firefox (latest 2
  versions) + Safari / iOS 15+ (the implicit floor set by **PixiJS v8
  requiring WebGL2**, which is universal there). Build target stays es2020+.
- **WebGL2 is required** (PixiJS v8 dropped WebGL1/Canvas legacy). If WebGL2
  is unavailable (rare: disabled GPU, very old device) → **graceful
  "unsupported browser" screen** with instructions. **No degraded DOM
  renderer** (a second rendering layer is not maintained).
- **Devices:** desktop (keyboard/mouse) + **mid-range mobile** (touch,
  landscape, contain/letterbox §5.1, DPR cap 2). **No dedicated low-end tier**
  — manifest quality tiers still scale effects down on small screens (§9).

**Accessibility baseline (owner decisions):**

- **Keyboard — full parity:** every UI is operable by keyboard — menus,
  choices (arrows + enter), advance dialogue (space/enter), Escape always
  exits dialogue (always-escape, `narrative-spec.md` §3). Classic VN pattern.
- **Screen reader — dialogue + menus:** dialogue announced via
  `aria-live="polite"`; menus/settings navigable by screen reader (semantic
  HTML, roles, `lang` per i18n language). The game is playable with a screen
  reader.
- **Focus:** custom **visible focus ring** + **conscious focus management**
  across transitions (dialogue → choices → menus → modals).
- **Reduced motion (post-MVP):** honor `prefers-reduced-motion` — disable or
  reduce particles, fog, lighting flicker, and transitions (WCAG 2.3.3 /
  technique C39) — **plus a manual toggle in Settings**.
- **Text legibility (Settings, post-MVP):** **text size** setting + **skip**
  (instant advance / skip read text). **No text-speed setting** — the text
  plugin streams at its own variable pace, so speed is not controllable; a
  **typewriter effect is always on** (no toggle).
- **Color & contrast:** **WCAG AA** contrast for dialogue/HUD text in the
  baseline. "No information conveyed by color alone" is documented practice
  (e.g., bond-change indicators use icon + text; active-speaker dimming is
  brightness-based) — without a separate audit gate.

**Testing & enforcement:**

- Automated a11y checks run via **CDP MCP + WebMCP harness** (owner
  preference — avoids Playwright script dependency): Chrome DevTools MCP
  **Lighthouse audit** (a11y category) + WebMCP state inspection. No
  `@axe-core/playwright` scripts.
- **MVP scope:** the **core ships in the base slice** — keyboard parity,
  `aria-live` dialogue, focus ring/management, contrast AA, and the
  unsupported-browser screen. The **full set lands post-MVP**: Settings
  (text size, skip, reduced-motion toggle) and Lighthouse a11y gating.

---

## 6. AI Runtime & Mock Harness

### 6.1 Platform adapter (`services/perchance-runtime.ts`)

- The **only** module that touches `root.generateImage` / `root.generateText`
  (AGENTS.md convention). Everything else depends on typed interfaces:
  - `interface ImageService { generate(opts: ImageOpts): Promise<ImageResult> }`
  - `interface TextService { generate(opts: TextOpts): Promise<TextResult> }`
- Production impl wraps `root.*` (normalizing `result.dataUrl || result` and
  `generatedText | text | string`). Dev impl is the mock harness.
- **`removeBackground` is per-asset** (default `false`), never mode-derived:
  only character sprites pass it (vn-rpg-spec §4.1). Separate caches per mode
  (separate Dexie databases, e.g. `rpg_dev` and `rpg`) so development
  generations never pollute production (vn-rpg-spec §4.2).
- **Character consistency:** fixed prompt template + fixed seed per character
  (vn-rpg-spec §4.4); the cache key includes mode + entity + prompt + seed, so
  changing a prompt busts the cache by key change.
- **No app-level retry/timeout on plugin content** (owner decision,
  `pending-decisions.md` §5): the plugins already handle their own generation
  failures and retries. Any timeout/retry we add is purely heuristic and
  discouraged — a timeout firing while a generation is merely slow would waste
  it. The adapter only surfaces loading state; it never aborts plugin calls.
- **Regeneration hook:** the image plugin can regenerate an asset — the
  adapter exposes it as a first-class operation so the UI can offer "regenerate"
  for defective assets (vn-rpg-spec §4.3; UI surfacing is an open item).

### 6.2 Mock harness (local dev + tests)

Richer than the guide's minimal stub, deterministic and controllable:

- `generateImage` → deterministic canvas-generated placeholder (seeded color /
  pattern per cache key); returns `{ dataUrl }`.
- `generateText` → canned/scripted responses (including **choice-format
  payloads** so the parser is exercised); configurable latency and **error
  injection** to test loading/error paths.
- `generateImage`/`generateText` **call logs** recorded for assertions
  (what payloads were built, sizes, cache hits).
- Exposed as the `root` global before the app boots (guide §3.6 pattern).

### 6.3 WebMCP harness (dev-only testing surface)

- The app exposes **WebMCP tools in dev builds only** (gated by a build flag)
  for browser-driven tests via CDP/Playwright: inspect game state, read the
  current dialogue payload, trigger actions, mock responses, clear caches,
  dump the relationship web / memory.
- Purpose is **testing only** — WebMCP never ships in production (owner
  decision).
- This gives CDP/Playwright tests a stable, semantic interface instead of
  reaching into the DOM.

### 6.4 Dev context inspector (NPC / narrator / user debug panel)

A **dev panel in the UI** that shows everything that defines a voice at the
current moment — everything that goes into its LLM payload, the source
artifacts the payload derives from, and its live state. Target audience: the
owner during development and the Perchance agent during runtime tests.

**Availability & gating (owner decisions from interview):**

- Exists in **both dev and prod builds**, but is **off by default**. Enabled
  via a build flag / URL param / settings switch — so the Perchance agent can
  turn it on during runtime tests on the deployed build. **Shipped (round 10, v1):**
  enabled by the **`?inspector=1` URL param**; discreet **Dev** HUD button;
  voice selector (NPC / narrator / user); payload sections with the
  summarizable marker; counts + budget bar vs the 24k window with the 22k
  trigger; Copy payload + Refresh. v1 state section = current scene only
  (day-cycle periods, relationship edges and poses land with those features).
- **Toggle:** a discreet **HUD button** (no keyboard shortcut). The button is
  rendered only when the feature is enabled.
- **Voice selector:** **one voice at a time** — dropdown listing the NPCs
  present in the scene + the **narrator** + the **user**.

**Per-voice content (what the panel shows):**

- **Payload sections** — every **named section** of the context taxonomy
  (`narrative-spec.md` §5.3), exactly as the payload builder emitted them:
  system instructions, scene description, visual descriptions, own background
  (payload version), lore / rolling summary, recent turns (verbatim), the
  daily-summaries pile, time of day, and the user-identity pieces.
- **Image prompt** — the raw generation prompt (which never enters the
  payload; `narrative-spec.md` §2.2).
- **Visual description** — the derived compact description that is what
  actually goes into narrator/NPC payloads (§2.2).
- **Background dual versions** — **payload version** (English, compact) vs
  **UI version** (translated/full) side by side (§5.4).
- **Summarizable marker** — every section flagged as **never-summarized** or
  **summarizable** (the taxonomy's policy column, §5.3); the **summarizable
  lore section** (rolling summary + day-summaries pile) is visually
  highlighted — the section that undergoes the **daily and window summaries**
  (`day-cycle-spec.md` §6).

**Counts:**

- **Per-section** char count (+ token estimate) and a **total with a budget
  bar** against the **~24k chars** window (narrative §5.2/§5.5);
- a **window-summary trigger indicator** when the voice's total approaches
  **~22k chars** (the two-tier trigger, `day-cycle-spec.md` §6);
- the daily-summaries pile shown with the most recent summary.

**State section:** current scene, current time period (day-cycle §3), the
voice's relevant web edges (relationship with the user + notable bonds,
`relationships-spec.md` §2), available poses (`narrative-spec.md` §6), and the
last daily summary.

**Interaction (owner decisions):**

- **Snapshot + refresh:** the panel shows the state from when it was opened;
  a manual **Refresh** button re-reads the payload; auto-refresh on voice
  switch.
- **Copy payload:** a button exports the selected voice's payload as readable
  text — for `test-prompt.txt` handoffs to the Perchance agent.
- **WebMCP tool:** the same data is exposed as a dev WebMCP tool (e.g.
  `get_context_panel`) returning JSON, so automated tests can inspect the
  panel's contents through CDP (§6.3 gating).

**Constraints:** off by default in prod (never a visible surface without the
flag); shows no data beyond what payloads already contain (no new secrets);
reads from the same payload builder / memory / relationship stores it
visualizes — it must not fork state.

---

## 7. State, Memory & Relationships (technical)

### 7.1 Game state — Preact signals + context

- Domain stores as **signals** (`@preact/signals`): `scene`, `dialogue`,
  `ui`, plus service-owned state (memory, relationships). UI subscribes
  reactively; game logic mutates through typed actions.
- A small **dialogue machine** (state: idle → speaking → choices → free-text →
  end/escape) drives the flow; **always-escape** is a first-class action in the
  machine (narrative-spec §3).
- Pure logic (payload builder, choice parser, graph ops, manifest validation)
  lives **outside** stores so it is unit-testable without DOM/Preact.

### 7.2 Persistence schema (Dexie, versioned)

| Table | Purpose |
| --- | --- |
| `assets` | cached generations: key (mode+entity+pose+seed), dataUrl, prompt, seed, mode, createdAt |
| `save` | game snapshots — **v1: 3–6 manual slots + autosave** (owner decision): identity, scene, progress, flags |
| `characters` | registry: user identity + NPCs (visual description, background, pose availability) |
| `relationships` | the web: edges `(from, to, type, intensity, direction)` |
| `memory` | per-voice memory records — now entries in `characterLogs` (per-character raw store, `day-cycle-spec.md` §4) |
| `characterLogs` | **the per-character raw log** (retrieval corpus): one row per tagged entry `(characterId, entryId, type, owner, dayId, period, ts, text, chars)` — `day-cycle-spec.md` §4; **retention tied to the save lifecycle** (deleting a save deletes its logs) |
| `dayLogs` | day-level **aggregation view** of `characterLogs` (`turn`/`action` grouped by `dayId`, `characterId/pair`, `period`, `chars`) — feeds the end-of-day run (`day-cycle-spec.md` §5) |
| `daySummaries` | day-cycle: per-character daily summaries + scores `(dayId, characterId, summary, scoreUserToNpc, scoreNpcToUser, reason)` (`day-cycle-spec.md` §9) |

- Dexie **versioning** migrations from day one; DB name carries the mode
  (`rpg_dev` / `rpg`).
- Saves and the relationship web **persist across sessions** (relationships-spec
  §8) — on the platform this is per-user IndexedDB, exactly as locally.
- **Slot behavior (`vn-rpg-spec.md` §8.1):** **New Game creates a new slot**;
  when all 3–6 manual slots are full, the player chooses one to **overwrite**
  (with confirmation). Autosave occupies its own slot(s). Load is disabled
  when no saves exist.
- **Gameplay tables (stats, inventory, reputation, item lore) are deferred:**
  zero gameplay in the MVP slice (`gameplay-spec.md` §9); the schema sketch for
  the gameplay milestone is in `gameplay-spec.md` §10.

### 7.3 Context payload builder (the 24k budget)

- `services/payload.ts` implements the **context taxonomy** of narrative-spec
  §5.3: builds a per-voice payload (world narrator / NPC / user-adjacent)
  with explicit **budget allocation** per section (system instructions, scene +
  visual descriptions, character background, lore summary, recent turns).
- Rules enforced in code and **tested in unit tests**: never-summarized types
  are always complete; lore/memories go through the summarizer; offered-choice
  texts are excluded; selected choice is included as the player's action;
  language variable appended (i18n).
- A **budget guard** measures each payload (chars) and fails loudly if it
  exceeds ~24k — validated by tests with representative content.
- **Summarizer interface** (`memory.ts`): initial session-memory
  implementation; the cadence/budget tuning is an open item validated on the
  platform via `test-prompt.txt` (narrative-spec §10).

### 7.4 Relationships — graph model (technical baseline)

- `services/relationships.ts`: typed graph (nodes + typed directed edges with
  intensity), persisted in Dexie.
- **System 1** (user↔world, AI judgment): dialogue events are scored by a
  deterministic mapper over AI-judgment output → edge updates (prototype).
- **System 2** (NPC↔world, pure code): periodic deterministic algorithm that
  adjusts/creates/removes NPC edges (seeded RNG → testable).
- **Visibility gating** (relationships-spec §6): UI only reveals a character's
  edges above the minimum relationship level — enforced in the store.
- Auto-existence rule and world generation remain **future** (spec only).

---

## 8. Testing Strategy — Tiered by Tag

The project owner asked for **granular test switches** so the CI/local split
is explicit and nothing is duplicated, and for the primary dev agent to decide
per change which tests to run.

### 8.1 Tiers (Vitest tags / pnpm scripts)

| Tier | Tag | What it covers | Where it runs |
| --- | --- | --- | --- |
| **unit** | `unit` | Pure logic: payload builder + budget, choice parser, scene manifest validation, relationship graph ops, i18n keys, seeded RNG determinism | CI + local, always fast |
| **integration** | `integration` | Stores/services with mocks: dialogue machine + always-escape, memory/summarizer, relationships systems, Dexie via `fake-indexeddb` | CI + local |
| **e2e** | `e2e` | Browser against the **committed build** with mock harness + WebMCP tools, driven by **Chrome DevTools MCP** (no Playwright scripts — owner preference): boot, scene renders, dialogue flow, choices, letterbox, save/load; **a11y via CDP MCP Lighthouse audit** (§5.5) | Local on demand; can be flagged in CI |
| **perf** | `perf` | Playwright traces / Lighthouse / FPS sampling against soft targets (§9) | Manual / on demand |

### 8.2 Scripts & policy

- `pnpm test` = unit + integration (the always-on suite).
- `pnpm test:unit` / `test:integration` / `test:e2e` / `test:perf` / `test:all`.
- **CI runs:** typecheck + Biome + `test` (unit+integration) + `pnpm build`.
  E2E is not duplicated in CI by default (perf cost, needs browser); it runs
  locally on demand and can be enabled in CI via a workflow flag when needed.
- **Decision rule (owner mandate):** the primary dev agent decides which tiers
  to run on each change — unit+integration after most edits; e2e when the
  change touches boot/rendering/UI flows; perf when performance is at stake.
  This is recorded in `AGENTS.md` as part of the workflow.
- **E2E driver:** Chrome DevTools MCP + WebMCP harness (owner preference).
  The dev agent drives browser tests directly through the CDP MCP instead of
  maintaining Playwright scripts — faster, more flexible, and a11y audits run
  via the CDP MCP Lighthouse audit (`§5.5`).

---

## 9. Performance Targets (soft gates — not CI-blocking)

Measured in e2e/perf runs with Playwright traces / Lighthouse / in-app FPS
sampling; targets are documented, not enforced as hard failures for now:

- **Initial JS bundle ≤ ~500 KB gzipped** (main chunk: PixiJS + Preact +
  i18next + Dexie + app). three.js stays out of the initial load.
- **≥ 30 FPS sustained** on mid-range mobile for a type-A scene with
  particles + fog + lighting active (the §6.1 evaluation criterion).
- **Interactive in < 3 s** on mid hardware after load (mock cache warm).
- Device pixel ratio capped at 2; particle counts scale down on small
  screens (manifest-driven quality tiers).

---

## 10. Tooling Checklist (set up at kickoff)

- pnpm (engines field + `.nvmrc` pinning Node).
- `tsconfig.json` — strict, moduleResolution bundler, target es2020+.
- Vite config per §4.1.
- Biome config (lint + format; git hooks via `simple-git-hooks` or lefthook —
  optional).
- Vitest config with `fake-indexeddb`, jsdom/node environments per tier,
  tag-based script wiring.
- A11y: no extra dependency — a11y audits run through the CDP MCP Lighthouse
  audit + WebMCP state inspection (`§5.5`).
- GitHub Actions workflow (added when the repo is pushed): typecheck →
  Biome → `pnpm test` → `pnpm build`; upload-artifact for `rpg/build/`.
- Dev harness page + mock harness + WebMCP gating flag.

## 11. Open Items / To Be Validated

| Item | Notes |
| --- | --- |
| Exact versions | Snapshot pinned 2026-08 in `research-resolutions.md` §5.2 (PixiJS 8.19, three 0.185, Vite 8.2, Vitest 4.1, Biome 2.5, i18next 26, Dexie 4.4, Preact 10.29, TS 7.0, etc.) — re-pin at setup |
| three.js integration | Only when a type B/C scene is prototyped — confirm the Stage abstraction holds |
| Summarizer implementation | Cadence/budget tuned on-platform via `test-prompt.txt`; **two-tier (daily + window)** per `day-cycle-spec.md` §6 |
| End-of-day scoring run | System 1 batched per day (`day-cycle-spec.md` §5): batch of 2, parseable output, re-call cap, delta application — prototype with mocks |
| Output-limit verification | ~3.5k chars per call (§1) — confirm 2-NPC batching or fall back to 1 per call |
| Save slots & schema | **v1 decided:** 3–6 manual slots + autosave (§7.2); **autosave trigger decided: end of day** (same run as the day-cycle processing, `day-cycle-spec.md` §5) |
| Asset regeneration wiring | Adapter hook exists (§6.1); **decided: re-roll button on the asset + new seed** (`vn-rpg-spec.md` §4.3) — wire cache-key semantics (mode+entity+prompt+seed) for re-rolls |
| Onboarding screens | **Resolved (`vn-rpg-spec.md` §8):** flow + contents defined; MVP = title + wizard complete, Load/Settings/Credits/Help stubs. **Title look resolved** via the reference image + POC (`templates/title-screen-poc/`) |
| Language list & i18n resources | 5 most spoken languages, fallback EN (narrative-spec §8.1) |
| WebMCP tool list | Refined as tests are written |
| A11y settings UI | Text size + skip + reduced-motion toggle in Settings — **post-MVP** (`§5.5`) |
| Lighthouse a11y gating | Via CDP MCP — **post-MVP** (`§5.5`) |
| Scene manifest schema v1 | Baseline drafted in §5.3 (`research-resolutions.md` §2) — refined in the first scene experiment |
| Floor/scale strategy | **Type C (open variant) resolves it** (§2.1/§3.8): 3D floor + backdrop fix scale/floor alignment; type A's floor/scale stays open (fallback use only) |
| GitHub repo + Actions | When the owner pushes the repo |
| Upload automation | Manual copy for now; a script (local-only) may be added later |

## 12. Next Steps

1. ~~Owner approves this spec~~ **Done (stack approval turn):** `AGENTS.md`
   and `README.md` updated (stack decided; ship = `rpg/build/`; test tiers per
   §8).
2. ~~Scaffold `rpg/` with the tooling checklist (§10) — pnpm + Vite + TS strict
   + Biome + Vitest wired and green.~~ **Done (2026-08, commit `97c2f0f`).**
3. ~~Implement the mock harness + adapter + dev/prod cache split.~~ **Done
   (2026-08, commit `363bd24`).**
4. Build the **type-C open-variant scene slice** (MVP): three.js floor +
   backdrop planes per the approved open-scene POC
   (`templates/open-scene-poc/`), placeholder sprites standing on the floor,
   dialogue UI (Preact), always-escape. The PixiJS 2D overlay stack
   (particles/fog/lighting/day-night) lands as the complementary layer; type A
   stays a fallback for selected moments (§2.1).
5. Validate locally (unit/integration/e2e) → commit `rpg/build/` → hand the
   first `test-prompt.txt` to the Perchance agent for runtime validation.
