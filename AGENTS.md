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

The local repo root mirrors the Perchance generator root. Two kinds of content:

| Path | Role |
| --- | --- |
| `main.pjs` | **Symbolic file.** Its content is copy-pasted into the Perchance *Lists* panel. Holds only plugin imports. |
| `index.html` | **Symbolic file.** Its content is copy-pasted into the Perchance *HTML* panel. Minimal shell that references the built app. |
| `rpg/` | The actual game app (typed codebase; stack TBD). Maps to the `src/rpg/` tree on the platform. |
| `PERCHANCE-GUIDE.md`, `AGENTS.md`, docs | Local documentation. |

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

- **Game code (`rpg/`):** developed locally as a typed codebase (stack TBD).
  The local dev/test setup will be defined once the stack is chosen.
- **Platform files (`main.pjs`, `index.html`):** edit in the repo, copy-paste
  into the Perchance editor panels, and verify in the platform preview. Only the
  platform runs the pjs engine and resolves platform-relative paths.
- **AI generation** can take up to a minute: always show a loading indicator and
  cache results where sensible.

## Conventions

- Keep `rpg/` self-contained; use relative imports only.
- No secrets anywhere — everything shipped to Perchance is public.
- Commit messages in English.
