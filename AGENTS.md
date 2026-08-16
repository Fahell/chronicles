# AGENTS.md

Instructions for AI coding agents working in this repository. **Read this file
first** — it documents project conventions that are easy to get wrong. **Start
with the Session Startup Protocol below: every session must inventory the
available tools, skills, and MCP servers before writing code** — a new session
has no memory of what is installed.

## Session Startup Protocol (mandatory)

Do all of this **before writing any code**:

1. **Read this file** (AGENTS.md) — the source of truth for conventions.
2. **Inventory the available tooling** — a new session forgets what exists:
   - **MCP servers:** `cat .agents/mcp.json` — currently **chrome-devtools**
     (CDP; browser automation, console/network, Lighthouse, WebMCP) and
     **context7** (up-to-date library docs).
   - **Skills:** `ls .agents/skills/` — currently **62**, including the
     official **pixijs** (26) and **threejs** (10) sets, plus `vitest`,
     `vite-patterns`, `webapp-testing`, `graphify`, `webmcp`, and the
     pre-loaded baseline (coding-standards, systematic-debugging,
     tdd-workflow, performance-optimization, …). Load the matching one with
     the `skill` tool when a task touches its domain.
   - **CLI / project tools:** `graphify` (knowledge graph, via `./graphify.sh`
     or `graphify`), `rg` (ripgrep search), and the pnpm scripts in
     `rpg/package.json` (`dev`, `build`, `analyze`, `typecheck`, `lint`,
     `test`/`test:unit`/`test:integration`/`test:e2e`, `format`).
3. **Consult the knowledge graph first:** if `graphify-out/graph.json`
   exists, run `graphify query "<question>"` / `graphify god-nodes` before
   reading files — it maps the specs and code without burning context.
   Rebuild it with `./graphify.sh` after specs change (it sources `.env`).
4. **Read the specs relevant to the task** (index below) before designing.
   The specs are the contract; code follows them, and spec changes are
   deliberate.
