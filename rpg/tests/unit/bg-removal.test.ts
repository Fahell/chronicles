import { describe, expect, it } from "vitest";

import { ORT_WASM_PATHS, wasmFactoryFiles } from "../../src/services/bg-removal";

describe("ORT_WASM_PATHS (CDN wasm pin)", () => {
  it("points at the jsdelivr dist folder for the bundled onnxruntime-web", () => {
    expect(ORT_WASM_PATHS).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^/]+\/dist\/$/,
    );
    // Must match the lockfile — bump together with transformers.js upgrades.
    expect(ORT_WASM_PATHS).toContain("onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/");
  });

  it("wasmFactoryFiles returns the asyncify pair the transformers.web build uses", () => {
    const { wasm, mjs } = wasmFactoryFiles();
    expect(wasm).toBe(`${ORT_WASM_PATHS}ort-wasm-simd-threaded.asyncify.wasm`);
    expect(mjs).toBe(`${ORT_WASM_PATHS}ort-wasm-simd-threaded.asyncify.mjs`);
    // The mjs is the proxy-worker script — it must be blob-bootstrapped to
    // a same-origin URL (round-10: cross-origin `new Worker()` is blocked in
    // the Perchance iframe).
    expect(mjs).not.toBe(wasm);
  });
});
