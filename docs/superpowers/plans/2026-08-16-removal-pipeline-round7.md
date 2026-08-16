# Removal Pipeline Round 7 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the round-6 root cause (the ORT WASM never shipped — the transformers chunk resolves it as a local Vite asset that the ship script deletes), by pinning ORT to the jsdelivr CDN via `wasmPaths`; add the model-download stage to the loading screen; catch the preload rejection; make `preserveDrawingBuffer` permanent; strengthen the ground-contact shadow; matte the plugin-removal fallback; strengthen the pure-black sprite prompts; move the removal chip to the top level; and prepare the round-7 Perchance test prompt.

**Architecture:** `bg-removal.ts` sets `env.backends.onnx.wasm.wasmPaths` to the exact `onnxruntime-web@1.26.0-dev.20260416-b7804b056c` dist URL on jsdelivr (verified 200 for `ort-wasm-simd-threaded.asyncify.wasm` + `.mjs` on 2026-08-16) — ORT then fetches its glue + WASM from the CDN instead of the missing local `assets/` copy, so the ship stays lean. A new `modelDownload` signal in the progress store (status `idle | downloading | ready` + `pct`/`file`) is fed by the transformers.js `progress_callback` on both `from_pretrained` calls; the LoadingScreen shows "Downloading AI model (first visit)…" with a percentage while downloading and falls back to the boot stage otherwise. The preload rejection is caught and logged (keeping the 3 attempts per boot). `three-stage.ts` enables `preserveDrawingBuffer` (platform screenshots work without a preamble patch) and enlarges the ground shadow (radius 0.42→0.52, opacity 0.28→0.34 — scale unchanged, layout round deferred). The plugin-removal fallback in `assets.ts` now passes through `cleanSpriteMatte`. The sprite prompts strengthen the pure-black demand + negativePrompt (cache-busting by key — intended). `<RemovalChip/>` moves out of `<App>` into its own top-level mount so it is live during boot removal and ready for future in-game re-rolls. Docs + `test-prompt.txt` get the round-7 handoff.

**Tech Stack:** TypeScript (strict), Vite, Preact + `@preact/signals`, @huggingface/transformers v4 (lazy chunk), onnxruntime-web 1.26.0-dev.20260416-b7804b056c (transitive, pinned by pnpm-lock), three.js, Biome, Vitest, fake-indexeddb.

## Global Constraints

- **TypeScript strict** everywhere under `rpg/`; JSX only in `.tsx` files.
- **transformers.js stays a lazy chunk** — never imported statically; `env.backends.onnx.wasm.proxy = true` + `numThreads = 1` (no SharedArrayBuffer / cross-origin isolation — impossible inside the `perchance.org` iframe).
- **`wasmPaths` must pin the exact bundled ORT version** — `ORT_WASM_PATHS` (bg-removal.ts) MUST equal the `onnxruntime-web` version in `rpg/pnpm-lock.yaml` (`1.26.0-dev.20260416-b7804b056c` today); bump the constant when the lockfile version changes (transformers.js upgrade). Ship stays lean: the Vite-emitted local wasm stays gitignored and excluded from the ship (dead weight — ORT uses the CDN URL).
- **Only RMBG removes in prod** — the plugin's `removeBackground` remains only (a) as the uncached fallback when client removal fails (now matte-cleaned), and (b) dev mock parity. Scene planes (backdrop/floor) never carry it.
- **Fallback cut-out is NEVER cached** (owner decision, removal-pipeline-spec §3) — every boot re-attempts RMBG on a miss. The fallback *raw* (`|rb` asset row) stays cached (owner decision — accepted).
- **Sprite scale is NOT touched this round** (owner decision: dedicated layout round with comparative screenshots) — only the ground shadow changes.
- **Cache busting by key** — prompt/negativePrompt changes bust the raw sprite key, which busts the cut-out key (sprites regenerate — intended).
- **Signals are the single source of truth** for boot progress / removal queue / model download — UI and console subscriber read the same store.
- **No app-level retry/timeout on plugin content** (`pending-decisions.md` §5).
- **All artifacts in English**; Conventional Commits with scope `rpg`; commit `rpg/build/` when the bundle changes; **commit locally only — no push** (push happens at round time).
- **Kill Chrome after browser validation:** `pkill -f "/opt/google/chrome/chrome"` (match the binary path only, never `chrome-profile`).