5. **Use the installed tooling, never hand-rolled substitutes.** If a skill,
   MCP server, or library for the job is already installed (see "Tools,
   Skills & MCP"), use it. Don't reinvent what the toolchain already has.

## Gameplay-phase architecture (2026-08)

- **Boot flow:** WebGL2 gate (unsupported → static screen) → boot services →
  i18n init → screen router. The scene loads **lazily** in `GameScreen`
  (LoadingScreen while it runs), then the **narrator opening** speaks once,
  then the HUD + dialogue.
- **Session:** `rpg/src/game/session.ts` — the loaded save + its picked NPC;
  `sessionSignal` / `conversationSignal`. The dynamic manifest is built from
  the base scene (`openPlainsBase`) + the user/NPC actors. The user actor
  carries the identity `appearanceSeed` explicitly so the wizard-time sprite
  resolves from cache at scene load.
- **Payload:** `rpg/src/game/payload/builder.ts` — per-voice instructions
  (narrator, NPC) with the taxonomy sections (identity/background, user
  appearance — never the background, scene context, bounded conversation,
  `Respond in {language}` directive). `PAYLOAD_BUDGET` 24k; conversation is
  trimmed oldest-first.
- **Save v1:** Dexie v3 `save` table — 3 manual slots + autosave
  (`rpg/src/game/save/`). Identity is locked to the save.
- **i18n:** `rpg/src/services/i18n.ts` — 5 supported languages, English
  authored now (fallback), browser detection + localStorage override.
- **Multi-turn dialogue:** App-level orchestration (not a machine rewrite):
  choosing an option appends `{player: choice}` + the finished turn to the
  conversation and immediately requests the NPC follow-up, which may carry
  new choices. Leave always closes.
- **Re-roll:** `resolveCharacterSprite` with a fresh seed (cache bust) →
  `stage.updateActor(characterId, textures)`.

## Spec index (all at the repo root)

| Spec | Covers |
| --- | --- |
| `tech-spec.md` | Stack, architecture, build/ship pipeline, test tiers, adapter/cache design |
| `docs/superpowers/plans/*` | Implementation plans per phase (gameplay phase: save, identity, payload, onboarding, i18n, a11y, fog, re-roll) |
| `vn-rpg-spec.md` | Scenes & visual techniques (type A/B/C), assets, poses |
| `narrative-spec.md` | Dialogue system, context payload/taxonomy, choices, i18n policy |
| `relationships-spec.md` | Relationship web + the two systems |
| `day-cycle-spec.md` | Day structure, per-character logs, summarization, end-of-day scoring |
| `gameplay-spec.md` | Stats/inventory/progression (deferred) |
| `pending-decisions.md` | Open decisions & their status |
| `removal-pipeline-spec.md` | Cut-out cache, proxy worker, removal observability, sprite background quality |
| `tools-report.md` | Adopted/evaluated tools, skills, MCP (installation state) |
| `research-resolutions.md` | Research findings applied to the specs (versions, formats) |

## Project Overview

- **What:** an RPG game built as a generator on the **Perchance** platform
  (https://perchance.org), using the platform's AI plugins for text and image
  generation.
- **Stack:** **APPROVED** (`tech-spec.md` §2): TypeScript (strict), pnpm,
  Vite, Preact + signals, **three.js** (lazy async chunk; type-C scene
  baseline)  + **PixiJS v8** (2D overlay stack), **@huggingface/transformers**
  (client-side RMBG-1.4 background removal — lazy chunk, prod sprites only,
  `vn-rpg-spec.md` §4.1; inference in the ORT proxy worker, `proxy=true`,
  `numThreads=1`; the WASM engine is pinned to the onnxruntime-web CDN via
  `wasmPaths` — `ORT_WASM_PATHS` in `bg-removal.ts` must match the version
  in `pnpm-lock.yaml` when transformers.js is upgraded; processed cut-outs
  cached in the Dexie `cutouts` table),
  Dexie/IndexedDB, i18next, Biome, Vitest (test
  tiers per `tech-spec.md` §8), E2E via Chrome DevTools MCP + WebMCP
  harness; CI via GitHub Actions once pushed. Exact versions are re-pinned
  at setup (`research-resolutions.md` §5.2).
  Perchance's list syntax (pjs) is used only at the platform boundary (see
  "Technology Decisions").
- **Platform reference:** `PERCHANCE-GUIDE.md` at the repo root is the in-depth
  guide to how the Perchance platform works. Read it when you need platform
  details (load order, plugins, pjs syntax, gotchas).

## Language Policy

- **All project artifacts are in English:** code, identifiers, comments,
  documentation, commit messages, AGENTS.md.
- Portuguese (pt-BR) may appear only in informal chat with the project owner —
  never in files.

## Repository Structure (read before adding files)

The local repo root mirrors the Perchance generator root. Content types:

| Path | Role |
| --- | --- |
| `main.pjs` | **Symbolic file.** Its content is copy-pasted into the Perchance *Lists* panel. Holds only plugin imports. |
| `index.html` | **Symbolic file.** Its content is copy-pasted into the Perchance *HTML* panel. **The current content is example/placeholder only** — do not treat it as the real project; the real shell is written later. |
| `rpg/` | The actual game app (typed codebase; **stack approved** — see Tech spec §2). Maps to the `src/rpg/` tree on the platform. `rpg/build/` is the committed ship artifact. Game-layer modules: `rpg/src/game/` (save slots + store, payload builder, session, narrator, screen router, dialogue state), `rpg/src/content/` (seed content: archetypes, user background templates, NPC pool 3×3), `rpg/src/effects/` (fog + registry), `rpg/src/ui/screens/` (title, wizard, load, settings, credits, help, game). |
| `README.md` | **Ships to Perchance** (platform-facing orientation doc). See "Ship Policy" below. |
| `PERCHANCE-GUIDE.md`, `AGENTS.md`, docs | **Local-only** documentation (never uploaded). |
| `test-prompt.txt` | **Transient handoff artifact** (English, generated on demand): the runtime-test prompt handed to the Perchance AI agent. See "Development Workflow". |

**How the symbolic files work:** edit them in this repo (so they are version
controlled), then copy their content into the matching Perchance editor panel.
They are **not executed locally** — the Perchance engine exists only on the
platform, which is why `main.pjs`/`index.html` must stay at the repo root.

⚠️ **Never create a `src/` folder locally.** Perchance already has a `src/`
tree on the platform; a local `src/` folder would end up uploaded as
`src/src/`. Local app folders map directly into the platform tree:
**local `rpg/` ↔ platform `src/rpg/`**. Relative paths inside
`main.pjs`/`index.html` are platform-relative (e.g. `src/rpg/build/rpg.js`)
and only resolve on the platform.

## Ship Policy (what goes to Perchance)

Git tracks **everything** (code, configs, CI, tests, docs). But only a minimal,
curated set is ever uploaded to Perchance:

| Ships to Perchance | Where it lands | Purpose |
| --- | --- | --- |
| App code (local `rpg/`) | platform `src/rpg/` | The shipped runtime app. |
| `README.md` | platform `src/README.md` | Orientation doc for the Perchance AI agent: what the project is, the repo↔platform mapping, how to run runtime tests. |

**Everything else stays local-only** (still git-tracked, never uploaded):
`AGENTS.md`, `PERCHANCE-GUIDE.md`, config files (`package.json`, `tsconfig.json`,
CI, linters), tests, and any other dev documentation.

Why:

- The Perchance AI agent reads whatever is in the project; dev/config files
  would only waste its context. It does **not** edit code — it only runs tests.
- `AGENTS.md` is guidance for agents that *edit* the code; the Perchance agent
  never does, so it must not ship.
- Keep `README.md` lean: it is the agent's orientation doc, not a dev manual.

## Technology Decisions

- **TypeScript-first; stack APPROVED** (`tech-spec.md` §2): TypeScript
  (strict), pnpm, Vite, Preact + signals, three.js (lazy async chunk) +
  PixiJS v8 (2D overlay stack), @huggingface/transformers (lazy chunk;
  RMBG-1.4 background removal for prod sprites), Dexie/IndexedDB, i18next,
  Biome, Vitest (tiered tests per §8). Perchance's list syntax is avoided
  inside the app because it is not valid TS/JS and reproducing the engine in
  local mocks is impractical; anything pjs can do (weighted random
  selection, alternation, ranges, templates) is done in the app codebase
  instead.
- **Perchance layer = plugin imports only.** `main.pjs` should contain nothing
  beyond the plugin imports:
  ```
  generateImage = {import:text-to-image-plugin}
  generateText = {import:ai-text-plugin}
  ```
  `index.html` should stay a minimal shell.
- **AI plugins** are external async services exposed as `root.*` globals that
  only exist on the platform:
  - `root.generateImage({ prompt, resolution, negativePrompt, removeBackground })`
    → `{ dataUrl }` (async)
  - `root.generateText({ instruction })` → `{ generatedText | text | string }`
    (async)
  - Keep their call sites isolated in the adapter module
    (`rpg/src/services/perchance-runtime.ts`) so the rest of the app can run
    and be tested without them.

## Tools, Skills & MCP (installed — use them)

Everything here is **already installed and should be used**; a new session
forgets this list, so re-inventory from the actual state (startup protocol
step 2) — this section is the map, not the source of truth.

### MCP servers (`~/.agents/mcp.json`)

| Server | What it's for |
| --- | --- |
| `chrome-devtools` (CDP MCP) | **Primary browser/e2e driver** (owner preference, `tech-spec.md` §8): navigate/click/fill, console & network, a11y snapshot, Lighthouse, WebMCP tools. Dev server default URL: `http://127.0.0.1:5173` (Vite). |
| `context7` | Up-to-date library docs (PixiJS, three.js, Preact, Dexie, …) — query before guessing APIs. |

Playwright is the **second option** to the CDP MCP — only if CDP becomes
unstable for local tests (avoid tool redundancy; `tools-report.md` §7/§11).

### Agent skills (`.agents/skills/`, gitignored)

Installed sets: **pixijs** (26, official), **threejs** (10, community),
**graphify** (official), plus the environment baseline (vite-patterns, vitest,
webapp-testing, webmcp, coding-standards, systematic-debugging, tdd-workflow,
performance-optimization, etc.). Load the matching skill with the `skill` tool
when a task touches its domain. `skills-lock.json` at the repo root records
origin+hash of the community installs (recovery reference).

### CLI / project tooling

- `./graphify.sh` — rebuild/query the **knowledge graph** (sources `.env` for
  the Gemini key; never run the CLI directly without it). Consult the graph
  before reading specs/code when possible.
- `rg` — ripgrep (fast project search; the `code_search` tool wraps it).
- **pnpm scripts** (`rpg/package.json`): `dev`, `build`, `analyze` (bundle
  treemap → `rpg/reports/`, gitignored), `typecheck`, `lint`/`lint:fix`,
  `format`, `test` (unit+integration), `test:unit` / `test:integration` /
  `test:e2e` / `test:all`, `test:watch`.

## Development Environment (ephemeral Cloud Shell)

The Cloud Shell VM is **ephemeral**: `/tmp` and system installs are wiped on
every VM boot; `$HOME` persists but has **limited space**. The project lives in
`$HOME/projects/rpg` (survives resets); the dev tooling is rebuilt by a
bootstrap on every fresh shell.

**Bootstrap:** `~/.bashrc` calls `~/.local/bin/ensure-ephemeral-tools`, which
runs idempotent `ensure-*` steps (Chrome, ripgrep, Playwright, Freebuff, btop,
Graphify). All heavy artifacts go to **ephemeral `/tmp` storage** via the
`CLOUDSHELL_TOOL_ROOT` / `CLOUDSHELL_BIN_DIR` / `CLOUDSHELL_CACHE_ROOT` env
vars — **never install tools into `$HOME`** (space is limited). The bootstrap
is marker-gated (`/tmp/cloudshell-bootstrap.done`) and versioned
(`BOOTSTRAP_VERSION` in the orchestrator).

**When installing a new tool/dependency, follow the same pattern:**

1. Create `~/.local/bin/ensure-<tool>` in the style of the existing `ensure-*`
   scripts: idempotent (exit early when the pinned version is already
   present), install into the ephemeral dirs (e.g. `$BIN_DIR`), validate the
   installed version before exiting.
2. Wire it into `~/.local/bin/ensure-ephemeral-tools`: add a
   `run_step '<Name>' "$SCRIPT_DIR/ensure-<tool>"` call, add a version check to
   `marker_is_current()`, and **bump `BOOTSTRAP_VERSION`** — otherwise the new
   step is skipped on VMs that already ran an older bootstrap.
3. Test the step standalone, then run the orchestrator once to validate the
   full flow. Confirm `bash -n` on both scripts (they run on every shell).
4. Record the pinned version here and in `README.md` when relevant.

Provisioned tools and pins: ripgrep `14.1.0`, playwright `1.62.0`, btop
(latest), graphify `0.9.43` (via `uv tool install "graphifyy[svg,gemini]"`).

Notes:

- `uv` is at `/usr/bin/uv` (not dpkg-owned; may not survive a reset).
  `ensure-graphify` falls back to a standalone `uv` download if it is absent.
- `tmux` is also not dpkg-owned; used only for ad-hoc preview servers
  (`python3 -m http.server` on a port inside a tmux session, then VS Code port
  forwarding).
- The Graphify Gemini key lives in the repo's `.env` (gitignored, local-only,
  survives resets with `$HOME`). The CLI does **not** read `.env`
  automatically — `./graphify.sh` sources it.

