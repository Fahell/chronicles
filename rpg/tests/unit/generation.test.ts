import { describe, expect, it } from "vitest";

import { type AssetRequest, assetCacheKey } from "../../src/services/generation";

const base: AssetRequest = {
  entity: "npc/elder",
  pose: "idle",
  prompt: "a kind old innkeeper, pixel art",
  seed: "seed-1",
};

describe("assetCacheKey", () => {
  it("is stable for identical requests", () => {
    expect(assetCacheKey("dev", base)).toBe(assetCacheKey("dev", base));
  });

  it("busts on mode change (dev vs prod)", () => {
    expect(assetCacheKey("dev", base)).not.toBe(assetCacheKey("prod", base));
  });

  it("busts on entity change", () => {
    expect(assetCacheKey("dev", base)).not.toBe(
      assetCacheKey("dev", { ...base, entity: "npc/blacksmith" }),
    );
  });

  it("busts on pose change", () => {
    expect(assetCacheKey("dev", base)).not.toBe(assetCacheKey("dev", { ...base, pose: "angry" }));
  });

  it("busts on seed change (re-roll)", () => {
    expect(assetCacheKey("dev", base)).not.toBe(assetCacheKey("dev", { ...base, seed: "seed-2" }));
  });

  it("busts on prompt change (spec §6.1)", () => {
    expect(assetCacheKey("dev", base)).not.toBe(
      assetCacheKey("dev", { ...base, prompt: "a different prompt" }),
    );
  });

  it("busts on resolution change", () => {
    expect(assetCacheKey("dev", base)).not.toBe(
      assetCacheKey("dev", { ...base, resolution: "768x512" }),
    );
  });

  it("busts on negativePrompt change", () => {
    expect(assetCacheKey("dev", base)).not.toBe(
      assetCacheKey("dev", { ...base, negativePrompt: "blurry, low quality" }),
    );
  });

  it("busts on removeBackground change", () => {
    expect(assetCacheKey("dev", base)).not.toBe(
      assetCacheKey("dev", { ...base, removeBackground: true }),
    );
  });
});
