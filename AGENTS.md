# AGENTS.md

Instructions for AI coding agents working in this repository. **Read this file
first** — it documents project conventions that are easy to get wrong.

## Project Overview

- **What:** an RPG game built as a generator on the **Perchance** platform
  (https://perchance.org), using the platform's AI plugins for text and image
  generation.
- **Stack:** **not yet defined.** The minimum requirement is **TypeScript**;
  framework and tooling decisions are still pending and will be made with the
  project owner. Do not assume a specific framework, bundler, or runtime.
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
| `rpg/` | The actual game app (typed codebase; stack TBD). Maps to the `src/rpg/` tree on the platform. |
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

- **TypeScript-first; stack TBD.** The game is built as a normal, typed
  codebase — TypeScript at minimum. The framework and tooling are **not yet
  decided**; confirm with the project owner before assuming one. Perchance's
  list syntax is avoided inside the app because it is not valid TS/JS and
  reproducing the engine in local mocks is impractical; anything pjs can do
  (weighted random selection, alternation, ranges, templates) is done in the
  app codebase instead.
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
  - Keep their call sites isolated in a small adapter module so the rest of the
    app can run and be tested without them.

## Development Workflow

**Two validation phases.** Local development + CI validate everything that can
be validated without the Perchance runtime; the platform handles the rest.

### Phase 1 — Local development & CI (this repo)

- **Game code (`rpg/`):** typed codebase (stack TBD). Developed and tested
  locally; the dev/test setup is defined once the stack is chosen. CI validates
  build, typecheck, unit tests, and lint.
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

## Conventions

- Keep `rpg/` self-contained; use relative imports only.
- No secrets anywhere — everything shipped to Perchance is public.
- Commit messages in English.
