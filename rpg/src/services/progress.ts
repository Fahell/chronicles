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
  // Dev-only debug handle for CDP validation. Guarded for node (Vitest env
  // has no `window` even though import.meta.env.DEV is true there).
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__rpgProgress = {
      bootProgress,
      removalQueue,
      modelDownload,
      setBootStage,
      setRemovalQueue,
      setModelDownload,
    };
  }
}
