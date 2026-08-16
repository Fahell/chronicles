# Round 9 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three round-8 findings before the round-9 Perchance test: (1) the ORT proxy worker that never loads (client-side RMBG permanently falls back), (2) the fog canvas that renders to a detached canvas (invisible fog), and (3) the sprite "levitation" (code shadow under a sprite whose feet may sit above the image base) via baked ground shadows on a white background.

**Architecture:** The ORT fix is empirical — first reproduce the exact `[wasm] [object Event]` failure in a local prod preview, then disable transformers.js v4's wasm-factory blob caching (`env.useWasmCache = false`), escalate to a CDN runtime import of transformers.js if needed, and only as a last resort drop the proxy worker. The fog fix appends the PixiJS canvas inside the scene container (the loader already passes the container to the effect registry — it just never reaches the factory). The grounding fix changes the sprite generation contract from "pure black background, no shadow" to "pure white background, baked ground shadow", removes the code-drawn shadow plane, and disables the matte's black-spill pass (which would otherwise eat the baked shadow's dark edge pixels).

**Tech Stack:** TypeScript (strict), Vite 8 / rolldown, Preact + `@preact/signals`, @huggingface/transformers 4.2.0 (lazy chunk) + onnxruntime-web 1.26.0-dev.20260416-b7804b056c (CDN via `wasmPaths`), pixi.js 8.19, three.js, Vitest, fake-indexeddb.

## Global Constraints

- **TypeScript strict** everywhere under `rpg/`; JSX only in `.tsx` files.
- **transformers.js stays a lazy chunk** — never imported statically; `env.backends.onnx.wasm.proxy = true` + `numThreads = 1` is the target state (owner: "UI livre até esgotar" — `proxy:false` is the last resort).
- **`ORT_WASM_PATHS` must pin the exact bundled ORT version** (`onnxruntime-web@1.26.0-dev.20260416-b7804b056c` in pnpm-lock) — bump together when the lockfile changes.
- **Only RMBG removes in prod** — the plugin's `removeBackground` stays only as the uncached fallback. Scene planes (backdrop/floor) never carry it.
- **Fallback cut-out is NEVER cached** (owner decision) — every boot re-attempts RMBG on a miss; the fallback *raw* row stays cached.
- **Prompt changes bust sprite cache keys** (prompt-hash is a key component) — sprites regenerate on first run after the grounding change. Intended.
- **Grounding contract (owner decision, this round):** character sprites are generated on a **pure white background with a baked ground shadow**; the code-drawn shadow plane is removed. Applies to NPCs AND the player (archetypes + identity sprite).
- **No app-level retry/timeout on plugin content** (`pending-decisions.md` §5); the Perchance text plugin handles its own generation failures (no forceable text-error hook — owner).
- **All artifacts in English**; Conventional Commits with scope `rpg`; commit `rpg/build/` when the bundle changes; **commit locally only — no push** (push + `ship-perchance.sh` happen at round-9 time).
- **Kill Chrome after browser validation:** `pkill -f "/opt/google/chrome/chrome"` AND `pkill -f "chrome-devtools-mcp"` (the MCP relaunches Chrome; both must die to stop CPU burn). `.agents/mcp.json` window-size 1280,800 must stay.

---

### Task 1: ORT worker — reproduce locally, then fix (bg-removal.ts + build)

**Files:**
- Modify: `rpg/src/services/bg-removal.ts`
- Test: `rpg/tests/unit/bg-removal.test.ts` (extend)
- Modify: `rpg/src/services/progress.ts` (only if the repro shows a new transition worth logging — likely not needed)

**Interfaces:**
- Consumes: `TransformersModule.env` (gains `useWasmCache?: boolean`).
- Produces: `export const ORT_USE_WASM_CACHE: boolean` (target `false`) applied inside `createRemover()`; public surface otherwise unchanged.

**Context (verified this round):** `@huggingface/transformers@4.2.0` is already the latest (the #1558 blob-factory fix of 05/mar IS in it) yet the round-8 Perchance run still failed with `[wasm] [object Event]` — so an upgrade alone cannot fix it. The bundled `transformers.web-*.js` chunk contains ORT's proxy-worker/wasm-factory blob paths (`rt = fetch → URL.createObjectURL`, `ct`/`ot` loaders); the CDN `ort-wasm-simd-threaded.asyncify.mjs` is self-contained (no relative imports), so any blob made from the CDN content would work — the failing blob contains OUR rolldown code, so the mechanism must be pinned empirically in our environment before choosing the fix. Candidate fixes in order: (a) `env.useWasmCache = false` (disables the factory blob-URL caching per #1558), (b) CDN runtime import of transformers.js (`/* @vite-ignore */` dynamic import of the jsdelivr ESM URL — ORT code then never passes through rolldown), (c) rolldown config to keep the worker chunk self-contained, (d) `proxy:false` (owner last resort).

- [ ] **Step 1: Reproduce locally.** Build a prod preview and drive the wizard sprite generation, capturing the exact error:

```bash
cd /home/rafaeltavares237/projects/rpg/rpg && VITE_RPG_MOCK=false pnpm build && pnpm preview --port 4175 &
```

Open `http://localhost:4175` in Chrome (CDP), go New Game → name → archetype (Knight), wait for the sprite. Record the console: does `[rpg] bg-removal: model ready (…ms)` / `inference done (…ms)` appear, or `[wasm] [object Event]` + the fallback warning? If the failure reproduces, extract the failing blob (hook `URL.createObjectURL` and `new Worker` via `evaluate_script` before generation; dump blob contents with `fetch(blobUrl).then(r=>r.text())`). Record what the blob's first lines import.

- [ ] **Step 2: Write the failing unit test** — extend `rpg/tests/unit/bg-removal.test.ts`:

```ts
import { ORT_USE_WASM_CACHE } from "../../src/services/bg-removal";

describe("ORT wasm factory caching", () => {
  it("disables the wasm factory blob-URL cache (round-9: blob worker with rolldown relative imports fails)", () => {
    // transformers.js v4 caches the .mjs factory as a blob URL; a blob cannot
    // resolve the relative chunk imports rolldown emits → the proxy worker
    // dies with [object Event] on the platform (round 8). Owner-approved fix.
    expect(ORT_USE_WASM_CACHE).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit bg-removal`
Expected: FAIL — `ORT_USE_WASM_CACHE` not exported.

- [ ] **Step 4: Implement.** In `rpg/src/services/bg-removal.ts`:

Add to the `TransformersModule` env interface:

```ts
interface TransformersModule {
  env: {
    /** v4: disables the wasm-factory blob-URL cache (round-9 ORT fix). */
    useWasmCache?: boolean;
    backends: {
      onnx: { wasm?: { numThreads?: number; proxy?: boolean; wasmPaths?: string } };
    };
  };
  // … unchanged …
}
```

Add near `ORT_WASM_PATHS`:

```ts
/**
 * transformers.js v4 caches the ORT wasm factory (.mjs) as a blob URL when
 * `useWasmCache` is on. A module blob cannot resolve the relative chunk
 * imports that the rolldown build emits into the bundled transformers chunk,
 * so the proxy worker dies at load with a bare `[object Event]` and client
 * removal permanently falls back (round-8 finding; the #1558 fix is already
 * in 4.2.0 and does NOT cover this). Disabling the wasm cache fetches the
 * factory straight from the CDN (ORT_WASM_PATHS) — no blob, no relative
 * imports. Cost: the ~23 MB wasm falls back to the HTTP cache instead of the
 * Cache API on fresh sessions (round-9 gate: warm reload still skips the
 * download).
 */
export const ORT_USE_WASM_CACHE = false;
```

Inside `createRemover()`, right after the dynamic import, before touching the onnx env:

```ts
  mod.env.useWasmCache = ORT_USE_WASM_CACHE;
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `cd rpg && pnpm test:unit -- --project unit bg-removal && pnpm typecheck && pnpm lint`
Expected: PASS; clean typecheck/lint.

- [ ] **Step 6: Build + re-run the local repro**

Run: `cd rpg && VITE_RPG_MOCK=false pnpm build && pnpm preview --port 4175 &`
Repeat Step 1. PASS gate: console shows `[rpg] bg-removal: model ready (…ms)` AND `inference done (…ms)` AND `cutout-cache: miss … → removing` then a hit on the second sprite / warm reload; the UI stays responsive during inference (rAF counter keeps ticking); the extraction hook finds NO blob containing `rolldown-runtime` / `rpg.js` imports.

- [ ] **Step 7: Escalate if the gate still fails.** If `[wasm] [object Event]` persists after fix (a), switch to fix (b): replace `await import("@huggingface/transformers")` with `await import(/* @vite-ignore */ TRANSFORMERS_CDN_URL)` where `TRANSFORMERS_CDN_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm"` (jsdelivr ESM build of the exact installed version; types still come from the installed package). Add a unit test pinning the constant to `@huggingface/transformers@4.2.0`. Verify jsdelivr serves it (curl 200) and re-run the Step 6 gate. If that also fails, investigate the exact failing blob locally (Step 1 hook) and decide between rolldown config (manualChunks/worker format) and `proxy:false` — **ask the owner before choosing** if the evidence does not clearly point one way.

- [ ] **Step 8: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/services/bg-removal.ts rpg/tests/unit/bg-removal.test.ts
git commit -m "fix(rpg): disable the transformers.js wasm-factory blob cache so the ORT proxy worker loads (round-9 blocker)"
```

---

### Task 2: Fog — append the canvas inside the scene container

**Files:**
- Modify: `rpg/src/effects/fog.ts`
- Modify: `rpg/src/effects/index.ts`
- Test: `rpg/tests/unit/fog-registry.test.ts` (extend)

**Interfaces:**
- Consumes: the `container: HTMLElement` that `createEffects(specs, container, viewport)` already receives.
- Produces: `createFogEffect(viewport, rawParams, container)` (new third param); `export function attachEffectCanvas(container: HTMLElement, canvas: HTMLCanvasElement): void` (append helper, unit-testable).

**Context:** Round-8 finding #12 — `createFogEffect` styles `app.canvas` (position/pointerEvents/left/top) but never appends it; pixi v8 `Application.init()` does not auto-append, so the fog renders to a detached canvas. `destroy()` already uses `removeView: true`, which removes the canvas from the DOM.

- [ ] **Step 1: Write the failing unit test** — extend `rpg/tests/unit/fog-registry.test.ts`:

```ts
import { attachEffectCanvas } from "../../src/effects/fog";

describe("attachEffectCanvas", () => {
  it("appends the canvas to the given container (round-9: fog was rendering off-DOM)", () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const canvas = {} as HTMLCanvasElement;
    attachEffectCanvas(container, canvas);
    expect(container.appendChild).toHaveBeenCalledWith(canvas);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit fog-registry`
Expected: FAIL — `attachEffectCanvas` not exported.

- [ ] **Step 3: Implement.** In `rpg/src/effects/fog.ts`, add the helper and use it:

```ts
/**
 * Appends an effect canvas to its container. Exported for unit tests — the
 * append is the exact round-9 fix (pixi v8 never auto-appends, so the fog
 * was rendering to a detached canvas). The three.js canvas is appended by
 * the stage; effects mount after it and thus paint above the 3D frame.
 */
export function attachEffectCanvas(container: HTMLElement, canvas: HTMLCanvasElement): void {
  container.appendChild(canvas);
}
```

Change the signature and the canvas setup:

```ts
export async function createFogEffect(
  viewport: { width: number; height: number },
  rawParams: Record<string, unknown>,
  container: HTMLElement,
): Promise<StageEffect> {
  // … app.init unchanged …
  const canvas = app.canvas;
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  attachEffectCanvas(container, canvas);
  // … unchanged …
}
```

In `rpg/src/effects/index.ts`, pass the container through (replace the underscore params):

```ts
export async function createEffects(
  specs: EffectSpec[],
  container: HTMLElement,
  viewport: { width: number; height: number },
): Promise<StageEffect[]> {
  const effects: StageEffect[] = [];
  for (const spec of specs) {
    if (spec.kind === "fog") {
      const { createFogEffect } = await import("./fog");
      effects.push(await createFogEffect(viewport, spec.params, container));
    }
  }
  return effects;
}
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `cd rpg && pnpm test:unit -- --project unit fog-registry && pnpm typecheck && pnpm lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/effects/fog.ts rpg/src/effects/index.ts rpg/tests/unit/fog-registry.test.ts
git commit -m "fix(rpg): append the fog canvas inside the scene container (round-8 invisible fog)"
```

---

### Task 3: Grounding — white background + baked ground shadow prompts

**Files:**
- Modify: `rpg/src/content/sprite.ts`
- Modify: `rpg/src/scene/manifest/openPlains.ts`
- Test: `rpg/tests/unit/scene-c.test.ts` (update), `rpg/tests/unit/content.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `SPRITE_WHITE_GROUNDED_BACKGROUND` (replaces `SPRITE_BLACK_BACKGROUND`), updated `SPRITE_NEGATIVE_PROMPT`. `characterSpritePrompt`, `openPlainsSpritePrefix`, `ARCHETYPES`, `NPC_POOL`, `userActor`, `npcActor` all flow from the shared constants — no other call sites change.

**Context (owner decision):** The levitation problem is that a generated sprite may have the feet above the image base while the code shadow sits below the image. Fix: generate on a pure WHITE background and ask the image to bake a soft ground shadow under/around the feet; after background removal the shadow stays with the sprite, so it reads grounded regardless of where the feet land. Prompt change busts cache keys (sprites regenerate — intended).

- [ ] **Step 1: Update the failing test** — `rpg/tests/unit/scene-c.test.ts`, replace the round-7 black test:

```ts
  it("sprites demand a pure-white background with a baked ground shadow (round 9)", () => {
    const parsed = parseSceneManifest(openPlainsManifest);
    for (const actor of parsed.actors) {
      if (!actor.sprite?.prompt) continue;
      expect(actor.sprite.prompt).toMatch(/pure solid white|#ffffff|#FFFFFF/i);
      expect(actor.sprite.prompt).toMatch(/shadow/i);
      expect(actor.sprite.negativePrompt).not.toMatch(/floor shadow/i);
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit scene-c`
Expected: FAIL — current prompts are pure black / forbid shadows.

- [ ] **Step 3: Rewrite the constants** in `rpg/src/content/sprite.ts`:

```ts
/**
 * Shared character-sprite generation constants (removal-pipeline-spec §7;
 * round-9 owner decision: white background + baked ground shadow).
 *
 * The sprite is generated on a SOLID PURE WHITE background with the
 * character's ground shadow baked into the image (cast to one side or
 * directly under the body). After background removal the shadow survives
 * with the sprite, so the character reads grounded in the scene no matter
 * where the generator placed the feet inside the frame — replacing the old
 * pure-black background + code-drawn shadow (which floated when the feet sat
 * above the image base). RMBG-1.4 segments any background; the explicit
 * white matters for the platform-fallback path.
 */

/** The D5 white-background + baked-shadow sentence appended to every sprite prompt. */
export const SPRITE_WHITE_GROUNDED_BACKGROUND =
  "The ENTIRE background behind the figure must be 100% pure solid white — every single pixel exactly #FFFFFF — flat and uniform across every corner and every edge, with zero gradient, zero vignette, zero grey, zero off-white, zero rim light, zero props and zero texture variation anywhere in the background. The figure stands firmly on the ground with a soft, visible ground shadow cast directly beneath and around the feet — a soft dark ellipse under the body or a soft shadow cast to one side — so the character clearly touches the ground. The figure must be fully contained inside the frame, standing centered, full body visible from head to feet, crisp clean silhouette edge. No text, no UI, no watermark, no noise.";

export const SPRITE_NEGATIVE_PROMPT =
  "gradient, vignette, background props, rim light, background texture, noise, text, watermark, black background, dark background, grey background, gray background, mottled background, dirty background, midtones in background";
```

(Note: `floor shadow` is deliberately REMOVED from the negative prompt — the baked shadow is now content.)

- [ ] **Step 4: Refactor `openPlains.ts` to use the shared constants** — delete the local `spriteBackground` and `spriteNegativePrompt`, import from `../content/sprite` (path: `../../content/sprite` from `scene/manifest/`), and reference them in `elderPrompt`/`playerPrompt`/the default manifest actors:

```ts
import { SPRITE_NEGATIVE_PROMPT, SPRITE_WHITE_GROUNDED_BACKGROUND } from "../../content/sprite";
```

Replace `${spriteBackground}` with `${SPRITE_WHITE_GROUNDED_BACKGROUND}` and `negativePrompt: spriteNegativePrompt` with `negativePrompt: SPRITE_NEGATIVE_PROMPT`.

- [ ] **Step 5: Extend `rpg/tests/unit/content.test.ts`** — assert the archetype/NPC prompts carry the new contract:

```ts
  it("archetype and NPC sprite prompts demand the white background + baked shadow (round 9)", () => {
    for (const a of ARCHETYPES) {
      expect(a.spritePrompt).toMatch(/pure solid white|#ffffff|#FFFFFF/i);
      expect(a.spritePrompt).toMatch(/shadow/i);
    }
    for (const n of NPC_POOL) {
      expect(n.spritePrompt).toMatch(/pure solid white|#ffffff|#FFFFFF/i);
      expect(n.spritePrompt).toMatch(/shadow/i);
    }
  });
```

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `cd rpg && pnpm test:unit -- --project unit scene-c --project unit content && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/content/sprite.ts rpg/src/scene/manifest/openPlains.ts rpg/tests/unit/scene-c.test.ts rpg/tests/unit/content.test.ts
git commit -m "feat(rpg): generate character sprites on pure white with a baked ground shadow (round-9 grounding)"
```

---

### Task 4: Matte — disable the black-spill pass (white-background era)

**Files:**
- Modify: `rpg/src/scene/sprite-matte.ts`
- Test: `rpg/tests/unit/sprite-matte.test.ts` (update)

**Interfaces:**
- Consumes: nothing new.
- Produces: `applyMatteCleanup(data, width, height, options)` — `spillLuma` default changes `24 → 0` (pass disabled by default); the option stays for explicit use.

**Context:** The black-spill pass removes dark pixels adjacent to transparency — the right cleanup when the background was pure black. With the white background + baked shadow (Task 3), that same pass would eat the shadow's dark edge pixels AND legitimate dark clothing edges (both are dark content adjacent to transparency). White fringe needs no dark-spill pass (it is handled by the fringe trim + alphaTest).

- [ ] **Step 1: Update the tests** — read `rpg/tests/unit/sprite-matte.test.ts` first; any test asserting spill removal must pass `{ spillLuma: 24 }` explicitly (documenting the option still works), and add:

```ts
  it("keeps dark pixels adjacent to transparency by default (baked ground shadow survives, round 9)", () => {
    // A shadow pixel (dark, opaque) touching a transparent pixel must survive
    // the default cleanup — the black-spill pass is disabled for the
    // white-background era.
    const data = new Uint8ClampedArray([10, 10, 10, 255, 0, 0, 0, 0]);
    const out = applyMatteCleanup(data, 2, 1);
    expect(out[3]).toBe(255); // shadow pixel kept
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit sprite-matte`
Expected: FAIL — the shadow pixel is currently removed by the spill pass.

- [ ] **Step 3: Implement** in `rpg/src/scene/sprite-matte.ts` — change the default and the pass-2 comment:

```ts
  /**
   * Brightness (0..255, max of r/g/b) at or under which an edge-adjacent
   * pixel is treated as black-background spill. Default 0 (disabled) since
   * round 9: sprites now generate on WHITE with a baked ground shadow, so
   * dark pixels adjacent to transparency are legit content (shadow, dark
   * clothing) — the black-spill pass would eat them. Kept as an option for
   * any future dark-background asset.
   */
  spillLuma?: number;
```

And in the destructure: `const { fringeAlpha = 0.35, spillLuma = 0, minComponentRatio = 0.001 } = options;` plus guard the pass (skip when `spillLuma <= 0`):

```ts
  // Pass 2 — edge black-spill (DISABLED by default since round 9: white
  // background + baked shadow; see MatteOptions.spillLuma). When enabled,
  // decisions are made against a snapshot of the pass-1 result …
  if (spillLuma > 0) {
    // … existing pass-2 body unchanged …
  }
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `cd rpg && pnpm test:unit -- --project unit sprite-matte && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/sprite-matte.ts rpg/tests/unit/sprite-matte.test.ts
git commit -m "fix(rpg): disable the matte black-spill pass so baked ground shadows survive removal (round 9)"
```

---

### Task 5: Remove the code-drawn ground shadow (three-stage.ts)

**Files:**
- Modify: `rpg/src/render/three-stage.ts`

**Interfaces:**
- Consumes: `ActorPlacement` (unchanged).
- Produces: `actorMeshes` map becomes `Map<string, { sprite: Mesh; outline: Mesh | null }>` (no `shadow`).

**Context:** The code shadow (`CircleGeometry` mesh at y=0.03) is what makes characters look like they float when the baked shadow is absent from the image base. The baked shadow (Task 3) replaces it entirely.

- [ ] **Step 1: Edit `rpg/src/render/three-stage.ts`** — remove the shadow mesh:
  - Change the map type: `const actorMeshes = new Map<string, { sprite: Mesh; outline: Mesh | null }>();`
  - In `setActors`: drop `scene.remove(actor.sprite, actor.shadow)` → `scene.remove(actor.sprite)`; delete the `shadow` mesh creation block (the round-7 comment block); `scene.add(sprite, shadow)` → `scene.add(sprite)`; `actorMeshes.set(actor.characterId, { sprite, shadow, outline })` → `{ sprite, outline }`.
  - In `tick()`: the billboard loop destructures `{ sprite, outline }` already — unchanged.

- [ ] **Step 2: Typecheck + lint**

Run: `cd rpg && pnpm typecheck && pnpm lint`
Expected: clean. (No three.js-in-node unit test — validated via browser screenshot in Task 7.)

- [ ] **Step 3: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/render/three-stage.ts
git commit -m "feat(rpg): remove the code-drawn ground shadow — grounding now comes from the baked sprite shadow (round 9)"
```

---

### Task 6: Docs — vn-rpg-spec, removal-pipeline-spec, AGENTS.md

**Files:**
- Modify: `vn-rpg-spec.md` (§4.1 + §7 references)
- Modify: `removal-pipeline-spec.md` (§7)
- Modify: `AGENTS.md`

**Interfaces:** none (documentation). Content must match the round-9 decisions exactly.

- [ ] **Step 1: Update `vn-rpg-spec.md` §4.1** — record: (1) the ORT proxy-worker fix — transformers.js `useWasmCache=false` (or the CDN-import escalation actually applied) so the factory loads from the CDN URL instead of a blob with rolldown relative imports; (2) the grounding contract — pure white background + baked ground shadow, code shadow removed; (3) the matte change — black-spill pass disabled by default; (4) the fog canvas append (container-mounted overlay). Replace the round-7 "pure solid black" wording everywhere it appears.
- [ ] **Step 2: Update `removal-pipeline-spec.md` §7** — same decisions: white background replaces the pure-black prompt lever; the matte spill pass default is off (baked shadow must survive); note the round-9 open question: outline ring around the baked shadow (dilated silhouette now includes the shadow — verify visually in round 9).
- [ ] **Step 3: Update `AGENTS.md`** — stack line: note the ORT worker fix (`useWasmCache=false` — no blob factory; proxy worker + numThreads=1 kept); grounding (white bg + baked shadow, no code shadow); fog canvas is container-appended.
- [ ] **Step 4: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add vn-rpg-spec.md removal-pipeline-spec.md AGENTS.md
git commit -m "docs(rpg): record the round-9 decisions (ORT worker fix, white-bg baked-shadow grounding, matte spill off, fog append)"
```

---

### Task 7: Round-9 test prompt

**Files:**
- Rewrite: `test-prompt.txt`

**Interfaces:** none (the Perchance agent handoff). Keep the round-7/8 structure; "Changes since round 8": ORT proxy worker fixed (client-side RMBG now runs), fog canvas now in the DOM, sprites now generate on white with baked ground shadows (no code shadow), matte keeps the baked shadow. Add the WebGPU probe (`navigator.gpu` availability — report-only, owner).

- [ ] **Step 1: Rewrite `test-prompt.txt`** — sections:
  1. **Boot (prod):** `[rpg] bg-removal: proxy worker active`; the "Downloading AI model (first visit)…" stage with a rising percentage IS now visible on first visit; `[rpg] bg-removal: model ready (…ms)` + `inference done (…ms)` must appear; NO `no available backend found` / `[wasm] [object Event]`.
  2. **Sprite quality (the round-7 deliverable, now real):** raw sprites on pure white; cut-outs clean (no mottle, no dark halo, crisp silhouette); the **baked ground shadow survives** under both characters (soft ellipse/one-direction, reads grounded); the black outline ring is clean — flag if the ring visibly wraps the baked shadow in an ugly way (report-only); NO code shadow under the feet (removed).
  3. **Warm reload / cutout cache:** reload fast; `cutout-cache: hit … (skip inference)` for both sprites; model NOT re-downloaded (browser-cached).
  4. **Fog:** a transparent canvas sits over the scene frame; the fog drifts (two screenshots seconds apart differ slightly); nothing blocks clicks (pointer-events none).
  5. **Re-roll:** still works; new seed → new sprite → new cutout (cache miss → inference → hit next time).
  6. **Regression (quick):** wizard → save → load → narrator opening → multi-turn dialogue (choices as buttons, always-escape) → language setting (Spanish reply) — spot-check only, these passed round 8.
  7. **WebGPU probe (report-only):** `typeof navigator.gpu !== "undefined"` inside the iframe — yes/no, no action.
  8. **Screenshot:** final scene (chronicles-scene.png) for the visual report.
  9. **Report:** structured list of the above with PASS/FAIL + the single most important issue.

- [ ] **Step 2: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add test-prompt.txt
git commit -m "docs(rpg): write the round-9 test prompt (RMBG gates, fog, baked shadow, WebGPU probe, regression)"
```

---

### Task 8: Full validation + browser CDP + final commit

**Files:** none (validation).

**Interfaces:** validates Tasks 1–7 end-to-end.

- [ ] **Step 1: Full local suite + build**

Run: `cd rpg && pnpm typecheck && pnpm lint && pnpm test:all && pnpm build && pnpm test:e2e`
Expected: all green. Confirm `build/chunks/` still contains the three.js + transformers + pixi chunks.

- [ ] **Step 2: Browser validation via CDP** (prod preview on port 4175, `VITE_RPG_MOCK=false` build):
  1. Open the app; confirm boot console has NO `[wasm] [object Event]`; the model-download stage appears on first visit (percentage), then `model ready` + `inference done`.
  2. Wizard → archetype → sprite generated: the sprite preview shows the cut-out with the baked shadow (screenshot the preview).
  3. Create the save; scene mounts: the **fog canvas is in the DOM** (MutationObserver/evaluate: `document.querySelectorAll('canvas')` — the fog canvas present and sized to the scene frame, above the three.js canvas); fog drifts (two screenshots differ).
  4. Scene screenshot: both characters grounded via baked shadows, NO code shadow ellipse under the feet.
  5. Re-roll the sprite once: cache miss → inference → new cutout; button not sticky.
  6. Warm reload (reload the page, load the save): `cutout-cache: hit` ×2; model not re-downloaded; fast.
  7. Check the console: only benign warnings (transformers model-class + favicon if present); no unhandled rejections.
  8. **Kill Chrome + MCP:** `pkill -f "/opt/google/chrome/chrome"`; `pkill -f "chrome-devtools-mcp"`; confirm zero Chrome processes and normal CPU.

- [ ] **Step 3: Commit the regenerated build**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/build && git commit -m "build(rpg): regenerate the round-9 bundle (ORT worker fix, fog append, baked-shadow grounding)"
```

- [ ] **Step 4: Self-review against the round-9 decisions** — walk the list: ORT worker loads with inference running locally ✓ / fog canvas in DOM ✓ / white-bg + baked shadow prompts (NPCs + player) ✓ / code shadow removed ✓ / matte keeps the baked shadow ✓ / no forceable text-error hook (owner) ✓ / no WebGPU implementation (probe only) ✓ / commit without push ✓. Fix any gap found.

- [ ] **Step 5: Summary for the owner** — list what shipped, the validation results, and that **nothing was pushed** (push + `ship-perchance.sh --push` happen at round-9 time per AGENTS.md).
