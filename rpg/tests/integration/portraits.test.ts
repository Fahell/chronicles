import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensurePortrait, portraitFor, portraitsSignal } from "../../src/game/portraits";
import type { GameSession } from "../../src/game/session";
import { resolvePortrait } from "../../src/scene/assets";
import { AssetCache } from "../../src/services/generation";
import type { ImageOpts, ImageService } from "../../src/services/perchance-runtime";

const dbName = "rpg_test_portraits";

describe("portraits (round 10)", () => {
  beforeEach(async () => {
    await Dexie.delete(dbName);
    portraitsSignal.value = {};
  });

  afterEach(async () => {
    await Dexie.delete(dbName);
    portraitsSignal.value = {};
  });

  function fakeImage(): { service: ImageService; opts: ImageOpts[] } {
    const opts: ImageOpts[] = [];
    return {
      opts,
      service: {
        async generate(o) {
          opts.push(o);
          return { dataUrl: `data:image/png;base64,portrait:${o.prompt.length}:${o.seed}` };
        },
      },
    };
  }

  it("resolvePortrait caches under the portrait pose and never sets removeBackground", async () => {
    const { service, opts } = fakeImage();
    const cache = new AssetCache("dev", service, { dbName });
    const req = { entity: "player", seed: "identity:s1", prompt: "Bust portrait P" };

    const first = await resolvePortrait(cache, req);
    const second = await resolvePortrait(cache, req);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(opts).toHaveLength(1); // second was a cache hit
    expect(opts[0]!.removeBackground).toBeUndefined();
    expect(opts[0]!.resolution).toBe("512x768");
    await cache.close();
  });

  it("a different seed generates a fresh portrait (re-roll busts the key)", async () => {
    const { service, opts } = fakeImage();
    const cache = new AssetCache("dev", service, { dbName });
    const req = { entity: "npc/elder", seed: "v1", prompt: "P" };

    const first = await resolvePortrait(cache, req);
    const rerolled = await resolvePortrait(cache, { ...req, seed: "rr-1" });

    expect(rerolled).not.toBe(first);
    expect(opts).toHaveLength(2);
    await cache.close();
  });

  it("ensurePortrait writes the portrait into the portraits signal", async () => {
    const { service } = fakeImage();
    const cache = new AssetCache("dev", service, { dbName });

    await ensurePortrait(cache, { entity: "npc/elder", seed: "s", prompt: "P" });
    expect(portraitsSignal.value["npc/elder"]).toBeTruthy();
    await cache.close();
  });

  it("portraitFor maps speaker names to the right portrait (NPC, user, narrator)", async () => {
    const session = {
      npc: { id: "npc/serran", name: "Serran" },
      save: { identity: { name: "Arin" } },
    } as unknown as GameSession;

    portraitsSignal.value = { "npc/serran": "data:portrait/npc", player: "data:portrait/player" };

    expect(portraitFor("Serran", session)).toBe("data:portrait/npc");
    expect(portraitFor("Arin", session)).toBe("data:portrait/player");
    expect(portraitFor("Narrator", session)).toBeNull();
    expect(portraitFor("Nobody", session)).toBeNull();
  });
});