## Development Workflow

**Two validation phases.** Local development + CI validate everything that can
be validated without the Perchance runtime; the platform handles the rest.

### Phase 1 — Local development & CI (this repo)

- **Game code (`rpg/`):** typed codebase (stack approved, `tech-spec.md` §2).
  Developed and tested locally with the tiered setup (§8); CI validates build,
  typecheck, unit tests, and lint. The mock harness (`rpg/src/services/mock/`)
  is dev-only and must stay out of the production bundle (tree-shaken by the
  inline `import.meta.env.DEV` gate in `boot.ts`).
- **Platform files (`main.pjs`, `index.html`):** edit in the repo, copy-paste
  into the Perchance editor panels. Only the platform runs the pjs engine and
  resolves platform-relative paths.

### Phase 2 — Runtime validation on Perchance

The Perchance platform ships an **embedded AI agent** with full access to the
deployed project. It can run integration and runtime tests that are impossible
locally, but it has **no development tooling** (no `tsc`, no `vite`, no
bundlers) — it runs tests, it does not build. It orients itself through
`src/README.md` (see "Ship Policy"); that is the only documentation uploaded to
the platform.

**Why runtime tests cannot be done locally or via browser automation:**

- The AI plugins (`generateImage`, `generateText`) are **not APIs** — they only
  execute inside Perchance; there is no local equivalent.
