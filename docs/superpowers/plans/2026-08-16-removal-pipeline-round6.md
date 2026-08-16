# Removal Pipeline Round 6 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `removal-pipeline-spec.md` — cache processed cut-outs in IndexedDB, move RMBG inference off the main thread (`proxy = true`), make the process observable (animated loading screen + corner chip + structured console logs), strengthen the sprite black-background prompt, and document the floor "box effect" — so the round-6 Perchance run boots fast on reload and never freezes.

**Architecture:** A new `cutouts` Dexie table (schema v2) stores the post-RMBG + post-matte sprite as a derived asset keyed off the raw generation key + a pipeline version constant. `AssetCache` exposes a `CutoutStore`; `resolveSceneTextures` (prod) checks the cut-out before running inference, stores misses, and **never** caches the plugin-removal fallback (owner decision). `bg-removal.ts` flips `env.backends.onnx.wasm.proxy = true` (keeps `numThreads = 1` — no SharedArrayBuffer/cross-origin isolation needed) and logs progress. A Preact-signal progress store (`services/progress.ts`) is the single source of truth for the animated boot loading screen, the corner removal chip, and the console subscriber. The sprite manifest gains an optional `negativePrompt` and a much stronger pure-black background sentence.

**Tech Stack:** TypeScript (strict, TS 7.x), Vite, Preact + `@preact/signals`, Dexie via `fake-indexeddb` (integration), @huggingface/transformers v4 (lazy chunk), Biome, Vitest.

## Global Constraints

- **TypeScript strict** everywhere under `rpg/`; JSX only in `.tsx` files.
- **transformers.js stays a lazy chunk** — never imported statically; `env.backends.onnx.wasm.proxy = true` with `numThreads = 1` (no SharedArrayBuffer, no cross-origin isolation — impossible inside the `perchance.org` iframe; `removal-pipeline-spec.md` §4).
- **Cut-out cache contract:** IndexedDB table `cutouts` (Dexie schema v2); key = `rawKey + "|cutout|" + CUTOUT_PIPELINE_VERSION`; the **plugin-removal fallback output is NEVER cached** (owner decision 2026-08-16) — every boot re-attempts RMBG on a miss.
- **Only RMBG removes in prod** — the plugin's `removeBackground` remains only (a) as the uncached fallback when client removal fails, and (b) dev mock parity. Scene planes (backdrop/floor) never carry it.
- **Cache busting by key** — prompt or `negativePrompt` changes bust the raw key, which busts the cut-out key (sprites regenerate — intended).
- **No app-level retry/timeout on plugin content** (`pending-decisions.md` §5) — we only surface loading state.
- **Signals are the single source of truth** for boot progress / removal queue — UI (loading screen, chip) and the console subscriber read the same store; no bespoke event emitter.
- **All artifacts in English**; Conventional Commits with scope `rpg`; commit `rpg/build/` when the bundle changes; **commit locally only — no push** (push happens at round time).
- **Kill Chrome after browser validation:** `pkill -f "/opt/google/chrome/chrome"` (match the binary path only, never `chrome-profile`).

---

### Task 1: Cut-out cache — Dexie schema v2 + key derivation + CutoutStore

**Files:**
- Modify: `rpg/src/services/db.ts`
- Create: `rpg/src/services/cutout-cache.ts`
- Modify: `rpg/src/services/generation.ts` (`CachedAsset.key`, `AssetCache.cutouts`, `clear()`)
- Test: `rpg/tests/unit/cutout-cache.test.ts` (new), `rpg/tests/integration/cutout-cache.test.ts` (new)

**Interfaces:**
- Consumes: `RuntimeMode` (existing), `RpgDatabase` (existing Dexie class).
- Produces:
  - `interface CutoutRow { key: string; dataUrl: string; mode: RuntimeMode; createdAt: number }` and `RpgDatabase.cutouts: Table<CutoutRow, string>` (schema v2).
  - `CUTOUT_PIPELINE_VERSION = "rmbg-q8-v1"` (exported const).
  - `cutoutCacheKey(rawKey: string): string` — pure, unit-tested.
  - `class CutoutStore { get(rawKey: string): Promise<string | undefined>; put(rawKey: string, dataUrl: string): Promise<void> }` — thin Dexie wrapper.
  - `CachedAsset` gains `key: string` (additive); `AssetCache` gains `readonly cutouts: CutoutStore`; `AssetCache.clear()` also clears `cutouts`.

- [ ] **Step 1: Write the failing unit test** — `rpg/tests/unit/cutout-cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CUTOUT_PIPELINE_VERSION, cutoutCacheKey } from "../../src/services/cutout-cache";

describe("cutoutCacheKey", () => {
  it("derives the cut-out key from the raw key + pipeline version", () => {
    expect(cutoutCacheKey("prod|npc/elder|idle|seed|hash|512x768|rb")).toBe(
      `prod|npc/elder|idle|seed|hash|512x768|rb|cutout|${CUTOUT_PIPELINE_VERSION}`,
    );
  });

  it("busts when the raw key changes (prompt/seed/resolution bust)", () => {
    expect(cutoutCacheKey("a")).not.toBe(cutoutCacheKey("b"));
  });

  it("busts when the pipeline version changes", () => {
    const v1 = `${CUTOUT_PIPELINE_VERSION}`;
    expect(cutoutCacheKey("raw").includes(v1)).toBe(true);
    expect(cutoutCacheKey("raw").includes("rmbg-q8-v1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit cutout-cache`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `rpg/src/services/cutout-cache.ts`** (full file):

