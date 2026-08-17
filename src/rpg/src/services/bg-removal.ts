/**
 * Client-side background removal for character sprites (vn-rpg-spec §4.1).
 *
 * The Perchance image plugin's `removeBackground` leaves dirty/mottled edges
 * (round 3 finding). This module runs RMBG-1.4 (IS-Net) fully in the browser
 * via @huggingface/transformers + ONNX Runtime Web (WASM, WebGPU where
 * available) — the same recipe as the official Xenova demo.
 *
 * Design (owner direction):
 * - Lazy: transformers.js loads via dynamic import in its own chunk; the
 *   initial bundle never pays for it.
 * - Async at boot: `preload()` starts the model download at startup (prod
 *   only) so the UI is never blocked by it.
 * - Wait queue: `remove()` awaits the singleton model promise — a sprite
 *   generated before the model is ready simply waits for availability.
 * - Deterministic threading: `numThreads = 1` + `proxy = true` — inference
 *   runs in the ORT proxy worker (no SharedArrayBuffer / cross-origin
 *   isolation needed), so the main thread stays free. The WASM engine comes
 *   from the jsdelivr CDN via `wasmPaths` (ORT_WASM_PATHS) — the bundled
 *   local copy is excluded from the Perchance ship (round-6 root cause).
 * - Failure: `remove()` rejects; the caller falls back to the platform's
 *   removeBackground (see scene/assets.ts).
 */

import { setModelDownload } from "./progress";

/** Minimal structural types for the transformers.js call sites (the library
 * types are much wider; these keep the inference glue contained). */
interface TensorLike {
  mul(n: number): TensorLike;
  to(dtype: string): TensorLike;
}
type Processor = (image: unknown) => Promise<{ pixel_values: unknown }>;
type Model = (input: { input: unknown }) => Promise<{ output: TensorLike[] }>;
interface PngLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  toCanvas(): HTMLCanvasElement;
}
/** The ready-to-use removal function: dataUrl → PNG dataUrl (alpha cut out). */
export type BackgroundRemover = (dataUrl: string) => Promise<string>;

/**
 * The two ORT files the wasm backend needs: the wasm binary (fetched as
 * data — cross-origin fetch is fine) and the factory .mjs (the proxy worker's
 * script — see `bootstrapWasmPaths`). Matches the transformers.web build
 * (verified in its dist: ort-wasm-simd-threaded.asyncify.{mjs,wasm}).
 */
export function wasmFactoryFiles(): { wasm: string; mjs: string } {
  return {
    wasm: `${ORT_WASM_PATHS}ort-wasm-simd-threaded.asyncify.wasm`,
    mjs: `${ORT_WASM_PATHS}ort-wasm-simd-threaded.asyncify.mjs`,
  };
}

/**
 * Bootstraps the ORT wasm factory as a same-origin blob URL (round-10 fix).
 *
 * The Perchance generator iframe blocks `new Worker()` from cross-origin URLs
 * (proven on-platform: only blob/same-origin workers spawn). ORT's proxy
 * worker script is the wasm factory (.mjs); with `wasmPaths` as a plain CDN
 * string that script URL is cross-origin → the worker dies at spawn →
 * "no available backend found. ERR: [wasm] [object Event]" → every sprite
 * falls back to the platform removal. Fetching the factory from the CDN and
 * handing ORT a blob URL makes the worker script same-origin (allowed). The
 * .wasm binary stays on the CDN — it is fetched (never worker-spawned), and
 * cross-origin fetch with CORS is fine.
 *
 * @returns the wasmPaths object to hand to transformers.js
 */
export async function bootstrapWasmPaths(): Promise<{
  wasm: string;
  mjs: string;
}> {
  const files = wasmFactoryFiles();
  const response = await fetch(files.mjs);
  if (!response.ok) {
    throw new Error(`bg-removal: wasm factory fetch failed (${response.status})`);
  }
  const factoryBlob = await response.blob();
  return { wasm: files.wasm, mjs: URL.createObjectURL(factoryBlob) };
}

/** Loose view over the transformers.js module — keeps the custom-model glue
 * typed without fighting the library's wide public types. */
interface TransformersModule {
  env: {
    backends: {
      onnx: {
        wasm?: {
          numThreads?: number;
          proxy?: boolean;
          wasmPaths?: string | { wasm: string; mjs: string };
        };
      };
    };
  };
  AutoModel: {
    from_pretrained(id: string, options: Record<string, unknown>): Promise<unknown>;
  };
  AutoProcessor: {
    from_pretrained(id: string, options: Record<string, unknown>): Promise<unknown>;
  };
  RawImage: {
    fromURL(url: string): Promise<PngLike>;
    fromTensor(t: unknown): { resize(w: number, h: number): Promise<PngLike> };
  };
}

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

let removerPromise: Promise<BackgroundRemover> | null = null;

/** Kicks off the model load (fire-and-forget). Called at boot in prod. */
export function preloadBackgroundRemoval(): void {
  void getRemover().catch((error) => {
    console.warn(
      "[rpg] bg-removal: model preload failed — the platform fallback will handle removal",
      error,
    );
  });
}