- Driving the live generator from outside (e.g. CDP / browser automation) is
  **not viable**: the generator runs inside a cross-origin iframe that is not
  the top frame, so its frame, console, and logs are unreachable from outside.
  Confirmed by the project owner.

**Handoff protocol (`test-prompt.txt`):**

1. When local tests and CI give the green light, write a prompt file at the
   **repo root**: `test-prompt.txt` (English).
2. The prompt tells the Perchance agent exactly which runtime tests to perform
   (what to check, click, measure, or log) and what to report back.
3. The project owner pastes the file's content into the Perchance AI agent,
   which runs the tests and reports the results.
4. Results feed back into local fixes and CI; regenerate `test-prompt.txt` for
   each new test round.

**AI generation** can take up to a minute: always show a loading indicator and
cache results where sensible.

## Coding Conventions

### Stack & tooling rules

- **TypeScript strict** everywhere under `rpg/` (`tsconfig.json` — strict,
  moduleResolution bundler, TS 7.x, Preact JSX via `jsxImportSource: "preact"`).
- **JSX goes in `.tsx` files** — `.ts` rejects JSX under TS 7.
- **Use the pinned versions** (`research-resolutions.md` §5.2, `package.json`);
  re-pin deliberately, not casually.
- **No app-level retry/timeout on plugin content** (owner decision,
  `pending-decisions.md` §5): the plugins self-retry; we only surface loading
  state. The adapter never aborts in-flight generations.
