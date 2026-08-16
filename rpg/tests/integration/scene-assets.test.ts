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

  function cache(): { assets: AssetCache; seen: Array<{ prompt: string; resolution?: string }> } {
    const seen: Array<{ prompt: string; resolution?: string }> = [];
    const service: ImageService = {
      async generate(opts) {
        seen.push({ prompt: opts.prompt, resolution: opts.resolution });
        return { dataUrl: `data:image/png;base64,${opts.prompt.length}:${opts.seed}` };
      },
    };
    return { assets: new AssetCache("dev", service, { dbName: "rpg_test_scene" }), seen };
  }

  it("resolves floor + backdrop + actor portraits from the cache", async () => {
    const { assets, seen } = cache();
    const textures = await resolveSceneTextures(openPlainsManifest, assets);

    expect(textures.backdrop).toMatch(/^data:image\//);
    expect(textures.floor).toMatch(/^data:image\//);
    expect(textures.backdrop).not.toBe(textures.floor);

    // Actor portraits resolved per characterId, at portrait resolution.
    expect(textures.actors["npc/elder"]).toMatch(/^data:image\//);
    expect(textures.actors.player).toMatch(/^data:image\//);
    expect(textures.actors["npc/elder"]).not.toBe(textures.actors.player);

    // Planes request landscape 768×512 (1:1 with the 3:2 frame); characters
    // request portrait 512×768.
    const planeCalls = seen.filter((s) => s.resolution === "768x512");
    const actorCalls = seen.filter((s) => s.resolution === "512x768");
    expect(planeCalls).toHaveLength(2);
    expect(actorCalls).toHaveLength(2);

    // Second call hits the cache (same seeds).
    const again = await resolveSceneTextures(openPlainsManifest, assets);
    expect(again.backdrop).toBe(textures.backdrop);
    expect(again.actors["npc/elder"]).toBe(textures.actors["npc/elder"]);

    await assets.close();
  });

  it("busts the cache when the plane resolution changes", async () => {
    const { assets, seen } = cache();
    await resolveSceneTextures(openPlainsManifest, assets);
    const first = seen.length;

    // Same manifest, second run — everything hits the cache (no new calls).
    await resolveSceneTextures(openPlainsManifest, assets);
    expect(seen.length).toBe(first);

    // A manifest with a different backdrop prompt regenerates (key bust).
    const variant = {
      ...openPlainsManifest,
      backdrop: { ...openPlainsManifest.backdrop, prompt: "a different twilight sky" },
    };
    await resolveSceneTextures(variant, assets);
    expect(seen.length).toBeGreaterThan(first);

    await assets.close();
  });

  it("rejects non-type-C manifests", async () => {
    const { assets } = cache();
    await expect(
      resolveSceneTextures({ ...openPlainsManifest, type: "A" }, assets),
    ).rejects.toThrow(/only type C/);
    await assets.close();
  });
});
