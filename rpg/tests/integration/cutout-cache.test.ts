import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AssetCache } from "../../src/services/generation";
import type { ImageService } from "../../src/services/perchance-runtime";

describe("CutoutStore (fake-indexeddb)", () => {
  beforeEach(async () => {
    await Dexie.delete("rpg_test_cutout");
  });
  afterEach(async () => {
    await Dexie.delete("rpg_test_cutout");
  });

  function cache(): AssetCache {
    const service: ImageService = {
      async generate(opts) {
        return { dataUrl: `data:image/png;base64,${opts.seed}` };
      },
    };
    return new AssetCache("prod", service, { dbName: "rpg_test_cutout" });
  }

  it("stores and retrieves a cut-out keyed by the raw key", async () => {
    const assets = cache();
    const raw = await assets.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "elder",
      seed: "s1",
    });

    expect(await assets.cutouts.get(raw.key)).toBeUndefined();
    await assets.cutouts.put(raw.key, "data:image/png;base64,CUTOUT");
    expect(await assets.cutouts.get(raw.key)).toBe("data:image/png;base64,CUTOUT");

    await assets.close();
  });

  it("clear() wipes cut-outs too", async () => {
    const assets = cache();
    const raw = await assets.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "elder",
      seed: "s1",
    });
    await assets.cutouts.put(raw.key, "data:image/png;base64,CUTOUT");
    await assets.clear();
    expect(await assets.cutouts.get(raw.key)).toBeUndefined();

    await assets.close();
  });
});