- **Modes drive behavior**: dev vs prod (`RuntimeMode`) selects
  `removeBackground`, the Dexie DB name (`rpg_dev` / `rpg`), and the mock.
  Never hardcode a mode-specific value in a service.

### Structure & imports

- Keep `rpg/` self-contained; **relative imports** only (`@/` alias exists but
  relative is the convention; `tech-spec.md` §3 layout).
- **Only `perchance-runtime.ts` touches `root.*`** — everything else depends
  on the typed `ImageService`/`TextService` interfaces.
- Effects are **declarative in the scene manifest** and each effect is an
  isolated, unit-testable module (tech-spec §5.2). The first effect is the
  **fog overlay** (`rpg/src/effects/fog.ts`, PixiJS) — created by the loader
  from `manifest.effects` via `rpg/src/effects/index.ts` and ticked every
  frame through `stage.tick(dt)` (independent of 3D dirtiness).
- Pure logic (payload builder, choice parser, graph ops, manifest validation)
  lives **outside** stores so it is unit-testable without DOM/Preact
  (tech-spec §7.1).

### Testing (tiered — decide per change)

| Tier | What it covers | When to run |
| --- | --- | --- |
| `unit` | Pure logic: payload builder + budget, choice parser, scene manifest validation, relationship graph ops, seeded RNG | CI + local, always fast |
| `integration` | Stores/services with mocks: dialogue machine + always-escape, memory/summarizer, relationships systems, Dexie via `fake-indexeddb` | CI + local |
| `e2e` | Browser against the **committed build** with mock harness + WebMCP tools, driven by **Chrome DevTools MCP** (no Playwright scripts) | Local on demand; flagged in CI |
| `perf` | Playwright traces / Lighthouse / FPS sampling against soft targets | Manual / on demand |

- `pnpm test` = unit + integration (the always-on suite).
- **Decision rule (owner mandate):** the primary dev agent decides which tiers
  to run on each change — unit+integration after most edits; e2e when the
  change touches boot/rendering/UI flows; perf when performance is at stake.
- **E2E driver:** Chrome DevTools MCP + WebMCP harness (owner preference).
  Drive browser tests directly through the CDP MCP instead of maintaining
  Playwright scripts.

### Validation before finishing

After any non-trivial change under `rpg/`, run (in `rpg/`):

1. `pnpm typecheck`
2. `pnpm lint` (Biome; `lint:fix` for autofixable issues)
3. `pnpm test` (unit + integration)
4. `pnpm build` when the change affects the bundle or shipping
5. `pnpm test:e2e` when the change touches boot/rendering/UI flows

### Shipping to Perchance (the `perchance` branch)

