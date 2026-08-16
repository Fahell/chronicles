import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const configPath = fileURLToPath(new URL("../../vite.config.ts", import.meta.url));
const config = readFileSync(configPath, "utf8");

describe("vite config (round-9 ORT worker fix)", () => {
  it("disables the modulepreload polyfill so the ORT proxy worker can load the transformers chunk", () => {
    // Round-8 finding: with the polyfill ON, rolldown hoists the Vite
    // modulepreload helper (which touches `document`) into the entry chunk,
    // and the lazy transformers chunk imports it. ORT spawns its proxy worker
    // from the transformers chunk URL; the worker loads rpg.js and the
    // polyfill crashes with "document is not defined" → "no available backend
    // found" → permanent platform fallback. modulePreload:false removes the
    // unguarded polyfill (modern Chromium preloads natively).
    expect(config).toMatch(/modulePreload:\s*false/);
  });
});
