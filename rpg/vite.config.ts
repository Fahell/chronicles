import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

/**
 * Vite config per tech-spec §4.1.
 * - base './' so emitted asset URLs are relative (works inside the Perchance iframe).
 * - build.outDir 'build' → rpg/build/ (the committed ship artifact).
 * - Entry naming matches the platform shell reference: rpg.js / rpg.css.
 * - three.js is loaded via dynamic import() in the app, so it lands in a lazy chunk.
 */
export default defineConfig({
  base: "./",
  plugins: [preact()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    target: "es2022",
    // Round-9 ORT fix: with the polyfill ON, rolldown hoists the Vite
    // modulepreload helper (which touches `document`) into the entry chunk
    // (rpg.js), and the lazy transformers chunk imports it. When ORT spawns
    // its proxy worker from the transformers chunk URL, the worker loads
    // rpg.js and the polyfill crashes with "document is not defined" (round-8
    // finding: no available backend found / [wasm] [object Event]). The
    // polyfill only matters for old browsers' modulepreload support — modern
    // Chrome handles it natively, and the platform runs a recent Chromium.
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: "rpg.js",
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith(".css") ? "rpg.css" : "assets/[name]-[hash][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
