import { describe, expect, it } from "vitest";

import { ORT_WASM_PATHS } from "../../src/services/bg-removal";

describe("ORT_WASM_PATHS (CDN wasm pin)", () => {
  it("points at the jsdelivr dist folder for the bundled onnxruntime-web", () => {
    expect(ORT_WASM_PATHS).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^/]+\/dist\/$/,
    );
    // Must match the lockfile — bump together with transformers.js upgrades.
    expect(ORT_WASM_PATHS).toContain("onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/");
  });
});