---

### Task 1: Progress store — `modelDownload` signal + console transitions

**Files:**
- Modify: `rpg/src/services/progress.ts`
- Test: `rpg/tests/unit/progress.test.ts` (extend)

**Interfaces:**
- Consumes: existing `signal`/`effect` from `@preact/signals`.
- Produces:
  - `type ModelDownloadStatus = "idle" | "downloading" | "ready"`.
  - `interface ModelDownload { status: ModelDownloadStatus; pct?: number; file?: string }`.
  - `export const modelDownload: Signal<ModelDownload>` (initial `{ status: "idle" }`).
  - `export function setModelDownload(d: ModelDownload): void`.
  - `installProgressLogger()` also logs `[rpg] bg-removal: model downloading (first visit ~45 MB)` on `idle→downloading` and `[rpg] bg-removal: model download complete` on `downloading→ready` (transition-only — per-progress events would spam the console; the percentage goes to the UI).
  - `window.__rpgProgress` (dev) also exposes `modelDownload` + `setModelDownload`.

- [ ] **Step 1: Extend the failing unit test** — append to `rpg/tests/unit/progress.test.ts`:

```ts
import {
  bootProgress,
  installProgressLogger,
  modelDownload,
  removalQueue,
  setBootStage,
  setModelDownload,
  setRemovalQueue,
} from "../../src/services/progress";

describe("model download signal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    modelDownload.value = { status: "idle" };
  });

  it("starts idle", () => {
    expect(modelDownload.value).toEqual({ status: "idle" });
  });

  it("setModelDownload replaces the snapshot (status + pct + file)", () => {
    setModelDownload({ status: "downloading", pct: 42, file: "model_q8.onnx" });
    expect(modelDownload.value).toEqual({
      status: "downloading",
      pct: 42,
      file: "model_q8.onnx",
    });
  });

  it("logs transition-only [rpg] lines (no per-progress spam)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    installProgressLogger();

    setModelDownload({ status: "downloading", pct: 10 });
    setModelDownload({ status: "downloading", pct: 60 });
    setModelDownload({ status: "downloading", pct: 99 });
    setModelDownload({ status: "ready" });

    const lines = spy.mock.calls.map((c) => c[0]);
    expect(lines.filter((l) => String(l).includes("model downloading"))).toHaveLength(1);
    expect(lines.filter((l) => String(l).includes("model download complete"))).toHaveLength(1);
    expect(lines.filter((l) => String(l).includes("42%"))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit progress`
Expected: FAIL — `modelDownload` / `setModelDownload` not exported.

- [ ] **Step 3: Implement in `rpg/src/services/progress.ts`** — add after `removalQueue`:

```ts
export type ModelDownloadStatus = "idle" | "downloading" | "ready";

export interface ModelDownload {
  status: ModelDownloadStatus;
  /** 0..100 download progress (transformers.js progress_callback). */
  pct?: number;
  /** The file currently downloading (e.g. "model_q8.onnx"). */
  file?: string;
}

/**
 * Model download progress (removal-pipeline-spec §5.3). Fed by the
 * transformers.js `progress_callback`; the LoadingScreen shows a
 * "Downloading AI model…" stage while this is `downloading`.
 */
export const modelDownload = signal<ModelDownload>({ status: "idle" });

export function setModelDownload(d: ModelDownload): void {
  modelDownload.value = d;
}
```

And in `installProgressLogger()`, after the removal-queue effect:

```ts
  // Transition-only model download log — progress events are frequent; the
  // percentage lives in the UI, not the console (would spam the Perchance log).
  let lastDownloadStatus: ModelDownloadStatus = "idle";
  effect(() => {
    const { status } = modelDownload.value;
    if (status === lastDownloadStatus) return;
    if (status === "downloading" && lastDownloadStatus === "idle") {
      console.log("[rpg] bg-removal: model downloading (first visit ~45 MB)");
    } else if (status === "ready" && lastDownloadStatus === "downloading") {
      console.log("[rpg] bg-removal: model download complete");
    }
    lastDownloadStatus = status;
  });
```

And in the dev debug handle, add `modelDownload, setModelDownload` to the exposed object.

> Note: the logger keeps a module-level `lastDownloadStatus` — the `afterEach` in the test resets `modelDownload.value` but not the local; to keep tests independent, reset it by dispatching `setModelDownload({ status: "idle" })` at the start of the logging test (or accept the module-state coupling across tests — the values asserted are transition counts, which hold). If the count assertion is flaky, run the logging test in its own `describe` with a fresh spy and `setModelDownload({ status: "idle" })` first.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rpg && pnpm test:unit -- --project unit progress`
Expected: PASS (existing 4 + new 3).

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/services/progress.ts rpg/tests/unit/progress.test.ts
git commit -m "feat(rpg): add the model-download signal to the progress store (loading stage + transition logs)"
```

---

### Task 2: bg-removal.ts — CDN `wasmPaths` pin + preload catch + `progress_callback`

**Files:**
- Modify: `rpg/src/services/bg-removal.ts`
- Test: `rpg/tests/unit/bg-removal.test.ts` (new — constant contract only)

**Interfaces:**
- Consumes: `setModelDownload` (Task 1).
- Produces:
  - `export const ORT_WASM_PATHS: string` — the exact jsdelivr dist URL for the bundled onnxruntime-web (MUST match pnpm-lock; see constraint).
  - Public surface otherwise unchanged (`preloadBackgroundRemoval`, `backgroundRemovalReady`, `removeBackgroundClient`, `BackgroundRemover`).
  - The `TransformersModule` env type gains `wasmPaths?: string` on the wasm config.

- [ ] **Step 1: Write the failing unit test** — `rpg/tests/unit/bg-removal.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ORT_WASM_PATHS } from "../../src/services/bg-removal";

describe("ORT_WASM_PATHS (CDN wasm pin)", () => {
  it("points at the jsdelivr dist folder for the bundled onnxruntime-web", () => {
    expect(ORT_WASM_PATHS).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^/]+\/dist\/$/,
    );
    // Must match the lockfile — bump together with transformers.js upgrades.
    expect(ORT_WASM_PATHS).toContain("onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit bg-removal`
Expected: FAIL — module/export missing.

- [ ] **Step 3: Implement in `rpg/src/services/bg-removal.ts`**

Add the constant near the top (after the `TransformersModule` interface):

```ts
/**
 * Where ORT fetches its WASM engine (removal-pipeline-spec §4.2). The
 * transformers.js chunk bundles a local copy (a Vite asset), but that copy is
 * excluded from the Perchance ship — ORT is pinned to the jsdelivr CDN via
 * `wasmPaths` so the upload stays lean (round-6 root cause: the local
 * `assets/ort-wasm-simd-threaded.asyncify-*.wasm` 404'd on the platform).
 *
 * MUST match the `onnxruntime-web` version in pnpm-lock.yaml — bump this
 * constant when transformers.js is upgraded (verified 200 for
 * ort-wasm-simd-threaded.asyncify.{wasm,mjs} on 2026-08-16).
 */
export const ORT_WASM_PATHS =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/";
```

Extend the env type so `wasmPaths` typechecks:

```ts
interface TransformersModule {
  env: {
    backends: {
      onnx: {
        wasm?: { numThreads?: number; proxy?: boolean; wasmPaths?: string };
      };
    };
  };
  // … unchanged …
}
```

Replace the env-config block (keeps the proxy + adds wasmPaths):

