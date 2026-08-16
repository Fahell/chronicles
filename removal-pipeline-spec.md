# Removal Pipeline — Round 6 Spec (cache + async + observability + removal quality)

Status: **initial draft — speculative, open to change** (same posture as the other specs).
Driven by the Perchance round-5 runtime report (`rpg/result-tests-perchance.txt`).
Owner decisions gathered via interview on 2026-08-16.

---

## 1. Context: what round 5 proved

The client-side removal pipeline works end-to-end and beats the plugin's native
removal (confirmed visually and by pixel analysis):

- RMBG-1.4 (q8, ~42 MB) + ONNX Runtime Web runs fully in the browser; the
  plugin's `removeBackground` is **disabled** for sprites in prod and RMBG is
  the only active remover (verified in `src/scene/assets.ts`: raw generation
  with `removeBackground: false` → `removeBackgroundClient`).
- Fallback to the platform removal never fired; no black box, no bright
  speckles; cut-outs are clean-ish.

But three problems remain, in priority order:

1. **Boot blocks the main thread for minutes.** Cold first boot ≈ 5–6 min
   (42.3 MB model at ~165 s on the platform's network); even a warm reload
   took ~79 s with ~98 % of the time on the main thread — **because the
   inference re-ran on every boot** (the processed cut-out is not cached).
   The static "Generating scene…" overlay gives no feedback; the Perchance
   agent could not tell the model was working (nothing in the console).
2. **Dark mottling / detached dark blocks** appear on assets where removal
   happens — not only near the feet. Root cause evidence: the raw sprites did
   **not** arrive on a pure-black background (elder: dark-grey with white
   corners; player: near-black with navy corners) — the generation prompt was
   partially ignored.
3. **The floor↔backdrop junction reads as a "box".** The dark band the agent
   flagged is the backdrop's bottom edge (not even visible — the floor joins
   above the backdrop base), not a junction gap. The real issue is the lack of
   a natural transition between floor and backdrop.

The outline itself is **approved** (owner): no radius change. What looked
wrong in the screenshots are the removal artifacts, addressed in §5.

---

## 2. Scope (this round)

| # | Item | Decision |
|---|------|----------|
| D1 | Cache the processed cut-out | IndexedDB, own table, keyed by raw asset key + pipeline version |
| D2 | Async, non-blocking removal | `env.backends.onnx.wasm.proxy = true` (keeps `numThreads = 1`) |
| D3 | Observable process | Animated loading screen with live stages + discreet corner chip with counter + structured console logs |
| D4 | Model preload | Unchanged (fire-and-forget at boot, prod only) |
| D5 | Dark blocks | White background + baked ground shadow sprite prompt (round-9 contract; supersedes the round-7 pure-black lever) |
| D6 | Floor "box effect" | No code change; mitigations documented for later |
| D7 | `[choices]` block | Keep optional; behavioral finding documented |
| D8 | Plugin removal | Confirm and lock: only RMBG active in prod; plugin removal = fallback + dev mock parity only |

**Non-goals:** no worker rewrite beyond the `proxy` flag; no mask/matte
levers for the dark blocks (documented only, §5); no junction geometry
changes (D6); no `[choices]` prompt change (D7).

---

## 3. D1 — Cut-out cache

**Where:** new Dexie table `cutouts` in the same mode-scoped DB
(`rpg_dev` / `rpg` — `src/services/db.ts`). Schema v2 migration:

```
version(2).stores({
  assets: "key, mode, createdAt",
  cutouts: "key, pipeline, createdAt",
});
```

Row shape (mirrors `AssetRow`):

```ts
interface CutoutRow {
  /** cutoutCacheKey(mode, rawAssetKey, PIPELINE_VERSION) — see below. */
  key: string;
  /** Final processed sprite: RMBG cut-out + matte cleanup (PNG dataUrl). */
  dataUrl: string;
  mode: RuntimeMode;
  createdAt: number;
}
```

**Key derivation:** the cut-out is a *derived* asset of the raw generation, so
its key embeds the raw cache key and the pipeline version:

```
cutoutKey = rawAssetKey(mode, req) + "|cutout|" + PIPELINE_VERSION
```

- `rawAssetKey` = the existing `assetCacheKey(...)` from
  `src/services/generation.ts` (already busts on prompt/seed/resolution/
  removeBackground changes).
- `PIPELINE_VERSION` = a constant in the removal pipeline (e.g. `"rmbg-q8-v1"`)
  bumped whenever removal/matte/outline logic changes — one bump invalidates
  every cut-out.