```ts
import type { Table } from "dexie";

import type { RuntimeMode } from "./perchance-runtime";
import type { CutoutRow } from "./db";

/**
 * Bump when the removal/matte/outline pipeline changes — one bump
 * invalidates every cached cut-out (removal-pipeline-spec §3).
 */
export const CUTOUT_PIPELINE_VERSION = "rmbg-q8-v1";

/** A cut-out is a derived asset: raw generation key + pipeline version. */
export function cutoutCacheKey(rawKey: string): string {
  return `${rawKey}|cutout|${CUTOUT_PIPELINE_VERSION}`;
}

/**
 * Thin Dexie wrapper over the `cutouts` table. Stores ONLY RMBG-processed
 * cut-outs; the plugin-removal fallback is never written here (owner
 * decision — a transient model failure must recover on its own next boot).
 */
export class CutoutStore {
  constructor(
    private readonly table: Table<CutoutRow, string>,
    private readonly mode: RuntimeMode,
  ) {}

  async get(rawKey: string): Promise<string | undefined> {
    const row = await this.table.get(cutoutCacheKey(rawKey));
    return row?.dataUrl;
  }

  async put(rawKey: string, dataUrl: string): Promise<void> {
    await this.table.put({
      key: cutoutCacheKey(rawKey),
      dataUrl,
      mode: this.mode,
      createdAt: Date.now(),
    });
  }
}
```

- [ ] **Step 4: Add the schema v2 table in `rpg/src/services/db.ts`** — append `CutoutRow` and bump the version:

```ts
/** One processed cut-out (RMBG + matte) — derived from a raw AssetRow. */
export interface CutoutRow {
  /** cutoutCacheKey(rawKey) — embeds the raw key + pipeline version. */
  key: string;
  dataUrl: string;
  mode: RuntimeMode;
  createdAt: number;
}

export class RpgDatabase extends Dexie {
  assets!: Table<AssetRow, string>;
  cutouts!: Table<CutoutRow, string>;

  constructor(mode: RuntimeMode, dbName?: string) {
    super(dbName ?? (mode === "dev" ? "rpg_dev" : "rpg"));
    this.version(2).stores({
      assets: "key, mode, createdAt",
      cutouts: "key, mode, createdAt",
    });
  }
}
```

- [ ] **Step 5: Extend `rpg/src/services/generation.ts`** — `CachedAsset.key`, `AssetCache.cutouts`, `clear()`:

```ts
import { CutoutStore } from "./cutout-cache";

export interface CachedAsset {
  dataUrl: string;
  fromCache: boolean;
  /** The computed cache key — lets derived assets (cut-outs) key off the raw generation. */
  key: string;
}
```

In the `AssetCache` class: add the store to the constructor body and return `key` from both `getOrGenerate` and `regenerate`:

```ts
  /** Cut-out store (RMBG-processed sprites) — prod only, see cutout-cache.ts. */
  readonly cutouts: CutoutStore;

  constructor(mode: RuntimeMode, image: ImageService, options?: { dbName?: string; seedFactory?: () => string }) {
    this.mode = mode;
    this.image = image;
    this.db = new RpgDatabase(mode, options?.dbName);
    this.cutouts = new CutoutStore(this.db.cutouts, mode);
    this.seedFactory = options?.seedFactory ?? (() => `roll-${++this.seedCounter}-${Date.now()}`);
  }

  async getOrGenerate(req: AssetRequest): Promise<CachedAsset> {
    const key = assetCacheKey(this.mode, req);
    const row = await this.db.assets.get(key);
    if (row) {
      this.log.push({ kind: "hit", key, chars: row.dataUrl.length, at: Date.now() });
      return { dataUrl: row.dataUrl, fromCache: true, key };
    }
    this.log.push({ kind: "miss", key, chars: req.prompt.length, at: Date.now() });
    const result = await this.generateAndStore(req, key);
    return { dataUrl: result, fromCache: false, key };
  }

  async regenerate(req: Omit<AssetRequest, "seed">): Promise<CachedAsset> {
    const seed = this.seedFactory();
    const key = assetCacheKey(this.mode, { ...req, seed });
    this.log.push({ kind: "regenerate", key, chars: req.prompt.length, at: Date.now() });
    const result = await this.generateAndStore({ ...req, seed }, key);
    return { dataUrl: result, fromCache: false, key };
  }

  async clear(): Promise<void> {
    await this.db.assets.clear();
    await this.db.cutouts.clear();
    this.log.length = 0;
  }
```

- [ ] **Step 6: Write the failing integration test** — `rpg/tests/integration/cutout-cache.test.ts`:

```ts
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AssetCache } from "../../src/services/generation";
import type { ImageService } from "../../src/services/perchance-runtime";

describe("CutoutStore (fake-indexeddb)", () => {
  beforeEach(async () => {
    await Dexie.delete("rpg_test_cutout");
  });
  afterEach(async () => {
    await Dexie.delete("rpg_test_cutout");
  });

  function cache(): AssetCache {
    const service: ImageService = {
      async generate(opts) {
        return { dataUrl: `data:image/png;base64,${opts.seed}` };
      },
    };
    return new AssetCache("prod", service, { dbName: "rpg_test_cutout" });
  }

  it("stores and retrieves a cut-out keyed by the raw key", async () => {
    const assets = cache();
    const raw = await assets.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "elder",
      seed: "s1",
    });

    expect(await assets.cutouts.get(raw.key)).toBeUndefined();
    await assets.cutouts.put(raw.key, "data:image/png;base64,CUTOUT");
    expect(await assets.cutouts.get(raw.key)).toBe("data:image/png;base64,CUTOUT");

    await assets.close();
  });

  it("clear() wipes cut-outs too", async () => {
    const assets = cache();
    const raw = await assets.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "elder",
      seed: "s1",
    });
    await assets.cutouts.put(raw.key, "data:image/png;base64,CUTOUT");
    await assets.clear();
    expect(await assets.cutouts.get(raw.key)).toBeUndefined();

    await assets.close();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `cd rpg && pnpm test:integration -- --project integration cutout-cache`
Expected: FAIL — `cutouts` table / `cutoutCacheKey` missing.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd rpg && pnpm test:unit -- --project unit cutout-cache && pnpm test:integration -- --project integration cutout-cache`
Expected: PASS (3 unit + 2 integration).

- [ ] **Step 9: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/services/db.ts rpg/src/services/cutout-cache.ts rpg/src/services/generation.ts rpg/tests/unit/cutout-cache.test.ts rpg/tests/integration/cutout-cache.test.ts
git commit -m "feat(rpg): add the processed cut-out cache (Dexie v2, CutoutStore, pipeline-version key)"
```

---

### Task 2: Progress store — Preact signals + console subscriber

**Files:**
- Create: `rpg/src/services/progress.ts`
- Test: `rpg/tests/unit/progress.test.ts` (new)

**Interfaces:**
- Consumes: `@preact/signals` (existing dependency).
- Produces:
  - `type BootStageId = "scene-assets" | "model" | "removal" | "polish" | "scene"`.
  - `interface BootProgress { stage: BootStageId; label: string; detail?: string }`.
  - `export const bootProgress: Signal<BootProgress>` (initial `{ stage: "scene-assets", label: "Generating scene assets…" }`).
  - `export const removalQueue: Signal<{ done: number; total: number }>` (initial `{ done: 0, total: 0 }`).
  - `setBootStage(stage, label, detail?)`, `setRemovalQueue(done, total)` — thin setters.
  - `installProgressLogger(): void` — subscribes with `effect`; logs `[rpg] boot: …` and `[rpg] bg-removal: …` transitions. In dev it also exposes `window.__rpgProgress` for CDP validation.

- [ ] **Step 1: Write the failing unit test** — `rpg/tests/unit/progress.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bootProgress,
  installProgressLogger,
  removalQueue,
  setBootStage,
  setRemovalQueue,
} from "../../src/services/progress";

