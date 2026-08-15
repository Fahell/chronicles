import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveSceneTextures } from "../../src/scene/assets";
import { openPlainsManifest } from "../../src/scene/manifest/openPlains";
import { AssetCache } from "../../src/services/generation";
import type { ImageService } from "../../src/services/perchance-runtime";

describe("resolveSceneTextures (fake-indexeddb)", () => {
  beforeEach(async () => {
    await Dexie.delete("rpg_test_scene");
  });
  afterEach(async () => {
    await Dexie.delete("rpg_test_scene");
  });

  function cache(): AssetCache {
    const service: ImageService = {
      async generate(opts) {
        return { dataUrl: `data:image/png;base64,${opts.prompt.length}:${opts.seed}` };
      },
    };
    return new AssetCache("dev", service, { dbName: "rpg_test_scene" });
  }

  it("resolves floor + backdrop data URLs from the cache", async () => {
    const assets = cache();
    const textures = await resolveSceneTextures(openPlainsManifest, assets);

    expect(textures.backdrop).toMatch(/^data:image\//);
    expect(textures.floor).toMatch(/^data:image\//);
    expect(textures.backdrop).not.toBe(textures.floor);

    // Second call hits the cache (same seeds).
    const again = await resolveSceneTextures(openPlainsManifest, assets);
    expect(again.backdrop).toBe(textures.backdrop);

    await assets.close();
  });

  it("rejects non-type-C manifests", async () => {
    const assets = cache();
    await expect(
      resolveSceneTextures({ ...openPlainsManifest, type: "A" }, assets),
    ).rejects.toThrow(/only type C/);
    await assets.close();
  });
});