**Pipeline order (prod):**

1. `assets.getOrGenerate(raw)` — unchanged (raw sprite on pure **white**
   background since round 9, with the ground shadow baked into the image).
2. `cutouts.get(cutoutKey)`:
   - **hit** → skip inference entirely; sprite = stored dataUrl. No model
     touch, no canvas passes (except outline, see below).
   - **miss** → `removeBackgroundClient(raw)` → `cleanSpriteMatte(...)` →
     store under `cutoutKey`.
   - **RMBG failure** → fall back to the plugin's removal (unchanged) — the
     fallback result is used for the current session **but NOT cached**
     (owner decision, 2026-08-16): every boot re-attempts RMBG, so a
     transient model failure recovers on its own; a persistent block simply
     falls back again (slow boot, correct output).
3. Outline: **derived, not cached** — `buildOutlineDataUrl(cleaned)` is a
   cheap canvas pass (~tens of ms at 512×768) run after the cut-out resolves
   (from cache or fresh).

**Result:** a warm reload with cached cut-outs runs **no inference and never
touches the model** — the ~79 s reload should collapse to seconds (asset
serving + texture load + outline derivation).

**DB growth note:** cut-outs are PNGs (~0.5 MB each) alongside the raw assets.
No eviction this round; `clear()` wipes both tables (dev tooling). Re-rolls
add rows under new keys (existing behavior).

---

## 4. D2 — Async, non-blocking removal (proxy worker)

**Change:** in `src/services/bg-removal.ts` set
`env.backends.onnx.wasm.proxy = true` (keep `numThreads = 1`, currently
`proxy = false`).

**Research (conclusive, 2026-08-16):**

- ONNX Runtime Web docs (`env-flags-and-session-options`): *"When the proxy
  worker is enabled, ONNX Runtime Web will offload the heavy computation to a
  separate Web Worker… the computation will not block the main thread."*
- `numThreads = 1` **forces multi-threading off** — no SharedArrayBuffer, no
  cross-origin isolation required. This matters: the app runs inside the
  `perchance.org` generator iframe, where we **cannot** set COOP/COEP headers
  (not our origin), so cross-origin isolation is permanently unavailable and
  threaded WASM is off the table.
- Proxy-worker caveats from the docs: incompatible with the WebGPU EP (we run
  WASM — fine); **created via Blob, so a CSP-restricted environment may block
  it**. Perchance's iframe CSP is the *only* unknown.

**Smoke-test gate (owner direction):** only if the CSP question cannot be
resolved by research do we run a minimal smoke test on the platform (does the
proxy worker start?). Research otherwise answers the question; do not test
blind. **Resolution (2026-08-16):** research is conclusive enough — Perchance
only ships an *opt-in* restriction feature (`?$csp`), implying the default has
no strict CSP (generators run arbitrary JS and external CDNs), and the ORT
proxy worker needs no cross-origin isolation. No separate smoke test:
`bg-removal.ts` logs `[rpg] bg-removal: proxy worker active` and the round-6
test prompt asks the Perchance agent to confirm that log + that the UI stays
responsive during inference.

**Stays the same:** the wait-queue semantics (a sprite generated before the
model is ready awaits the singleton promise), `numThreads = 1`,
`proxy` fallback robustness profile, lazy chunk. Image decode/encode + canvas
passes remain on the main thread but are cheap next to the ~30–40 s inference.

---

## 5. D3 — Observability (loading screen + corner chip + console)

**5.1 Animated loading screen at boot** — replaces the static
"Generating scene…" overlay (`src/main.tsx`). It is the boot UI (per owner:
*"criamos uma tela de loading animada que vá informando o que está
acontecendo nos bastidores"*). It must animate **smoothly** — which is only
possible because D2 frees the main thread. Live stage updates, event-driven
(no % progress — ONNX exposes no granular progress):

```
Generating scene assets…      (backdrop + floor + raw sprites)
Preparing background removal… (model load — only on cold visit)
Removing background (1/2)…    (per sprite, updates as each finishes)
Polishing sprites…            (matte + outline)
Loading scene…                (texture swap / final mount)
```

**5.2 Discreet corner chip with counter** — a small, unobtrusive indicator
(spinner + "Removing background 1/2…") shown whenever removal runs, including
during boot alongside the loading screen (boot: the loading screen carries the
message; the chip covers removal happening outside boot, e.g. future re-rolls
in-session). Auto-hides when the queue drains.

**5.3 Structured console logs** — every stage logged with timing under a
stable prefix so the Perchance agent (and dev) can see the model working:

```
[rpg] bg-removal: proxy worker active
[rpg] bg-removal: model loading…          [rpg] bg-removal: model ready (4.2s)
[rpg] bg-removal: removing player (38.1s) [rpg] bg-removal: removing elder (34.7s)
[rpg] cutout-cache: hit player (skip inference) [rpg] cutout-cache: miss elder → removing
[rpg] boot: scene assets done (12.4s)     [rpg] boot: polishing sprites…
```

This is the fix for "the agent got lost not knowing the inference was
working". Log sources: a Preact-signal progress store (`services/progress.ts`
— single source of truth for 5.1/5.2/5.3) written by the removal service
(`bg-removal.ts`), the cut-out cache and the loader, plus a console
subscriber that logs every transition.