```ts
  const onnxEnv = mod.env.backends.onnx;
  if (onnxEnv?.wasm) {
    onnxEnv.wasm.numThreads = 1;
    onnxEnv.wasm.proxy = true;
    onnxEnv.wasm.wasmPaths = ORT_WASM_PATHS;
    console.log(
      "[rpg] bg-removal: proxy worker active (wasm proxy=true, numThreads=1, wasmPaths=CDN)",
    );
  }
```

Add the download progress callback (before the `from_pretrained` calls) and pass it to BOTH calls:

```ts
  // Model download progress → progress store (removal-pipeline-spec §5.3).
  // transformers.js fires initiate/download/progress/done; cached loads jump
  // straight to done/ready. Progress events update the percentage for the
  // LoadingScreen; the console logs only transitions (Task 1).
  const onModelProgress = (info: {
    status?: string;
    file?: string;
    progress?: number;
  }): void => {
    if (info.status === "initiate" || info.status === "download") {
      setModelDownload({ status: "downloading", file: info.file });
    } else if (info.status === "progress" && typeof info.progress === "number") {
      setModelDownload({ status: "downloading", pct: Math.round(info.progress), file: info.file });
    } else if (info.status === "done") {
      setModelDownload({ status: "ready" });
    }
  };
```

Pass `progress_callback: onModelProgress` in the options object of BOTH `from_pretrained` calls (model + processor — the processor call reuses the browser cache, so its events are near-instant). After the processor resolves, force `setModelDownload({ status: "ready" })` (guarantees the stage clears even if the callback never fired).

Fix the preload to catch (keeping the 3 attempts per boot — the internal `getRemover` reset stays):

```ts
/** Kicks off the model load (fire-and-forget). Called at boot in prod. */
export function preloadBackgroundRemoval(): void {
  void getRemover().catch((error) => {
    console.warn(
      "[rpg] bg-removal: model preload failed — the platform fallback will handle removal",
      error,
    );
  });
}
```

- [ ] **Step 4: Add the `setModelDownload` import**

```ts
import { setModelDownload } from "./progress";
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `cd rpg && pnpm test:unit -- --project unit bg-removal && pnpm typecheck && pnpm lint`
Expected: PASS (1 test); clean typecheck/lint.

- [ ] **Step 6: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/services/bg-removal.ts rpg/tests/unit/bg-removal.test.ts
git commit -m "fix(rpg): pin ORT wasm to the jsdelivr CDN (wasmPaths), catch the preload rejection, feed model-download progress"
```

---

### Task 3: LoadingScreen — model download stage

**Files:**
- Modify: `rpg/src/ui/LoadingScreen.tsx`

**Interfaces:**
- Consumes: `modelDownload` (Task 1), existing `bootProgress` + `removalQueue`.
- Produces: unchanged `<LoadingScreen />` props (none). While `modelDownload.status === "downloading"`, the label reads "Downloading AI model (first visit)…" and the detail shows the percentage (+ file); otherwise the existing boot label/detail logic applies.

- [ ] **Step 1: Rewrite `rpg/src/ui/LoadingScreen.tsx`**

```tsx
import { bootProgress, modelDownload, removalQueue } from "../services/progress";

/** Boot loading screen (removal-pipeline-spec §5.1/§5.3): animated, live stages. */
export function LoadingScreen() {
  const progress = bootProgress.value;
  const queue = removalQueue.value;
  const download = modelDownload.value;

  const downloading = download.status === "downloading";
  const label = downloading ? "Downloading AI model (first visit)…" : progress.label;
  const detail = downloading
    ? typeof download.pct === "number"
      ? `${download.pct}% · ${download.file ?? "RMBG-1.4"}`
      : "first visit downloads ~45 MB"
    : queue.total > 0 && queue.done < queue.total
      ? `Removing background ${queue.done + 1}/${queue.total}…`
      : undefined;

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-label">{label}</p>
      {detail && <p className="loading-detail">{detail}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd rpg && pnpm typecheck && pnpm lint`
