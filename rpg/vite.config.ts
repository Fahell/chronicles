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
