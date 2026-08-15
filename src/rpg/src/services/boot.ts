import type { Stage } from "../render/stage";
import { loadScene as loadSceneImpl } from "../scene/loader";
import { AssetCache } from "./generation";
import { installMockRoot } from "./mock";
import {
  createPlatformRuntime,
  type PerchanceRuntime,
  type RuntimeMode,
} from "./perchance-runtime";

export interface BootServices {
  mode: RuntimeMode;
  /** True when the mock harness is installed (dev only). */
  mocked: boolean;
  runtime: PerchanceRuntime;
  assets: AssetCache;
  /** Loads a scene into the given container (type C slice). */
  loadScene: (
    manifest: unknown,
    container: HTMLElement,
    viewport: { width: number; height: number },
  ) => Promise<Stage>;
}

/**
 * Boots the app services (tech-spec §4.2/§6.1-6.2):
 * - dev: installs the mock as `window.root` before the runtime is created;
 * - creates the platform runtime over `window.root` (mock or real);
 * - creates the mode-scoped asset cache (`rpg_dev` / `rpg` Dexie DBs).
 *
 * The mock gate is INLINE (not a helper) so Vite's static replacement of
 * `import.meta.env.DEV` folds the branch to `false` in production and rollup
 * tree-shakes the mock module out of the shipped bundle (tech-spec §6.2:
 * dev-only). Disable the mock in dev with `VITE_RPG_MOCK=false`.
 */
export function bootServices(): BootServices {
  const mocked = import.meta.env.DEV && import.meta.env.VITE_RPG_MOCK !== "false";
  const mode: RuntimeMode = mocked ? "dev" : "prod";

  if (mocked) {
    installMockRoot();
  }

  const root = window.root;
  if (!root?.generateImage || !root?.generateText) {
    throw new Error(
      "Perchance runtime unavailable: root.generateImage/generateText not found. " +
        "In dev, run with the mock enabled (default); on the platform the plugins are injected.",
    );
  }

  const runtime = createPlatformRuntime(root, mode);
  const assets = new AssetCache(mode, runtime.image);
  const loadScene = (
    manifest: unknown,
    container: HTMLElement,
    viewport: { width: number; height: number },
  ) => loadSceneImpl(manifest, { assets, container, viewport });

  return { mode, mocked, runtime, assets, loadScene };
}