Expected: clean. (No DOM/component test infra in this repo — the stage is validated via CDP in Task 11.)

- [ ] **Step 3: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/ui/LoadingScreen.tsx
git commit -m "feat(rpg): show the model download stage (with percentage) on the boot loading screen"
```

---

### Task 4: three-stage.ts — permanent `preserveDrawingBuffer`

**Files:**
- Modify: `rpg/src/render/three-stage.ts`

**Interfaces:** none (renderer option).

- [ ] **Step 1: Edit the renderer creation**

```ts
  // preserveDrawingBuffer: the platform's screenshot/listing reads the canvas
  // after present — without it the WebGL buffer is cleared post-frame and the
  // capture is blank (Perchance round 5/6: the agent had to patch via
  // preambleJs). Permanent in code so no agent-side patch is needed; the cost
  // is a small per-frame buffer-retention overhead (owner decision).
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    preserveDrawingBuffer: true,
  });
```

- [ ] **Step 2: Typecheck + lint + build (bundle check)**

Run: `cd rpg && pnpm typecheck && pnpm lint && pnpm build`
Expected: clean; `build/rpg.js` regenerated (commit with the validation task).

- [ ] **Step 3: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/render/three-stage.ts
git commit -m "fix(rpg): keep the WebGL drawing buffer after present so platform screenshots work without a preamble patch"
```

---

### Task 5: three-stage.ts — stronger ground-contact shadow

**Files:**
- Modify: `rpg/src/render/three-stage.ts`

**Interfaces:** none (visual constants). Sprite scale is NOT changed this round (owner decision — layout round deferred).

- [ ] **Step 1: Edit the shadow mesh**

```ts
        // Ground-contact shadow (round-6 finding: characters float — the
        // shadow was too small/subtle at 0.42/0.28). Enlarged + darkened; the
        // sprite scale itself is unchanged (dedicated layout round later).
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.52 * actor.scale, 24),
          new THREE.MeshBasicMaterial({ color: 0x071321, transparent: true, opacity: 0.34 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(actor.position.x, 0.03, actor.position.z);
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd rpg && pnpm typecheck && pnpm lint`
Expected: clean. (No three.js-in-node unit test — validated via browser screenshot in Task 11.)

- [ ] **Step 3: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/render/three-stage.ts
git commit -m "feat(rpg): enlarge and darken the ground-contact shadow under sprites"
```

---

### Task 6: assets.ts — matte the plugin-removal fallback

**Files:**
- Modify: `rpg/src/scene/assets.ts`

**Interfaces:** none (internal pipeline). The fallback cut-out remains **never cached**; its *raw* `|rb` row stays cached (owner decisions).

- [ ] **Step 1: Edit the fallback branch**

```ts
          } catch (error) {
            console.warn(
              "bg-removal: client-side removal failed — falling back to the platform removal",
              error,
            );
            // Fallback is used in-session but NEVER cached (owner decision);
            // still matte-clean the platform cut-out so a fallback boot does
            // not render mottled sprites (round-6 finding: fallback skipped
            // cleanSpriteMatte entirely → grey fuzz + black fringe).
            const fallback = await generate(true);
            spriteUrl = await cleanSpriteMatte(fallback.dataUrl);
          }
```

- [ ] **Step 2: Run the integration suite**

Run: `cd rpg && pnpm test:integration -- --project integration scene-assets`
Expected: PASS — unchanged. (`cleanSpriteMatte` is a node no-op, so the fallback test's assertions hold; the visual improvement is verified in the browser / round 7.)

- [ ] **Step 3: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/assets.ts
git commit -m "fix(rpg): matte-clean the plugin-removal fallback output (round-6 mottled sprites)"
```

---

### Task 7: openPlains.ts — strengthen pure-black prompts + negativePrompt

**Files:**
- Modify: `rpg/src/scene/manifest/openPlains.ts`
- Test: `rpg/tests/unit/scene-c.test.ts` (extend)

