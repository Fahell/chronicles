# VN-RPG — Complementary Tools Report (battle-tested)

> **Status:** Draft — research findings from a web + skills-registry sweep.
> Recommendations are graded (adopt / evaluate / reference / future) and mapped
> to the specs. Skill **installations are pending owner confirmation**
> (community skills are not vetted).
> **Scope:** libraries, devtools, agent skills, and MCP servers that complement
> the stack chosen in `tech-spec.md` — so we don't reinvent the wheel.
> **Owner:** project owner + primary dev agent
> **Related:** `tech-spec.md` (stack), `vn-rpg-spec.md`, `narrative-spec.md`,
> `relationships-spec.md`, `PERCHANCE-GUIDE.md`.

---

## 1. Summary (adoption matrix)

| Priority | Items |
| --- | --- |
| ✅ **Adopt now** | `@pixi/particle-emitter` (v8) + `pixi-filters`, **GSAP** (+ PixiPlugin), **gpt-tokenizer**, **Valibot**, **seedrandom**, **rollup-plugin-visualizer**, i18next companions, **official pixijs skills** |
| ⚖️ **Evaluate at the right time** | **Ink.js** (scripted arc), **Cytoscape.js** (relationship-web UI), **GitHub MCP / Memory MCP** (when repo is published), **threejs skills** (now eligible — three.js entered the stack; §10) |

> **Visual regression (owner decision 2026-08):** Playwright is the **second
> option** to the Chrome DevTools MCP — it is used **only if the CDP MCP
> becomes unstable for local tests** (avoids tool redundancy). See §7.1.
| 📌 **Reference / future** | Monogatari, Yarn Spinner, Howler.js / Tone.js, Perchance `upload-plugin`, `music-generation` skill |

---

## 2. Rendering ecosystem — PixiJS (tech-spec §5)

### 2.1 `@pixi/particle-emitter` — ✅ adopt
- **What:** the official particle system for PixiJS (pixijs-userland), configurable
  declaratively (JSON) with an interactive visual editor for designing emitters.
- **Fit:** particles are priority #1 in `vn-rpg-spec.md` §3.3 (rain, snow, embers,
  dust, petals). Declarative emitter config slots directly into the scene
  manifest (tech-spec §5.2).
- **Battle-tested evidence:** long-standing official project; large install
  base. **Update (2026-08):** the canonical repo now ships **v8 support**
  (`@pixi/particle-emitter` **5.0.10**, pinned in `research-resolutions.md`
  §5.2) — the previously noted v8 fork (`@spd789562/particle-emitter`) is **no
  longer needed**; use the official package.
- **Recommendation:** use the official `@pixi/particle-emitter` v5 with the v8
  `ParticleContainer`-based path. For trivial effects, PixiJS v8's native
  `ParticleContainer` alone may suffice (official blog: optimized for
  rendering massive numbers of lightweight visuals) — keep a thin effect
  interface so we can switch between the two.

### 2.2 `pixi-filters` — ✅ adopt
- **What:** the community/official filters collection for PixiJS: glow, blur,
  displacement, color matrix, and more.
- **Fit:** dynamic lighting, torch flicker/glow, fog with blend modes, and
  day/night color grading (vn-rpg-spec §3.3; tech-spec §5.2).
- **Battle-tested evidence:** shipped with PixiJS for years, used broadly.

---

## 3. Animation & transitions — ✅ adopt

### 3.1 GSAP (GreenSock)
- **What:** the industry-standard, framework-agnostic animation library
  (~50k+ GitHub stars; used across commercial web games/experiences).
- **Fit:** tweens any numeric property of PixiJS objects — sprite pose swaps
  with fade (vn-rpg-spec §3.7), scene transitions, dialogue-box animation. Has
  an **official PixiPlugin** for ergonomic PixiJS tweening.
- **Alternative:** `@tweenjs/tween.js` (tiny, used in three.js examples) if we
  want a zero-dependency tween for simple cases.
- **Recommendation:** GSAP for authored/animated transitions; keep tweens
  behind a small `tween.ts` service so the dependency is swappable.

---

## 4. LLM payload budgeting (narrative-spec §5.2; tech-spec §7.3)

### 4.1 `gpt-tokenizer` — ✅ adopt
- **What:** pure-JS BPE tokenizer (GPT-2/3/4, `cl100k`), no WASM — runs in the
  browser and in Vitest/node.
- **Fit:** replaces the char-count heuristic of the budget guard with real
  token counting (~6k-token window ≈ 24k chars target). Unit-testable payload
  budget validation becomes precise.
- **Battle-tested evidence:** actively maintained; used widely for client-side
  token estimation.

