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
 * - Deterministic threading: `numThreads = 1` + `proxy = false` — no
 *   SharedArrayBuffer / cross-origin isolation and no worker dependency,
 *   which is the robust profile inside the Perchance generator iframe.
 * - Failure: `remove()` rejects; the caller falls back to the platform's
 *   removeBackground (see scene/assets.ts).
 */

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

/** Loose view over the transformers.js module — keeps the custom-model glue
 * typed without fighting the library's wide public types. */
interface TransformersModule {
  env: {
    backends: {
      onnx: { wasm?: { numThreads?: number; proxy?: boolean } };
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

let removerPromise: Promise<BackgroundRemover> | null = null;

/** Kicks off the model load (fire-and-forget). Called at boot in prod. */
export function preloadBackgroundRemoval(): void {
  void getRemover();
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
  const onnxEnv = mod.env.backends.onnx;
  if (onnxEnv?.wasm) {
    onnxEnv.wasm.numThreads = 1;
    onnxEnv.wasm.proxy = true;
    console.log("[rpg] bg-removal: proxy worker active (wasm proxy=true, numThreads=1)");
  }

  // RMBG-1.4 is a custom IS-Net architecture — the official demo loads it as
  // a raw ONNX graph via `model_type: "custom"` with an explicit processor.
  console.log("[rpg] bg-removal: model loading… (first visit downloads ~42 MB)");
  const modelStart = performance.now();
  const model = (await mod.AutoModel.from_pretrained("briaai/RMBG-1.4", {
    config: { model_type: "custom" },
    dtype: "q8", // 8-bit quantized (~45 MB) — the in-browser sweet spot
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
  })) as Processor;
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
