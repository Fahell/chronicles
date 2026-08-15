import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, mergeConfig } from "vite";

import baseConfig from "./vite.config";

/**
 * Bundle analysis (tech-spec §9 soft gate — ≤500 KB gzipped initial bundle).
 * Run with `pnpm analyze`; emits a treemap at build/bundle-report.html so we
 * can see where the weight is (PixiJS + Preact + i18next + Dexie in the main
 * chunk, three.js lazy).
 *
 * Kept as a separate config so the normal `pnpm build` stays clean — the
 * visualizer plugin is only active here.
 */
export default defineConfig(
  mergeConfig(
    baseConfig,
    defineConfig({
      plugins: [
        visualizer({
          // NOT inside build/ — that directory is the Perchance upload set.
          filename: "reports/bundle.html",
          gzipSize: true,
          brotliSize: true,
        }),
      ],
    }),
  ),
);