---

## 6. D4 — Model preload

Unchanged: `preloadBackgroundRemoval()` stays fire-and-forget at boot (prod
only). The model is already browser-cached by transformers.js (Cache API
default) — round 5 measured *zero* model fetches on reload. The 165 s cold
download is a one-time cost; the cut-out cache removes the *re-inference*
cost, which is the real reload win. Preload remains so re-rolls never wait.

---

## 7. D5 — Dark blocks: grounding + white-background prompt

**Chosen lever (owner, round 9 — supersedes the round-7 pure-black lever):**
improve the *input*. The round-5 raw sprites did not deliver the requested
solid pure-black background, leaving near-black/dark-grey remnants for the
remover and matte to trip on — and the round-7 black background + code-drawn
shadow caused "levitation" whenever the generator placed the feet above the
image base. The sprite background sentence (`content/sprite.ts`
`SPRITE_WHITE_GROUNDED_BACKGROUND`) now demands:

- explicit "solid **pure white** background" with redundancy: uniform, one
  color (#FFFFFF), **zero gradient, zero vignette, zero props, zero rim
  light**, full-bleed to every edge;
- a **baked ground shadow**: "a soft, visible ground shadow cast directly
  beneath and around the feet — a soft dark ellipse under the body or a soft
  shadow cast to one side — so the character clearly touches the ground".
  After background removal the shadow survives with the sprite → the
  character reads grounded wherever the feet land;
- a negative prompt (`SPRITE_NEGATIVE_PROMPT`: gradient, vignette, props,
  …) — **"floor shadow" deliberately removed** (the baked shadow is now
  content); note: negative prompt is part of the cache key, so changing it
  busts sprites too (intended).

**Round-9 consequences:** the code-drawn shadow plane in the 3D stage is
removed (`render/three-stage.ts`) — grounding comes only from the baked
shadow; the matte's dark-spill pass is **disabled by default** (`sprite-matte.ts`
`spillLuma` 0) because dark pixels adjacent to transparency are now content
(the shadow, dark clothing), not black-background spill.

**Consequence:** the prompt change busts the sprite cache (prompt hash is in
the raw key) → sprites regenerate on the next round.

**Documented future levers (NOT this round):**

- Mask post-processing: convert RMBG's soft alpha to a hard edge (threshold)
  + 1–2 px erosion on the mask — attacks mottling at the source;
- Matte tuning: lower `fringeAlpha`/`spillLuma` and the 0.1 % component
  filter threshold (round 5: clusters of 40–106 px survived);
- If the strengthened prompt still under-delivers (the round-5 model ignored
  part of the instruction), escalate to the mask lever.

Acceptance for this round: visibly reduced dark mottling on the regenerated
sprites (verify with the two test images in `src/poc/` + the platform
round-6 run). Small residue is acceptable; pristine is not required yet.

---

## 8. D6 — Floor "box effect" (documented, no change)

Owner correction to the round-5 analysis: the dark band the agent reported is
**not** the floor↔backdrop junction — it is the backdrop's bottom edge, which
isn't even shown (the floor joins at a higher height than the backdrop base).
The real problem is the **box effect**: no natural transition between the
floor plane and the backdrop plane. Mitigation ideas, documented for later:

1. **Better junction fitting** — tune floor depth/scale so the transition
   feels natural. Fragile: each scene is AI-generated art, so a fit that
   works in one scene will not hold in another (this is the core objection —
   scene-specific heuristics don't generalize).
2. **Effects + assets as camouflage** — fog (volumetric/haze at the
   junction), plus more scene assets (props, foliage, objects) breaking the
   hard line. This is the most promising general mitigation.
3. **Scene-type restriction** — reserve this presentation for *closed* scenes
   (interiors), where the backdrop already reads as a wall and the junction is
   natural; open scenes get the treatment from (2) or a different
   presentation.

No code change this round; record in `vn-rpg-spec` (§3.8 junction / type C).

---

## 9. D7 — `[choices]` block: keep optional

Behavioral finding: the AI never emitted a `[choices]` block in 6/6 natural
turns (round 5); the grid UI was verified end-to-end only by injecting a
block via a transient `root.generateText` wrapper. The prompt makes choices
optional by design ("if convenient"). **Decision: keep optional**; the grid
path stays exercised by injection in local tests and is ready for when
choices are more strongly encouraged (future prompt work — no change now).

---

## 10. D8 — Plugin removal: lock the active-remover invariant

Confirmed in code (no change needed; documented as a hard requirement):

- **Prod sprites:** generated raw (`removeBackground: false`), removed only
  by RMBG client-side.
- **Plugin `removeBackground`** is used only for (a) the fallback path when
  client-side removal fails, and (b) dev mock parity.
- **Scene planes (backdrop/floor): never** — already enforced by default and
  by the round-3 forensics (76.8 % black pixels with it on, 0 % without).

The cut-out cache (D1) must not weaken this: fallback output is **never
cached** (owner decision), so plugin-removal pixels can never masquerade as
RMBG cut-outs and the invariant stays observable.

---

## 11. Acceptance criteria (round 6)

1. **Warm reload with cached cut-outs:** no inference, no model fetches, boot
   in seconds (target < 15 s, dominated by asset serving + texture load).
   Measure vs. the ~79 s baseline.
2. **Main thread free during removal:** the loading screen animates smoothly
   (no freeze) while sprites are processed; console shows the structured
   stage logs (§5.3) — the Perchance agent can now see the model working.
3. **Corner chip** shows during removal with the running counter and hides
   when the queue drains.
4. **Regenerated sprites** (prompt change bust) arrive on pure-white
   backgrounds with the ground shadow baked in; after removal the shadow
   survives and the character reads grounded (no code shadow); dark mottling
   visibly reduced on the two test images and on the platform run.
5. **Fallback path intact:** forced removal failure → plugin removal, warning
   logged, result used for the session but **not cached**; the next resolve
   re-attempts RMBG (fake-remover integration test asserts the retry).
6. **Tests green:** unit tests for `cutoutCacheKey` derivation + pipeline-
   version busting; integration test for the cached-cut-out path (mock
   remover); existing 99 tests keep passing; typecheck + lint + build.
7. **Browser validation (CDP):** warm reload timing, loading screen stages,
   corner chip, regenerated sprites quality, console logs. Chrome killed
   afterwards (AGENTS.md).
8. **Docs updated:** `vn-rpg-spec` §4.1 (cut-out cache + proxy worker +
   observability), §3.8 (box-effect mitigations, D6), sprite prompt; stack
   note in `AGENTS.md`; `test-prompt.txt` → round 6 (validates: warm reload
   speed, non-blocking boot, console logs visible to the agent, sprite    quality, proxy-worker log, fallback retry, box effect).

## 12. Touchpoints (for the implementation turn)

- `src/services/db.ts` — schema v2, `cutouts` table.
- `src/services/bg-removal.ts` — `proxy = true`; stage event emitter + logs.
- `src/services/cutout-cache.ts` (new) — key derivation + get/put + pipeline
  version constant.
- `src/scene/assets.ts` — cut-out cache in the prod path; fallback
  (uncached) on RMBG failure.
- `src/main.tsx` — animated loading screen wiring (stages from the emitter).
- `src/ui/` + `src/style.css` — corner chip component + loading screen.
- `src/scene/manifest/openPlains.ts` — strengthened black-background prompt.
- Tests: `tests/unit/cutout-cache.test.ts` (new), `tests/integration/`
  update for the cached path, existing suites stay green.

## 13. Open questions / future work

- If the strengthened prompt still under-delivers: mask post-processing
  (hard alpha + erosion) and tighter matte filters (§7) — revisit after the
  round-6 platform run.
- Box-effect mitigation (D6): fog + assets first; junction fitting only as a
  scene-local override, never a global heuristic.
- `[choices]` encouragement in the dialogue prompt (D7) — future prompt turn.
- DB eviction policy for `cutouts` growth — later (save-system milestone).