/** Await model availability — the wait queue for in-flight generations. */
export function backgroundRemovalReady(): Promise<void> {
  return getRemover().then(() => undefined);
}

/**
 * Removes the background of a sprite dataUrl. Awaits the singleton model
 * (queue semantics) and rejects on failure — the caller decides the fallback.
 * No-op guard: non-browser environments (node tests) return the input.
 */
export async function removeBackgroundClient(dataUrl: string): Promise<string> {
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return dataUrl;
  }
  const remove = await getRemover();
  return remove(dataUrl);
}

function getRemover(): Promise<BackgroundRemover> {
  if (!removerPromise) {
    removerPromise = createRemover().catch((error) => {
      removerPromise = null; // reset so a later call can retry a transient failure
      throw error;
    });
  }
  return removerPromise;
}

async function createRemover(): Promise<BackgroundRemover> {
  const mod = (await import("@huggingface/transformers")) as unknown as TransformersModule;

  // Single-threaded WASM moved OFF the main thread via the ORT proxy worker:
  // no SharedArrayBuffer / cross-origin isolation required (numThreads=1),
  // and the heavy inference no longer blocks the UI (removal-pipeline-spec
  // §4 — research: ORT docs confirm the proxy worker works without COI).
  // The engine comes from the jsdelivr CDN (ORT_WASM_PATHS) — the Vite-bundled
  // copy is excluded from the Perchance ship (round-6 root cause). Round-10
  // fix: the factory .mjs (the proxy worker script) must be a same-origin
  // blob — the iframe blocks cross-origin `new Worker()` — so we bootstrap it
  // as a blob URL instead of handing ORT the raw CDN path.
  const onnxEnv = mod.env.backends.onnx;
  if (onnxEnv?.wasm) {
    onnxEnv.wasm.numThreads = 1;
    onnxEnv.wasm.proxy = true;
    onnxEnv.wasm.wasmPaths = await bootstrapWasmPaths();
    console.log(
      "[rpg] bg-removal: proxy worker active (wasm proxy=true, numThreads=1, factory blob-bootstrapped)",
    );
  }

  // Model download progress → progress store (removal-pipeline-spec §5.3).
  // transformers.js fires initiate/download/progress/done; cached loads jump
  // straight to done/ready. Progress events update the percentage for the
  // LoadingScreen; the console logs only transitions (progress store).
  const onModelProgress = (info: { status?: string; file?: string; progress?: number }): void => {
    if (info.status === "initiate" || info.status === "download") {
      setModelDownload({ status: "downloading", file: info.file });
    } else if (info.status === "progress" && typeof info.progress === "number") {
      setModelDownload({ status: "downloading", pct: Math.round(info.progress), file: info.file });
    } else if (info.status === "done") {
      setModelDownload({ status: "ready" });
    }
  };

  // RMBG-1.4 is a custom IS-Net architecture — the official demo loads it as
  // a raw ONNX graph via `model_type: "custom"` with an explicit processor.
  console.log("[rpg] bg-removal: model loading… (first visit downloads ~45 MB)");
  const modelStart = performance.now();
  const model = (await mod.AutoModel.from_pretrained("briaai/RMBG-1.4", {
    config: { model_type: "custom" },
    dtype: "q8", // 8-bit quantized (~45 MB) — the in-browser sweet spot
    progress_callback: onModelProgress,
  })) as Model;

  const processor = (await mod.AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
    config: {
      do_normalize: true,
      do_pad: false,
      do_rescale: true,
      do_resize: true,
      image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: "ImageFeatureExtractor",
      image_std: [1, 1, 1],
      resample: 2,
      rescale_factor: 0.00392156862745098,
      size: { width: 1024, height: 1024 },
    },
    progress_callback: onModelProgress,
  })) as Processor;
  // Guarantee the stage clears even if the callback never fired (cached load).
  setModelDownload({ status: "ready" });
  console.log(`[rpg] bg-removal: model ready (${Math.round(performance.now() - modelStart)} ms)`);

  return async (dataUrl: string): Promise<string> => {
    const image = await mod.RawImage.fromURL(dataUrl);
    const { pixel_values } = await processor(image);
    const inferStart = performance.now();
    const { output } = await model({ input: pixel_values });
    console.log(
      `[rpg] bg-removal: inference done (${Math.round(performance.now() - inferStart)} ms)`,
    );
    const maskTensor = output[0];
    if (!maskTensor) throw new Error("bg-removal: empty model output");
    const mask = await mod.RawImage.fromTensor(maskTensor.mul(255).to("uint8")).resize(
      image.width,
      image.height,
    );

    // Composite the mask as the alpha channel over the original pixels.
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("bg-removal: 2d context unavailable");
    ctx.drawImage(image.toCanvas(), 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const alpha = mask.data;
    for (let t = 0; t < alpha.length; ++t) {
      pixels.data[4 * t + 3] = alpha[t] ?? 0;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  };
}