### 4.2 `js-tiktoken` — ⚖️ alternative
- WASM port of OpenAI's `tiktoken` — faster, heavier. Only if the pure-JS
  version proves too slow (unlikely at our payload sizes).

> ⚠️ **Calibration note:** the text plugin's actual model/encoding is unknown
> (Perchance-side). Local token counting is an excellent approximation; the
> final token/char ratio must be calibrated on the platform via
> `test-prompt.txt` rounds, as already planned.

---

## 5. Runtime schema validation — ✅ adopt

### 5.1 Valibot (vs Zod)
- **What:** schema validation library with a Zod-compatible API at ~1.4 KB
  (~90% smaller than Zod v4's ~17 KB) for typical schemas.
- **Fit:** validates the versioned `SceneManifest` (vn-rpg-spec §3.5 /
  tech-spec §5.3), the save schema, and WebMCP tool I/O. The tiny footprint
  matters under the soft 500 KB-gzipped initial-bundle target (tech-spec §9).
- **Battle-tested evidence:** actively maintained (by the author of
  `superstruct` lineage); explicitly compared against Zod in multiple
  benchmarks; API-compatible so switching to Zod later is low-cost.
- **Recommendation:** Valibot now; if the Zod ecosystem becomes necessary,
  the swap is trivial.

---

## 6. Deterministic randomness — ✅ adopt

### 6.1 `seedrandom` (David Bau)
- **What:** battle-tested seeded PRNG.
- **Fit:**
  - deterministic particle configs (tech-spec §5.2),
  - the **code-driven** System 2 world events of the relationship web
    (relationships-spec §4.2 — "purely code, no LLM"; seeded RNG makes the
    algorithm testable),
  - future world character generation (relationships-spec §7),
  - the `Math.random()` wrapping the Perchance guide recommends for seeded runs.
- **Battle-tested evidence:** decades of production use; the de-facto standard
  seeded RNG for JS.

---

## 7. Visual regression testing (tech-spec §8 e2e tier) — second option

### 7.1 Playwright `toHaveScreenshot()` (pixelmatch)
- **Owner decision (2026-08):** Playwright is the **second option** to the
  Chrome DevTools MCP — it is used **only if the CDP MCP becomes unstable for
  local tests**. The CDP MCP (already configured and operational) covers the
  e2e surface (interaction, a11y snapshot, console/network, Lighthouse,
  WebMCP tools), so Playwright would be redundant as a primary driver.
- **What it would add:** native visual comparison in Playwright Test, powered
  by **pixelmatch** (battle-tested diffing library) — screenshot baselines for
  scene rendering, letterbox layout, effects, pose placement.
- **No-Playwright alternative (preferred if needed):** capture screenshots via
  the CDP MCP and diff with **pixelmatch** directly — keeps the owner's
  "no Playwright scripts" preference.
- **Battle-tested evidence:** built into Playwright (Microsoft-maintained),
  used across the industry — kept on standby, not installed.

---

## 8. Relationship web — ⚖️ evaluate later

### 8.1 Cytoscape.js
- **What:** mature graph model + rendering library (canvas/WebGL).
- **Fit:** the typed graph in `services/relationships.ts` (tech-spec §7.4) is
  sufficient as a data structure today; Cytoscape's value is a **future UI**
  visualizing the web with the visibility gating of relationships-spec §6.
- **Battle-tested evidence:** long-standing, widely used (bioinformatics,
  network visualization, games).
- **Recommendation:** do not add now; revisit when/if a web-view UI is specced.
  (Alternative: Sigma.js — heavier, WebGL-focused.)

---

## 9. Scripted narrative — ⚖️ evaluate later

| Tool | Notes | Verdict |
| --- | --- | --- |
| **Ink.js** (inkle) | Battle-tested branching-narrative language + tiny JS runtime (used in *80 Days*, *Heaven's Vault*). Candidate for the **scripted main arc** (vn-rpg-spec §2: "main story arc is scripted"). The AI-driven/emergent content stays on our custom dialogue machine (narrative-spec §3; tech-spec §7.1). | ⚖️ Revisit when the main arc is authored |
| **Monogatari** | The most-used web VN engine (Phaser-based). Full framework (scenes/characters/save) but opinionated — integrating live AI generation would fight the framework. | 📌 Reference for patterns only |
| **Yarn Spinner** | Excellent inside Unity/Godot; the standalone web port is less battle-tested. | 📌 Reference |

**Verdict:** keep the custom dialogue machine (as specced); Ink.js remains an
option for authored scripted content later.

---

## 10. Agent skills (registry findings)

| Skill | Source | Installs | Verdict |
| --- | --- | --- | --- |
| `pixijs/pixijs-skills` (`pixijs`, `pixijs-application`, `pixijs-core-concepts`, `pixijs-scene-graphics`, `pixijs-performance`) | **Official PixiJS team** | ~3.5–4.2K each | ✅ **Install now (owner-confirmed 2026-08)** — into `.agents/skills/` |
| `cloudai-x/threejs-skills` (`threejs-fundamentals`, `threejs-animation`, `threejs-shaders`, …) | Community | 7.5–12K | ✅ **Now eligible** — three.js entered the stack (type C approved); installing (owner-confirmed 2026-08) |
| Environment skills already loaded | `webmcp`, `webapp-testing`, `vite-patterns`, `vitest`, `performance-optimization`, `core-web-vitals`, `memory-leak-debugging`, `tdd-workflow`, … | — | ✅ Already available |
| Perchance platform skills (per guide) | `music-generation`, `dynamic-metadata` | — | 🔮 Future (audio; `$meta.dynamic`) |

> Community skills are **not vetted** — installation happens only after the
> owner confirms, one skill set at a time.

---

## 11. MCP servers

| MCP | What it adds | Verdict |
| --- | --- | --- |
| **`@playwright/mcp`** (Microsoft, official) | Browser automation over MCP with structured accessibility snapshots. | ❌ **Not needed (owner decision 2026-08)** — the Chrome DevTools MCP is the primary driver; Playwright is the **fallback only if CDP becomes unstable** for local tests (avoids tool redundancy) |
| **GitHub MCP** (`github/github-mcp-server`, official) | Issues/PRs/CI management once the repo is published. | ⚖️ When publishing |
| **Memory MCP** (`modelcontextprotocol/servers`) | Agent knowledge-graph memory across sessions — long projects benefit from persisted decisions. | ⚖️ Optional |
| **Context7** | Docs for PixiJS/three.js/etc. | ✅ Already configured |

> **Environment note:** `.agents/mcp.json` previously pointed the Chrome
> DevTools MCP at the old **mathema** project (URL `127.0.0.1:4173` + mathema
> chrome profile). It has been repointed to the **rpg** dev server (Vite
> default `127.0.0.1:5173`) with a project-local chrome profile. It takes
> effect once `rpg/` is scaffolded and `pnpm dev` is running.

---

## 12. Bundle & performance tooling (tech-spec §9 — soft gates)

| Tool | What it adds | Verdict |
| --- | --- | --- |
| **`rollup-plugin-visualizer`** | Treemap of bundle composition — verifies where the weight is against the ≤500 KB-gzipped initial target. | ✅ Adopt — **wired (2026-08):** `pnpm analyze` (separate `vite.analyze.config.ts`; report → `rpg/reports/bundle.html`, gitignored — kept out of the Perchance upload set). First run: rpg.js **36 kB gz** vs 500 kB target. |
| **Lighthouse CI** | On-demand performance auditing in the `perf` tier. | ✅ Adopt (perf tier) |
| **`size-limit`** | Hard bundle gates — only if soft gates prove insufficient later. | 🔮 Optional |

---

## 13. Future phases (mapped, out of scope now)

- **Audio:** Howler.js (battle-tested) / Tone.js (procedural) + Perchance
  `music-generation` skill — when the audio phase starts.
- **Large assets (>5 MB):** Perchance `upload-plugin` (per-file limit is
  5 MB in `src/`) — for audio/models, per the platform guide.
- **i18n companions:** `i18next-browser-languagedetector` +
  `i18next-resources-to-backend` — standard battle-tested companions for
  i18next (narrative-spec §8).

---

## 14. Pending confirmations & next steps

1. ~~Owner confirmation to install the pixijs skills~~ **Done (2026-08):**
   pixijs + threejs skills installed into `.agents/skills/`.
2. ~~Scaffold `rpg/` (tech-spec §10) including the adopted libs: `pixi.js`,
   `@pixi/particle-emitter` (v8 path), `pixi-filters`, `gsap`,
   `gpt-tokenizer`, `valibot`, `seedrandom`, i18next companions,
   `rollup-plugin-visualizer`.~~ **Done (2026-08):** all installed; visualizer
   wired via `pnpm analyze` (§12). The remaining installed libs
   (`gpt-tokenizer`, `seedrandom`, i18next companions, `gsap`) activate when
   their milestone code lands (payload builder, System 2, i18n, tweens).
3. ~~Wire Playwright `toHaveScreenshot()`~~ **Decision (2026-08):** Playwright
   is the **second option** — only if the CDP MCP becomes unstable for local
   tests; CDP screenshots + pixelmatch keep the no-Playwright preference (§7).
4. Revisit ⚖️ items (Ink, Cytoscape, GitHub/Memory MCP) at the milestones
   listed above.