describe("progress store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    bootProgress.value = { stage: "scene-assets", label: "Generating scene assets…" };
    removalQueue.value = { done: 0, total: 0 };
  });

  it("starts on the scene-assets stage with an empty queue", () => {
    expect(bootProgress.value.stage).toBe("scene-assets");
    expect(removalQueue.value).toEqual({ done: 0, total: 0 });
  });

  it("setBootStage replaces the whole snapshot", () => {
    setBootStage("removal", "Removing background…");
    expect(bootProgress.value).toEqual({ stage: "removal", label: "Removing background…" });
  });

  it("setRemovalQueue tracks done/total", () => {
    setRemovalQueue(1, 2);
    expect(removalQueue.value).toEqual({ done: 1, total: 2 });
  });

  it("installProgressLogger emits structured [rpg] lines on transitions", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    installProgressLogger();

    setBootStage("removal", "Removing background…");
    expect(spy).toHaveBeenCalledWith("[rpg] boot: removing background…");

    setRemovalQueue(0, 2);
    setRemovalQueue(1, 2);
    setRemovalQueue(2, 2);
    expect(spy.mock.calls.some((c) => c[0] === "[rpg] bg-removal: queue 0/2")).toBe(true);
    expect(spy.mock.calls.some((c) => c[0] === "[rpg] bg-removal: queue 2/2")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit progress`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `rpg/src/services/progress.ts`** (full file):

```ts
import { effect, signal } from "@preact/signals";

/**
 * Single source of truth for boot/removal progress (removal-pipeline-spec
 * §5). The animated loading screen, the corner removal chip and the console
 * subscriber all read these signals — no bespoke event emitter.
 */
export type BootStageId = "scene-assets" | "model" | "removal" | "polish" | "scene";

export interface BootProgress {
  stage: BootStageId;
  label: string;
  detail?: string;
}

export const bootProgress = signal<BootProgress>({
  stage: "scene-assets",
  label: "Generating scene assets…",
});

/** done = completed removals, total = sprites to remove (0 when idle). */
export const removalQueue = signal<{ done: number; total: number }>({ done: 0, total: 0 });

export function setBootStage(stage: BootStageId, label: string, detail?: string): void {
  bootProgress.value = { stage, label, detail };
}

export function setRemovalQueue(done: number, total: number): void {
  removalQueue.value = { done, total };
}

/**
 * Console observability — the Perchance agent diagnoses progress through
 * these lines (round-5 finding: nothing told it the model was working).
 * Dev-only: exposes the signals on `window.__rpgProgress` so CDP tests can
 * drive the loading screen / chip directly.
 */
export function installProgressLogger(): void {
  effect(() => {
    const { stage, label } = bootProgress.value;
    if (stage !== "scene-assets") console.log(`[rpg] boot: ${label.toLowerCase()}`);
  });
  effect(() => {
    const { done, total } = removalQueue.value;
    if (total > 0 && done < total) {
      console.log(`[rpg] bg-removal: queue ${done}/${total}`);
    } else if (total > 0 && done === total) {
      console.log(`[rpg] bg-removal: queue drained (${total} sprites)`);
    }
  });
  // Dev-only debug handle for CDP validation. Guarded for node (Vitest env
  // has no `window` even though import.meta.env.DEV is true there).
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__rpgProgress = {
      bootProgress,
      removalQueue,
      setBootStage,
      setRemovalQueue,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rpg && pnpm test:unit -- --project unit progress`
Expected: PASS (4 tests). If the effect assertions are flaky (effects may batch), call `setRemovalQueue` values one at a time with a `await Promise.resolve()` between them — @preact/signals effects flush synchronously on change.

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/services/progress.ts rpg/tests/unit/progress.test.ts
git commit -m "feat(rpg): add the boot/removal progress signal store with console observability"
```

---

### Task 3: bg-removal.ts — proxy worker + structured logs

**Files:**
- Modify: `rpg/src/services/bg-removal.ts`

**Interfaces:**
- Consumes: existing `createRemover()` internals.
- Produces: unchanged public surface (`preloadBackgroundRemoval`, `backgroundRemovalReady`, `removeBackgroundClient`, `BackgroundRemover`) — plus console logs: `[rpg] bg-removal: proxy worker active`, `[rpg] bg-removal: model loading…`, `[rpg] bg-removal: model ready (Nms)`, `[rpg] bg-removal: inference done (Nms)`.

- [ ] **Step 1: Flip the proxy flag and add the logs** in `rpg/src/services/bg-removal.ts` — replace the env-config block and the model load:

```ts
  // Single-threaded WASM moved OFF the main thread via the ORT proxy worker:
  // no SharedArrayBuffer / cross-origin isolation required (numThreads=1),
  // and the heavy inference no longer blocks the UI (removal-pipeline-spec
  // §4 — research: ORT docs confirm proxy worker works without COI).
  const onnxEnv = mod.env.backends.onnx;
  if (onnxEnv?.wasm) {
    onnxEnv.wasm.numThreads = 1;
    onnxEnv.wasm.proxy = true;
    console.log("[rpg] bg-removal: proxy worker active (wasm proxy=true, numThreads=1)");
  }

  console.log("[rpg] bg-removal: model loading… (first visit downloads ~42 MB)");
  const modelStart = performance.now();
  const model = (await mod.AutoModel.from_pretrained("briaai/RMBG-1.4", {
    config: { model_type: "custom" },
    dtype: "q8", // 8-bit quantized (~45 MB) — the in-browser sweet spot
  })) as Model;

  const processor = (await mod.AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
    // … unchanged processor config …
  })) as Processor;
  console.log(`[rpg] bg-removal: model ready (${Math.round(performance.now() - modelStart)} ms)`);
```

And inside the returned remover, around the model call:

```ts
  return async (dataUrl: string): Promise<string> => {
    const image = await mod.RawImage.fromURL(dataUrl);
    const { pixel_values } = await processor(image);
    const inferStart = performance.now();
    const { output } = await model({ input: pixel_values });
    console.log(`[rpg] bg-removal: inference done (${Math.round(performance.now() - inferStart)} ms)`);
    const maskTensor = output[0];
    // … unchanged mask composition …
  };
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd rpg && pnpm typecheck && pnpm lint`
Expected: clean (no new type errors; the `performance` global is available in the browser target).

- [ ] **Step 3: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/services/bg-removal.ts
git commit -m "feat(rpg): run RMBG inference in the ORT proxy worker and log model/inference timing"
```

---

### Task 4: assets.ts — cut-out cache in the prod pipeline + progress + fallback (uncached)

**Files:**
- Modify: `rpg/src/scene/assets.ts`
- Test: `rpg/tests/integration/scene-assets.test.ts` (extend)

**Interfaces:**
- Consumes: `AssetCache.cutouts` + `CachedAsset.key` (Task 1), `setBootStage`/`setRemovalQueue` (Task 2), `BackgroundRemover` + `removeBackgroundClient` (existing), `cleanSpriteMatte`, `buildOutlineDataUrl` (existing).
- Produces: `resolveSceneTextures(manifest, assets, options?: { removeBackground?: BackgroundRemover })` — optional remover injection for tests (defaults to `removeBackgroundClient`). Behavior (prod actors): raw → cut-out hit? → use it (log hit, no inference) : (RMBG → matte → store → log miss); on RMBG failure → plugin removal fallback, used in-session, **never stored**.

- [ ] **Step 1: Extend the failing integration test** — append to `rpg/tests/integration/scene-assets.test.ts`:

```ts
describe("resolveSceneTextures — cut-out cache (prod, injected remover)", () => {
  beforeEach(async () => {
    await Dexie.delete("rpg_test_cutout_pipe");
  });
  afterEach(async () => {
    await Dexie.delete("rpg_test_cutout_pipe");
  });

  function prodCache(): {
    assets: AssetCache;
    seen: Array<{ removeBackground?: boolean; prompt: string }>;
  } {
    const seen: Array<{ removeBackground?: boolean; prompt: string }> = [];
    const service: ImageService = {
      async generate(opts) {
        seen.push({ removeBackground: opts.removeBackground, prompt: opts.prompt });
        return { dataUrl: `data:image/png;base64,${opts.seed}` };
      },
    };
    return { assets: new AssetCache("prod", service, { dbName: "rpg_test_cutout_pipe" }), seen };
  }

  it("runs the remover once and serves the cut-out from cache on the next resolve", async () => {
    const { assets, seen } = prodCache();
    let removals = 0;
    const remover: BackgroundRemover = async (dataUrl) => {
      removals += 1;
      return dataUrl;
    };

    const first = await resolveSceneTextures(openPlainsManifest, assets, { removeBackground: remover });
    expect(removals).toBe(2); // player + elder
    expect(first.actors.player?.sprite).toMatch(/^data:image\//);

    const second = await resolveSceneTextures(openPlainsManifest, assets, { removeBackground: remover });
    expect(removals).toBe(2); // both served from the cut-out cache — no re-inference
    expect(second.actors.player?.sprite).toBe(first.actors.player?.sprite);

    await assets.close();
  });

  it("does NOT cache the plugin-removal fallback — the remover is re-attempted next resolve", async () => {
    const { assets, seen } = prodCache();
    let removals = 0;
    const remover: BackgroundRemover = async () => {
      removals += 1;
      throw new Error("model CDN blocked");
    };

    const first = await resolveSceneTextures(openPlainsManifest, assets, { removeBackground: remover });
    // Fallback path: plugin removal (removeBackground: true) per actor.
    expect(seen.filter((s) => s.removeBackground === true)).toHaveLength(2);
    expect(first.actors.player?.sprite).toMatch(/^data:image\//);

    const second = await resolveSceneTextures(openPlainsManifest, assets, { removeBackground: remover });
    expect(removals).toBe(4); // re-attempted — fallback output is never cached
    expect(seen.filter((s) => s.removeBackground === true)).toHaveLength(4);

    await assets.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:integration -- --project integration scene-assets`
Expected: FAIL — the injected remover is not part of the signature yet (and no cache behavior).

- [ ] **Step 3: Rewrite the actor branch of `rpg/src/scene/assets.ts`** — new signature + prod pipeline:

```ts
import { removeBackgroundClient, type BackgroundRemover } from "../services/bg-removal";
import { setBootStage, setRemovalQueue } from "../services/progress";

export async function resolveSceneTextures(
  manifest: SceneManifest,
  assets: AssetCache,
  options: { removeBackground?: BackgroundRemover } = {},
): Promise<SceneTextures> {
  // … type-C guard + plane resolution unchanged (setBootStage("scene-assets") already the initial state) …
  const remover = options.removeBackground ?? removeBackgroundClient;

  const actors: Record<string, ActorTextures> = {};
  const spriteActors = manifest.actors.filter((a) => a.sprite?.assetKey && a.sprite?.prompt);
  setBootStage("removal", "Removing background…");
  setRemovalQueue(0, spriteActors.length);
  let done = 0;

  await Promise.all(
    spriteActors.map(async (actor) => {
      const prompt = actor.sprite?.prompt;
      if (!actor.sprite?.assetKey || !prompt) return;
      const generate = (removeBackground: boolean) =>
        assets.getOrGenerate({
          entity: actor.characterId,
          pose: actor.pose,
          prompt,
          seed: `${manifest.id}:${actor.characterId}:${actor.pose}:v1`,
          resolution: "512x768",
          removeBackground,
          negativePrompt: actor.sprite?.negativePrompt,
        });

      let spriteUrl: string;
      if (assets.mode === "prod") {
        const raw = await generate(false);
        const cached = await assets.cutouts.get(raw.key);
        if (cached) {
          console.log(`[rpg] cutout-cache: hit ${actor.characterId} (skip inference)`);
          spriteUrl = cached;
        } else {
          console.log(`[rpg] cutout-cache: miss ${actor.characterId} → removing`);
          try {
            const removed = await remover(raw.dataUrl);
            spriteUrl = await cleanSpriteMatte(removed);
            await assets.cutouts.put(raw.key, spriteUrl);
          } catch (error) {
            console.warn(
              "bg-removal: client-side removal failed — falling back to the platform removal",
              error,
            );
            // Fallback is used in-session but NEVER cached (owner decision):
            // a transient model failure must recover on its own next boot.
            const fallback = await generate(true);
            spriteUrl = fallback.dataUrl;
          }
        }
      } else {
        const mock = await generate(true);
        spriteUrl = mock.dataUrl;
      }
      const cleaned = spriteUrl; // cached value is already post-matte; fresh path cleaned above
      const outline = await buildOutlineDataUrl(cleaned);
      actors[actor.characterId] = { sprite: cleaned, outline };
      done += 1;
      setRemovalQueue(done, spriteActors.length);
      console.log(`[rpg] bg-removal: ${actor.characterId} ready (${done}/${spriteActors.length})`);
    }),
  );

  setBootStage("polish", "Polishing sprites…");
  return { backdrop: backdrop.dataUrl, floor: floor.dataUrl, actors };
}
```

> Note: the dev branch keeps the mock (`generate(true)`) and never touches the remover — dev has no client-side removal (removal-pipeline-spec §4). The old code wrapped `cleanSpriteMatte` around the fallback result too; in this rewrite the fallback path skips matte — acceptable (plugin removal output is the platform's own cut-out; the matte pass is a polish that the platform removal already handles). If you prefer to keep the matte on the fallback path, add `spriteUrl = await cleanSpriteMatte(spriteUrl)` after the fallback line — but keep the "never cached" property.

- [ ] **Step 4: Update the `AssetRequest` usage** — `negativePrompt` is already a field on `AssetRequest` (generation.ts) and `ImageOpts` (perchance-runtime.ts); the manifest `sprite.negativePrompt` is added in Task 6. Until Task 6 lands, TS accepts `actor.sprite?.negativePrompt` only after the schema change — so land this task's compile by reading it through `(actor.sprite as { negativePrompt?: string } | undefined)?.negativePrompt` if needed, then simplify in Task 6.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd rpg && pnpm test:integration -- --project integration scene-assets && pnpm typecheck`
Expected: PASS — both existing and new integration tests.

- [ ] **Step 6: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/assets.ts rpg/tests/integration/scene-assets.test.ts
git commit -m "feat(rpg): serve processed cut-outs from the cache in prod; keep the fallback uncached"
```

---

### Task 5: Loading screen + corner chip (UI)

**Files:**
- Create: `rpg/src/ui/LoadingScreen.tsx`
- Create: `rpg/src/ui/RemovalChip.tsx`
- Modify: `rpg/src/main.tsx` (render LoadingScreen during boot; remove the imperative overlay)
- Modify: `rpg/src/ui/App.tsx` (include `<RemovalChip />`)
- Modify: `rpg/src/style.css` (loading screen + chip styles, spinner keyframes)

**Interfaces:**
- Consumes: `bootProgress`, `removalQueue` (Task 2).
- Produces: `<LoadingScreen />` (boot-only, reads `bootProgress` + `removalQueue`), `<RemovalChip />` (post-boot, corner indicator, reads `removalQueue`; renders nothing when idle).

- [ ] **Step 1: Create `rpg/src/ui/LoadingScreen.tsx`**:

```tsx
import { bootProgress, removalQueue } from "../services/progress";

/** Boot loading screen (removal-pipeline-spec §5.1): animated, live stages. */
export function LoadingScreen() {
  const progress = bootProgress.value;
  const queue = removalQueue.value;

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-label">{progress.label}</p>
      {queue.total > 0 && queue.done < queue.total && (
        <p className="loading-detail">
          Removing background {queue.done + 1}/{queue.total}…
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `rpg/src/ui/RemovalChip.tsx`**:

```tsx
import { removalQueue } from "../services/progress";

/** Discreet corner indicator shown while background removal is running. */
export function RemovalChip() {
  const queue = removalQueue.value;
  if (queue.total === 0 || queue.done >= queue.total) return null;

  return (
    <div className="removal-chip" role="status" aria-live="polite">
      <span className="chip-spinner" aria-hidden="true" />
      <span>
        Removing background {queue.done + 1}/{queue.total}…
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Rewire `rpg/src/main.tsx`** — replace the imperative overlay with a Preact loading screen; render App only after the scene loads:

```tsx
import { render } from "preact";

import { openPlainsManifest } from "./scene/manifest/openPlains";
import { preloadBackgroundRemoval } from "./services/bg-removal";
import { bootServices } from "./services/boot";
import { installProgressLogger } from "./services/progress";
import { App } from "./ui/App";
import { LoadingScreen } from "./ui/LoadingScreen";
import "./style.css";

const mount = document.getElementById("app") ?? document.querySelector("[data-rpg-app]");
if (!mount) throw new Error('Missing mount point — the page must contain <div id="app">.');

const services = bootServices();
installProgressLogger();

// Start the RMBG-1.4 model download at boot (prod only) so sprite removal
// never blocks the UI; remove() awaits it if a sprite is generated first.
if (services.mode === "prod") void preloadBackgroundRemoval();

const stageContainer = document.createElement("div");
stageContainer.id = "stage-container";
stageContainer.className = "stage";
mount.parentElement?.insertBefore(stageContainer, mount);

// Animated boot loading screen — live stage updates come from the progress
// store (the main thread is free because inference runs in the proxy worker).
render(<LoadingScreen />, mount);

const stage = await services.loadScene(openPlainsManifest, stageContainer, {
  width: window.innerWidth,
  height: window.innerHeight,
});

function frame(prev: number) {
  const now = performance.now();
  stage.tick((now - prev) / 1000);
  requestAnimationFrame(() => frame(now));
}
requestAnimationFrame(() => frame(performance.now()));

const onResize = () => stage.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", onResize);

render(<App services={services} stage={stage} />, mount);
```

- [ ] **Step 4: Include the chip in `rpg/src/ui/App.tsx`** — add `<RemovalChip />` next to the HUD:

```tsx
import { RemovalChip } from "./RemovalChip";
// …
  return (
    <main className="app">
      <div className="hud">
        <p className="muted">
          {services.mode} · {services.mocked ? "mock" : "platform"} runtime
        </p>
        <button type="button" onClick={talk}>
          Talk to the elder
        </button>
      </div>
      <RemovalChip />
      <DialogueBox />
    </main>
  );
```

- [ ] **Step 5: Add the styles to `rpg/src/style.css`** (append):

```css
/* Boot loading screen (removal-pipeline-spec §5.1) */
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: #0b1c2e;
  color: #e7edf5;
  font-family: ui-monospace, "Cascadia Mono", monospace;
  z-index: 50;
}
.loading-spinner {
  width: 2.25rem;
  height: 2.25rem;
  border: 3px solid rgba(231, 237, 245, 0.25);
  border-top-color: #f3ce76;
  border-radius: 50%;
  animation: rpg-spin 0.9s linear infinite;
}
.loading-label { margin: 0; font-size: 1.05rem; }
.loading-detail { margin: 0; font-size: 0.85rem; opacity: 0.7; }
@keyframes rpg-spin { to { transform: rotate(360deg); } }

/* Discreet corner chip (removal-pipeline-spec §5.2) */
.removal-chip {
  position: fixed;
  right: 0.75rem;
  bottom: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: rgba(7, 19, 33, 0.85);
  border: 1px solid rgba(231, 237, 245, 0.2);
  border-radius: 999px;
  color: #e7edf5;
  font-size: 0.8rem;
  font-family: ui-monospace, "Cascadia Mono", monospace;
  z-index: 40;
}
.chip-spinner {
  width: 0.8rem;
  height: 0.8rem;
  border: 2px solid rgba(231, 237, 245, 0.3);
  border-top-color: #f3ce76;
  border-radius: 50%;
  animation: rpg-spin 0.9s linear infinite;
}
```

- [ ] **Step 6: Typecheck + lint + full unit/integration suite**

Run: `cd rpg && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/main.tsx rpg/src/ui/LoadingScreen.tsx rpg/src/ui/RemovalChip.tsx rpg/src/ui/App.tsx rpg/src/style.css
git commit -m "feat(rpg): animated boot loading screen + discreet removal chip driven by the progress store"
```

---

### Task 6: Manifest — sprite negativePrompt + strengthened black-background prompt

**Files:**
- Modify: `rpg/src/scene/types.ts` (sprite schema: optional `negativePrompt`)
- Modify: `rpg/src/scene/manifest/openPlains.ts` (stronger `spriteBackground` + `negativePrompt` on both actors)
- Modify: `rpg/tests/unit/scene-c.test.ts` (parse assertion)

**Interfaces:**
- Consumes: `sceneManifestSchemaV1` (existing).
- Produces: `actor.sprite.negativePrompt?: string` in the schema — consumed by `assets.ts` (Task 4). Prompt change + negativePrompt change bust the raw sprite key → sprites regenerate (intended).

- [ ] **Step 1: Extend the schema** in `rpg/src/scene/types.ts`:

```ts
  sprite: optional(
    object({
      /** Cache key → generated portrait image. */
      assetKey: string(),
      /** Character generation prompt (feeds the AssetCache). */
      prompt: optional(string()),
      /** Negative prompt — also a cache-key component (busts on change). */
      negativePrompt: optional(string()),
    }),
  ),
```

- [ ] **Step 2: Extend the failing test** — add to `rpg/tests/unit/scene-c.test.ts`:

```ts
  it("parses a sprite negativePrompt (cache-key component)", () => {
    const manifest = parseSceneManifest({
      ...openPlains,
      actors: [
        {
          characterId: "npc/elder",
          pose: "idle",
          position: { x: 0, z: -1 },
          sprite: {
            assetKey: "characters/elder/idle",
            prompt: "elder",
            negativePrompt: "gradient, vignette",
          },
        },
      ],
    });

    expect(manifest.actors[0]?.sprite?.negativePrompt).toBe("gradient, vignette");
  });
```

Run: `cd rpg && pnpm test:unit -- --project unit scene-c`
Expected: FAIL — `negativePrompt` not in the schema.

- [ ] **Step 3: Strengthen the sprite prompt + negative prompts** in `rpg/src/scene/manifest/openPlains.ts`:

```ts
// Sprites are generated on a SOLID PURE BLACK background. Round-5 forensics
// showed the model delivered dark-grey/white instead of pure black — the
// strengthened wording below is the D5 lever (removal-pipeline-spec §7);
// the matching negativePrompt is a cache-key component (busts sprites).
const spriteBackground =
  "The ENTIRE background behind the figure must be one single uniform solid pure black color (#000000): flat, solid, covering every corner and every edge of the image, with zero gradient, zero vignette, zero shadow, zero floor line, zero props, zero rim light and zero texture variation in the background. The figure must be fully contained inside the frame, standing centered, full body visible from head to feet. No text, no UI, no watermark.";

const spriteNegativePrompt =
  "gradient, vignette, floor shadow, background props, rim light, background texture, noise, text, watermark";
```

And set `negativePrompt: spriteNegativePrompt` on both actor sprite configs (player + elder) in the manifest.

- [ ] **Step 4: Simplify the Task-4 cast** — now that the schema has `negativePrompt`, replace the `(actor.sprite as …)?.negativePrompt` workaround in `assets.ts` with `actor.sprite?.negativePrompt`.

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `cd rpg && pnpm test:unit -- --project unit scene-c && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/types.ts rpg/src/scene/manifest/openPlains.ts rpg/src/scene/assets.ts rpg/tests/unit/scene-c.test.ts
git commit -m "feat(rpg): strengthen the sprite pure-black background prompt and add sprite negativePrompt (cache-busting)"
```

---

### Task 7: Docs — vn-rpg-spec, AGENTS.md, test-prompt round 6

**Files:**
- Modify: `vn-rpg-spec.md` (§4.1 removal pipeline, §3.8 junction/box effect)
- Modify: `AGENTS.md` (spec index + stack line)
- Rewrite: `test-prompt.txt` → round 6

**Interfaces:** none (documentation). Content must match the decisions in `removal-pipeline-spec.md` exactly.

- [ ] **Step 1: Update `vn-rpg-spec.md` §4.1** — add the cut-out cache (Dexie `cutouts`, pipeline-version key, fallback never cached), the proxy worker (`proxy = true`, `numThreads = 1`, no COI), the observability trio (loading screen stages / corner chip / `[rpg]` console logs), and the strengthened sprite background prompt + negativePrompt.

- [ ] **Step 2: Update `vn-rpg-spec.md` §3.8** — document the round-5 correction (the "dark band" is the backdrop's bottom edge, not the junction) and the box-effect mitigations (junction fitting is scene-specific/fragile; fog + scene assets as camouflage; reserve this presentation for closed scenes). No code change.

- [ ] **Step 3: Update `AGENTS.md`** — add `removal-pipeline-spec.md` to the spec index; extend the stack line with "cut-out cache (Dexie `cutouts`) + RMBG inference in the ORT proxy worker (`proxy=true`, `numThreads=1`)".

- [ ] **Step 4: Rewrite `test-prompt.txt` for round 6** — keep the round-5 structure, update "Changes since round 5" and add: (1) warm reload must be fast (~seconds) with NO inference (confirm via the `[rpg] cutout-cache: hit … (skip inference)` console lines); (2) confirm `[rpg] bg-removal: proxy worker active` appears and the loading screen animates smoothly (UI not frozen) during removal; (3) confirm the corner chip "Removing background 1/2…" appears during first-boot removal and hides after; (4) confirm regenerated sprites (prompt change) arrive on pure-black backgrounds with reduced dark mottling; (5) if the fallback fires, the warning appears and the next reload re-attempts RMBG (no cached fallback); (6) the floor↔backdrop "box effect" is known/acceptable — report only, no fix expected.

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add vn-rpg-spec.md AGENTS.md test-prompt.txt
git commit -m "docs(rpg): record cut-out cache, proxy worker, observability, and box-effect mitigations; write the round-6 test prompt"
```

---

### Task 8: Full validation + browser (CDP) + final commit

**Files:** none (validation).

**Interfaces:** validates Tasks 1–7 end-to-end.

- [ ] **Step 1: Full local suite + build**

Run: `cd rpg && pnpm typecheck && pnpm lint && pnpm test:all && pnpm build && pnpm test:e2e`
Expected: all green; `rpg/build/` regenerated (commit it — it is the Perchance upload set). Confirm `build/chunks/` still contains the three.js + transformers lazy chunks and the transformer chunk did not grow with the progress store (it didn't — the store lives in the entry bundle).

- [ ] **Step 2: Browser validation via CDP** (dev server + Chrome):
  1. Start the dev server (tmux, port 5173) and open the app. Confirm the loading screen shows "Generating scene assets…" and the scene mounts with the HUD; console shows the `[rpg] boot:` lines.
  2. Open `/poc-bg-removal.html` (the POC reuses the real modules): confirm the proxy worker runs (inference completes), the **UI stays responsive during inference** (e.g. run a `setInterval` rAF counter via `evaluate_script` before starting and confirm it keeps ticking while the two samples process — this is the non-blocking proof), and the `[rpg] bg-removal:` lines appear with timings.
  3. Drive the chip: with `window.__rpgProgress` exposed in dev, call `setRemovalQueue(0, 2)` from the console and screenshot — the corner chip must appear; `setRemovalQueue(2, 2)` → chip disappears.
  4. Check the console for errors (only the favicon 404 is expected).
  5. **Kill Chrome:** `pkill -f "/opt/google/chrome/chrome"` and confirm zero processes. Kill the dev server tmux session.

- [ ] **Step 3: Commit the regenerated build**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/build && git commit -m "build(rpg): regenerate the round-6 bundle (cut-out cache, proxy worker, loading screen)"
```

- [ ] **Step 4: Self-review against the spec** — walk `removal-pipeline-spec.md` §11 acceptance criteria: warm-reload speed (cut-out hit), main thread free (proxy + smooth animation), corner chip, regenerated sprite quality, fallback retry (never cached), tests green, browser validation, docs updated. Fix any gap found.

- [ ] **Step 5: Summary for the owner** — list what shipped, the validation results, and that **nothing was pushed** (push + `ship-perchance.sh --push` happen at round time per AGENTS.md).