**Interfaces:** none (prompt text). The prompt + negativePrompt change busts the sprite raw keys → sprites regenerate (intended — owner decision to strengthen prompt-first before any code treatment).

- [ ] **Step 1: Extend the failing test** — append to `rpg/tests/unit/scene-c.test.ts`:

```ts
  it("sprites demand a solid pure-black background (D5 prompt lever, round 7)", () => {
    const parsed = parseSceneManifest(openPlainsManifest);
    for (const actor of parsed.actors) {
      if (!actor.sprite?.prompt) continue;
      expect(actor.sprite.prompt).toMatch(/pure solid black|#000000/i);
      expect(actor.sprite.prompt).toMatch(/zero grey|no grey/i);
      expect(actor.sprite.negativePrompt).toMatch(/grey background|gray background/i);
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit scene-c`
Expected: FAIL — current prompts don't satisfy the new assertions.

- [ ] **Step 3: Strengthen the prompts in `rpg/src/scene/manifest/openPlains.ts`**

```ts
// Sprites are generated on a SOLID PURE BLACK background. Round-5/6 forensics
// showed the model still delivered dark-grey/white — the wording below is the
// D5 lever pushed further (removal-pipeline-spec §7; round-7 owner direction:
// prompt-first). The matching negativePrompt is a cache-key component (busts
// sprites — intended). RMBG-1.4 segments any background, so this only matters
// for the platform-fallback path.
const spriteBackground =
  "The ENTIRE background behind the figure must be 100% pure solid black — every single pixel exactly #000000 — flat and uniform across every corner and every edge, with zero gradient, zero vignette, zero grey, zero dark-grey, zero off-black, zero shadow, zero floor line, zero props, zero rim light and zero texture variation anywhere in the background. The figure must be fully contained inside the frame, standing centered, full body visible from head to feet, crisp clean silhouette edge. No text, no UI, no watermark, no noise.";

const spriteNegativePrompt =
  "gradient, vignette, floor shadow, background props, rim light, background texture, noise, text, watermark, grey background, gray background, dark grey, off-black, white background, mottled background, dirty background, midtones in background";
```

