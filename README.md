# RPG — Perchance Generator

> Official project name: **TBD**.

An RPG game built as a [Perchance](https://perchance.org) generator. The game
itself is a normal web app (TypeScript-first codebase; stack TBD); the Perchance
platform provides the hosting shell and the AI plugins used at runtime.

## What this project is

- A playable RPG with AI-generated text (dialogue) and images (sprites/art).
- Runs inside the Perchance platform, which supplies two runtime services via
  the `root` global:
  - `root.generateImage(...)` → AI image generation
  - `root.generateText(...)` → AI text generation
- The Perchance list syntax (pjs) is used only to import those plugins; all
  game logic is written as a normal typed codebase.

## Repository ↔ Platform mapping

| Local (git repo) | Perchance platform |
| --- | --- |
| `main.pjs` | *Lists* panel (content copy-pasted) |
| `index.html` | *HTML* panel (content copy-pasted) |
| `rpg/` | `src/rpg/` |
| `README.md` (this file) | `src/README.md` |

> Only the app code and this file are uploaded to Perchance. Everything else
> (configs, CI, guides, agent instructions) stays local.

## Project knowledge graph (Graphify)

[Graphify](https://github.com/Graphify-Labs/graphify) turns the specs into an
interactive knowledge graph: `graphify-out/graph.html` (clickable, searchable),
a written `graphify-out/GRAPH_REPORT.md` and a queryable `graphify-out/graph.json`.
It is a dev-only tool — everything under `graphify-out/` is gitignored and never
uploaded to Perchance.

Setup (one-time):

1. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`
   (<https://aistudio.google.com/apikey>) and, optionally, `GRAPHIFY_GEMINI_MODEL`.
2. Install the CLI (Python 3.10+): `uv tool install "graphifyy[svg]"`.

Rebuild the graph:

```bash
./graphify.sh            # full extract (AST + semantic pass over docs)
./graphify.sh --force    # full re-scan, ignoring the incremental cache
```

Then open `graphify-out/graph.html` (e.g. `python3 -m http.server` + VS Code
port forwarding) and skim `graphify-out/GRAPH_REPORT.md`.

Query the graph:

```bash
graphify query "how does the relationship web work?"
graphify explain "memory pipeline"
graphify path "scene type C" "day cycle"
```

> The semantic pass over docs calls the Gemini API — the only step that leaves
the machine. Code parsing is local and deterministic (tree-sitter), and only
kicks in once real source code exists.

## For the Perchance AI agent (runtime testing)

This project relies on you for final runtime validation: the AI plugins only
execute inside the platform, and the generator runs in a cross-origin iframe
that is unreachable from outside.

- Read the handoff prompt `test-prompt.txt` (delivered with each test round) —
  it lists exactly what to check, click, measure, and report.
- The app flow: *(to be described once the app is built — title screen, scenes,
  dialogue, settings)*.
- Report results clearly; they feed back into local fixes and CI.
