# VN-RPG — Technical Spec (Stack, Tooling & Architecture)

> **Status:** Draft — proposal. The stack is now *decided at a high level*
> (interview with the project owner), but exact versions and several
> implementation details remain open and will be pinned during setup.
> **Scope:** development stack, tooling, build/ship pipeline, and the app's
> technical architecture. It translates the ideation specs
> (`vn-rpg-spec.md`, `narrative-spec.md`, `relationships-spec.md`) into
> concrete technical decisions.
> **Owner:** project owner + primary dev agent
> **Related:** `vn-rpg-spec.md`, `narrative-spec.md`, `relationships-spec.md`,
> `pending-decisions.md`, `AGENTS.md` (conventions), `PERCHANCE-GUIDE.md`
> (platform reference), `README.md` (platform-facing orientation).

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
- **Generation is slow** (up to ~1 min). Always show loading indicators and
  cache aggressively.
- **Ship policy:** only the built app code and `README.md` go to Perchance.
  Everything else (configs, tests, CI, this spec) stays local, git-tracked.
- **Language:** all artifacts in English (UI + docs + code).

---

## 2. Stack Decision (summary)

| Concern | Choice | Rationale |
| --- | --- | --- |
| Language | **TypeScript (strict)** | Minimum requirement from day one; typed across the whole codebase. |
| Package manager | **pnpm** | Fast, disk-efficient, workspace-ready; owner's choice. |
| Dev server / bundler | **Vite** (dev + build) | HMR in dev; production build with `base: './'` (relative paths work inside the Perchance iframe). Code-splitting for lazy three.js. |
| Scene rendering | **PixiJS v8** (scene type A + effects) | Best-in-class 2D WebGL/WebGPU renderer for layered sprites, particles, and 2.5D effects; high performance on mobile. |
| 3D rendering | **three.js** (lazy async chunk) | Only for scene types B/C when prototyped; dynamically imported so it never costs initial load until a 3D scene exists. |
| UI layer | **Preact + signals/context** | Tiny (~4 KB) React-compatible runtime; `@preact/signals` gives fine-grained reactivity for the dialogue/choices/HUD overlay. |
| Persistence | **Dexie / IndexedDB** | Standard web API: works identically locally and on the platform; testable in CI; one DB, several tables. (Precedent: previous Mathema project.) |
| i18n | **i18next** | Mature, pluralization + interpolation + lazy resources; feeds the language variable into AI payloads (narrative-spec §8). (Precedent: Mathema.) |
| Lint + format | **Biome** | Single fast Rust-based tool for lint + format + TS-aware checks. |
| Tests | **Vitest** (unit/integration) + **browser E2E via CDP/Playwright + WebMCP harness** (local) | Tiered by tag (see §8); no duplicated coverage between CI and local. |
| CI | **GitHub Actions** (once the repo is pushed) | Typecheck + lint + unit/integration tests + production build. |
| Build artifact | **`rpg/build/` committed to git** | The upload step is a plain copy of tracked files; the Perchance agent sees exactly what is in production. |

### 2.1 Why PixiJS first, three.js later (owner decision)

- Scene type A (static image + code effects) is the first experiment and is a
  **2D problem**: layered sprites over a backdrop with particles, fog, dynamic
  lighting, day/night. PixiJS is the fastest, most mature 2D renderer and keeps
  type A simple and performant on mobile.
- Scene types B/C are 3D; when prototyped, **three.js is dynamically imported**
  (async chunk) and the scene layer is designed so a scene declares which
  renderer it needs. Type C (papercraft) is three.js + images; type B is pure
  three.js.
- To keep the door open, the render layer exposes a **thin `Stage` interface**
  (add/remove layers, resize, tick) with a PixiJS implementation now and a
  three.js implementation later — the rest of the app never imports a renderer
  directly.

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
  authored as typed TS data files (compiled into the bundle).
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

---

## 6. AI Runtime & Mock Harness

### 6.1 Platform adapter (`services/perchance-runtime.ts`)

- The **only** module that touches `root.generateImage` / `root.generateText`
  (AGENTS.md convention). Everything else depends on typed interfaces:
  - `interface ImageService { generate(opts: ImageOpts): Promise<ImageResult> }`
  - `interface TextService { generate(opts: TextOpts): Promise<TextResult> }`
- Production impl wraps `root.*` (normalizing `result.dataUrl || result` and
  `generatedText | text | string`). Dev impl is the mock harness.
- **Modes:** dev (`removeBackground: false`) vs prod (`removeBackground: true`),
  with **separate caches per mode** (separate Dexie databases, e.g. `rpg_dev`
  and `rpg`) so development generations never pollute production (vn-rpg-spec
  §4.2).
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
| `save` | game snapshots (per save slot): identity, scene, progress, flags |
| `characters` | registry: user identity + NPCs (visual description, background, pose availability) |
| `relationships` | the web: edges `(from, to, type, intensity, direction)` |
| `memory` | per-voice memory records (session-scoped initially; summarization later) |

- Dexie **versioning** migrations from day one; DB name carries the mode
  (`rpg_dev` / `rpg`).
- Saves and the relationship web **persist across sessions** (relationships-spec
  §8) — on the platform this is per-user IndexedDB, exactly as locally.

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
| **e2e** | `e2e` | Browser against the **committed build** with mock harness + WebMCP tools, driven by CDP/Playwright: boot, scene renders, dialogue flow, choices, letterbox, save/load | Local on demand; can be flagged in CI |
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
- GitHub Actions workflow (added when the repo is pushed): typecheck →
  Biome → `pnpm test` → `pnpm build`; upload-artifact for `rpg/build/`.
- Dev harness page + mock harness + WebMCP gating flag.

## 11. Open Items / To Be Validated

| Item | Notes |
| --- | --- |
| Exact versions | Pin at setup (PixiJS 8, three.js r-latest when integrated, Vite latest, Biome, Vitest, i18next, Dexie, Preact + signals) |
| three.js integration | Only when a type B/C scene is prototyped — confirm the Stage abstraction holds |
| Summarizer implementation | Cadence/budget tuned on-platform via `test-prompt.txt` |
| Save slots & schema | First version: single slot vs multiple — decide in MVP |
| Asset regeneration wiring | Adapter hook exists (§6.1); cache/seed semantics once the UI decision lands (vn-rpg-spec §4.3) |
| Intro screen flow | New Game / Load / Settings minimum (§8 vn-rpg-spec) — contents open |
| Language list & i18n resources | 5 most spoken languages, fallback EN (narrative-spec §8.1) |
| WebMCP tool list | Refined as tests are written |
| Scene manifest schema v1 | Drafted during the first scene experiment |
| Floor/scale strategy | Open (vn-rpg-spec §9) — manifest hooks + debug overlay are ready |
| GitHub repo + Actions | When the owner pushes the repo |
| Upload automation | Manual copy for now; a script (local-only) may be added later |

## 12. Next Steps

1. Owner approves this spec; update `AGENTS.md` (stack decided; test-tier
   decision rule) and `README.md` (ship = `rpg/build/`).
2. Scaffold `rpg/` with the tooling checklist (§10) — pnpm + Vite + TS strict
   + Biome + Vitest wired and green.
3. Implement the mock harness + adapter + dev/prod cache split.
4. Build the **type-A scene slice** (MVP): PixiJS stage, backdrop, particles/
   fog/lighting/day-night, layered sprite, dialogue UI (Preact), always-escape.
5. Validate locally (unit/integration/e2e) → commit `rpg/build/` → hand the
   first `test-prompt.txt` to the Perchance agent for runtime validation.