(Only the two constants change — both actors already reference `spriteBackground` + `spriteNegativePrompt`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rpg && pnpm test:unit -- --project unit scene-c && pnpm typecheck && pnpm lint`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/manifest/openPlains.ts rpg/tests/unit/scene-c.test.ts
git commit -m "feat(rpg): strengthen the pure-black sprite prompts + negativePrompt (prompt-first lever)"
```

---

### Task 8: RemovalChip — top-level mount (outside App)

**Files:**
- Modify: `rpg/src/main.tsx`
- Modify: `rpg/src/ui/App.tsx` (remove chip + import)

**Interfaces:** `<RemovalChip />` unchanged; it now renders into its own top-level mount so it is live during boot removal and ready for future in-game re-rolls (owner decision, round-6 finding: the chip lived inside `<App>`, which mounts only after removal drained).

- [ ] **Step 1: Edit `rpg/src/ui/App.tsx`** — remove the `<RemovalChip />` element and the `import { RemovalChip } from "./RemovalChip";` line.

- [ ] **Step 2: Edit `rpg/src/main.tsx`** — render the chip into a dedicated body mount (alongside the LoadingScreen), before `loadScene`:

```tsx
import { App } from "./ui/App";
import { LoadingScreen } from "./ui/LoadingScreen";
import { RemovalChip } from "./ui/RemovalChip";
import "./style.css";
```

```tsx
// Animated boot loading screen — live stage updates come from the progress
// store (the main thread is free because inference runs in the proxy worker).
render(<LoadingScreen />, mount);

// The removal chip lives OUTSIDE the App mount (owner decision, round 6): App
// mounts only after the scene loads, but removal runs DURING boot — the chip
// must be live while the loading screen is up (and stays ready for future
// in-game re-rolls). Its CSS is position:fixed, so the wrapper stays invisible.
const chipMount = document.createElement("div");
chipMount.id = "removal-chip-root";
document.body.appendChild(chipMount);
render(<RemovalChip />, chipMount);
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd rpg && pnpm typecheck && pnpm lint`
Expected: clean (no unused import left in App.tsx).

- [ ] **Step 4: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/main.tsx rpg/src/ui/App.tsx
git commit -m "fix(rpg): mount the removal chip at the top level so it is live during boot removal"
```

---

### Task 9: ship-perchance.sh — fix the stale wasm comment

**Files:**
- Modify: `scripts/ship-perchance.sh`

**Interfaces:** none (comment only — the `rm` behavior is already correct: with `wasmPaths` CDN the local Vite-emitted wasm is never fetched).

- [ ] **Step 1: Replace the stale comment**

```bash
# The ONNX Runtime wasm asset Vite emits from the transformers.js chunk is
# never fetched at runtime — bg-removal.ts pins ORT to the jsdelivr CDN via
# wasmPaths (ORT_WASM_PATHS, version must match pnpm-lock; verified 200).
# Drop the local copy so the upload set stays lean.
rm -f "$WORKTREE/src/rpg/build/assets"/*.wasm
rmdir "$WORKTREE/src/rpg/build/assets" 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add scripts/ship-perchance.sh
git commit -m "docs(ship): correct the wasm comment (ORT pinned to CDN via wasmPaths)"
```

---

### Task 10: Docs — vn-rpg-spec, AGENTS.md, test-prompt round 7

**Files:**
- Modify: `vn-rpg-spec.md` (§4.1)
- Modify: `AGENTS.md` (stack line)
- Rewrite: `test-prompt.txt` → round 7

**Interfaces:** none (documentation). Content must match the round-7 decisions exactly.

- [ ] **Step 1: Update `vn-rpg-spec.md` §4.1** — add: the CDN `wasmPaths` pin (`ORT_WASM_PATHS` — exact jsdelivr URL, MUST match pnpm-lock; local wasm stays out of the ship), the model-download stage (progress_callback → `modelDownload` signal), the preload catch (3 attempts per boot kept), the fallback matte pass, the top-level removal chip (live during boot + future re-rolls), and `preserveDrawingBuffer: true` (platform screenshots). Note the round-7 open questions: HF reachability inside the iframe (if blocked → mirror decision pending) and the `ort.webgpu.bundle.min.mjs` 404 (wasm backend only — verify harmless).

- [ ] **Step 2: Update `AGENTS.md`** — extend the stack line with: "RMBG-1.4 client-side removal pinned to the onnxruntime-web CDN via `wasmPaths` (version must match pnpm-lock); inference in the ORT proxy worker (`proxy=true`, `numThreads=1`); processed cut-outs cached in Dexie `cutouts`".

- [ ] **Step 3: Rewrite `test-prompt.txt` for round 7** — keep the round-6 structure; "Changes since round 6" lists: wasm now loaded from the CDN (wasmPaths), model-download stage on the loading screen, preload catch, permanent preserveDrawingBuffer, stronger ground shadow, matte on fallback, stronger pure-black prompts, chip at top level. Checks for the agent:
  1. **Boot (prod)**: `[rpg] bg-removal: proxy worker active (… wasmPaths=CDN)` appears; **no 404** for `assets/ort-wasm-simd-threaded.asyncify-*.wasm`; first visit shows "Downloading AI model (first visit)…" with a rising percentage, then "Removing background 1/2"; the loading screen animates (UI not frozen — proxy worker). **Critical: does the model download from huggingface.co complete?** (log `[rpg] bg-removal: model ready (Nms)`). If HF is blocked → report it (mirror decision pending) and confirm the fallback fires cleanly (now matte-cleaned).
  2. **Warm reload**: fast (~seconds); `[rpg] cutout-cache: hit … (skip inference)` ×2; model NOT re-downloaded (browser cache — `model ready` quickly or download stage skipped); no 404s.
  3. **Sprite quality**: regenerated sprites (prompt change) — raw closer to pure black; cut-outs clean (no mottle, clean silhouette outline); black outline is a clean ring (not ragged).
  4. **Fallback (only if client removal fails)**: the warn log appears; the platform cut-out is matte-cleaned (less grey fuzz than round 6); re-attempted next reload (never cached).
  5. **`ort.webgpu.bundle.min.mjs` 404 check**: does it still 404? Does it produce any console error?
  6. **Visual**: the ground shadow under both sprites is visible (ground contact); the floor↔backdrop "box effect" is known/acceptable — report only. Take a screenshot of the scene for the sprite-scale decision (dedicated layout round).

- [ ] **Step 4: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add vn-rpg-spec.md AGENTS.md test-prompt.txt
git commit -m "docs(rpg): record the CDN wasm pin, model-download stage, fallback matte, and chip relocation; write the round-7 test prompt"
```

---

### Task 11: Full validation + browser (CDP) + final commit

**Files:** none (validation).

**Interfaces:** validates Tasks 1–10 end-to-end.

- [ ] **Step 1: Full local suite + build**

Run: `cd rpg && pnpm typecheck && pnpm lint && pnpm test:all && pnpm build && pnpm test:e2e`
Expected: all green. Confirm `build/chunks/` still contains the three.js + transformers + preload-helper chunks and that `build/assets/` contains only the (unshipped) wasm.

- [ ] **Step 2: Browser validation via CDP** (dev server + Chrome):

  1. Start the dev server (tmux, port 5173); open the app (dev harness/mock). Confirm the loading screen shows "Generating scene assets…" and the scene mounts. Drive `window.__rpgProgress`:
     - `setModelDownload({ status: "downloading", pct: 42, file: "model_q8.onnx" })` → loading screen label becomes "Downloading AI model (first visit)… 42%" (screenshot).
     - `setModelDownload({ status: "ready" })` → label returns to the boot stage.
     - `setRemovalQueue(0, 2)` → **the corner chip appears at top level even before App mounts** (screenshot); `setRemovalQueue(2, 2)` → chip disappears.
  2. Open `/poc-bg-removal.html`: confirm via `list_network_requests` that the wasm is fetched from `cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.asyncify.wasm` (**this is the wasmPaths CDN proof — the round-6 404 is gone**), the model loads (cached in the round-6 profile → fast), inference completes in the proxy worker, and the UI stays responsive (rAF counter keeps ticking during inference).
  3. **Prod-mode boot with real model + CDN wasm**: build a prod preview (`VITE_RPG_MOCK=false pnpm build` then `vite preview`), open the app, and confirm the full prod pipeline: wasm from CDN, model downloads (first visit in this profile), loading screen shows the download stage, cut-outs cached, scene mounts. This is the local end-to-end proof of the round-7 fix before Perchance.
  4. Confirm the canvas captures natively (no preamble patch needed — `preserveDrawingBuffer`).
  5. Check the console for errors (only the favicon 404 is expected).
  6. **Kill Chrome:** `pkill -f "/opt/google/chrome/chrome"` and confirm zero processes. Kill the dev server tmux session.

- [ ] **Step 3: Commit the regenerated build**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/build && git commit -m "build(rpg): regenerate the round-7 bundle (CDN wasm, model stage, preserveDrawingBuffer, shadow)"
```

- [ ] **Step 4: Self-review against the decisions** — walk the round-7 decision list (wasmPaths CDN + re-verified URL ✓, HF tested in round 7 ✓, webgpu 404 in round 7 ✓, chip top-level ✓, preload catch ✓, preserveDrawingBuffer ✓, fallback matte ✓, fallback cache accepted ✓, scale deferred + shadow only ✓, prompts strengthened ✓, model download stage ✓). Fix any gap found.

- [ ] **Step 5: Summary for the owner** — list what shipped, the validation results, and that **nothing was pushed** (push + `ship-perchance.sh --push` happen at round time per AGENTS.md).