- The Perchance workspace gets a **dedicated branch** (`perchance`), NOT the
  whole repo — only the upload set (tech-spec §4.3): `index.html`, `main.pjs`,
  `src/README.md`, `src/test-prompt.txt`, `src/rpg/build/` (the committed
  bundle) and `src/rpg/src/` (readable TS for the agent). Configs, specs,
  CI, guides and graphify stay on `main`.
- **Regenerate it with `./scripts/ship-perchance.sh [--push]`** (from repo
  root; requires a fresh `pnpm build` inside — the script does it). Run with
  `--push` to publish the branch to origin. Do NOT edit `perchance` by hand.
- **Push happens only at round time (owner direction):** commit on `main` as
  you go, but push to origin **only when preparing a Perchance test round** —
  push `main`, then `./scripts/ship-perchance.sh --push`, together. Don't
  push after every commit; the remote only matters when a new round is
  being shipped.
- After any change that alters the app bundle or `test-prompt.txt`, re-ship
  at the next round: `./scripts/ship-perchance.sh --push` (preceded by the
  `main` push).
- `test-prompt.txt` (repo root) is the **handoff prompt** for the Perchance
  agent — one per test round; update it with what to check/report before
  shipping a round.

### Shut down Chrome after local browser tests (CPU)

The CDP MCP launches a headless Chrome with the project's profile
(`.agents/chrome-profile`). It spawns **~13 processes / ~1.7 GB RSS**, and the
**GPU process burns CPU continuously** (SwiftShader software WebGL in
headless — no real GPU, every frame is rasterized on the CPU).

The app itself renders **on demand** (dirty-flag render loop in
`three-stage.ts` — the scene is static, so an idle scene costs ~0% CPU);
whatever CPU remains after boot is Chrome's software rasterization, not the
app. Even so, once local browser testing is done, kill Chrome — it is NOT
owned by any daemon and nothing restarts it automatically:

```bash
pkill -f "/opt/google/chrome/chrome" 2>/dev/null; sleep 2
ps -eo pid,%cpu,rss,args | grep -E "/opt/google/chrome/chrome" | grep -v grep  # expect: none
```

Notes:
- **The MCP relaunches Chrome on EVERY tool call** (`list_pages`, navigate,
  click, screenshot, …) — killing Chrome once is not enough; it comes back
  the next time the browser is touched. Therefore run the `pkill` **every
  time you finish using the CDP MCP**, not just at session end: the last
  browser-related action of any task must be the shutdown below.
- **CRITICAL: never match on `user-data-dir` or the string `chrome-profile`**
  in the `pkill` pattern — the `chrome-devtools-mcp` process itself passes
  `--user-data-dir=…/chrome-profile` in its own args (see `.agents/mcp.json`),
  so such a pattern kills the MCP server too, severing the CDP connection
  for the session. Match the **Chrome binary path only** (`/opt/google/chrome/
  chrome`) as above — the MCP process (`npx … chrome-devtools-mcp`) never
  contains that string, so it survives.
- Before finishing any session that used browser validation, run the `pkill`
  and confirm zero matching processes remain.

### Git & GitHub conventions

- **Commit messages:** English, **Conventional Commits** (`feat:` `fix:`
  `docs:` `chore:` `refactor:` `test:`), with an **optional scope** — use
  `rpg` for app changes (`feat(rpg): …`). Describe the *why*, not just the
  *what*. Body: wrap at ~72 cols; no AI-trailer needed beyond the standard
  footer used by the dev agent.
- **Ship artifact:** when the app bundle changes, commit the regenerated
  `rpg/build/` alongside the source (it is the Perchance upload set).
- **Push discipline:** commit locally as you go; push to `main` **only when
  preparing a Perchance test round** (right before `ship-perchance.sh
  --push`). Avoid per-commit pushes — the remote is for rounds, not
  checkpoints.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main`
  and on PRs: typecheck → Biome → unit+integration → build → e2e build gate →
  upload `rpg/build` artifact. It activates once the repo is pushed.
- **PRs:** use `.github/pull_request_template.md`; run the validation
  checklist there before opening. The full e2e tier (browser) is local-only
  via the CDP MCP — flag it in the PR when the change touches
  boot/rendering/UI flows.
- **No secrets anywhere** — everything shipped to Perchance is public; `.env`
  is gitignored and local-only.

### Conventions from the ecosystem

- Commit messages in English (see Git & GitHub above).
- Keep `rpg/` self-contained; use relative imports only.
