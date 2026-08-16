import { describe, expect, it } from "vitest";

import { CUTOUT_PIPELINE_VERSION, cutoutCacheKey } from "../../src/services/cutout-cache";

describe("cutoutCacheKey", () => {
  it("derives the cut-out key from the raw key + pipeline version", () => {
    expect(cutoutCacheKey("prod|npc/elder|idle|seed|hash|512x768|rb")).toBe(
      `prod|npc/elder|idle|seed|hash|512x768|rb|cutout|${CUTOUT_PIPELINE_VERSION}`,
    );
  });

  it("busts when the raw key changes (prompt/seed/resolution bust)", () => {
    expect(cutoutCacheKey("a")).not.toBe(cutoutCacheKey("b"));
  });

  it("busts when the pipeline version changes", () => {
    expect(cutoutCacheKey("raw").includes(CUTOUT_PIPELINE_VERSION)).toBe(true);
    expect(cutoutCacheKey("raw").includes("rmbg-q8-v1")).toBe(true);
  });
});
