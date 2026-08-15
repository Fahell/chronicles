import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AssetCache } from "../../src/services/generation";
import type { ImageService } from "../../src/services/perchance-runtime";

const dbNames = ["rpg_dev", "rpg", "rpg_test_dev", "rpg_test_prod"];

describe("AssetCache (fake-indexeddb)", () => {
  beforeEach(async () => {
    for (const name of dbNames) {
      await Dexie.delete(name);
    }
  });

  afterEach(async () => {
    for (const name of dbNames) {
      await Dexie.delete(name);
    }
  });

  function fakeImage(): { service: ImageService; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      service: {
        async generate(opts) {
          calls.push(opts.prompt);
          return { dataUrl: `data:image/png;base64,${opts.prompt.length}` };
        },
      },
    };
  }

  it("generates on miss and serves from cache on hit", async () => {
    const { service, calls } = fakeImage();
    const cache = new AssetCache("dev", service, { dbName: "rpg_test_dev" });

    const first = await cache.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "p",
      seed: "s",
    });
    const second = await cache.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "p",
      seed: "s",
    });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.dataUrl).toBe(first.dataUrl);
    expect(calls).toHaveLength(1);
    expect(cache.log.map((e) => e.kind)).toEqual(["miss", "hit"]);

    await cache.close();
  });

  it("regenerates with a new seed producing a new cached entry", async () => {
    const { service, calls } = fakeImage();
    const cache = new AssetCache("dev", service, { dbName: "rpg_test_dev" });

    await cache.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "p",
      seed: "s",
    });
    const rerolled = await cache.regenerate({ entity: "npc/elder", pose: "idle", prompt: "p" });

    expect(rerolled.fromCache).toBe(false);
    expect(calls).toHaveLength(2);
    expect(await cache.count()).toBe(2);
    expect(cache.log.some((e) => e.kind === "regenerate")).toBe(true);

    await cache.close();
  });

  it("clear empties the cache", async () => {
    const { service, calls } = fakeImage();
    const cache = new AssetCache("dev", service, { dbName: "rpg_test_dev" });

    await cache.getOrGenerate({ entity: "npc/elder", pose: "idle", prompt: "p", seed: "s" });
    await cache.clear();
    const after = await cache.getOrGenerate({
      entity: "npc/elder",
      pose: "idle",
      prompt: "p",
      seed: "s",
    });

    expect(after.fromCache).toBe(false);
    expect(calls).toHaveLength(2);

    await cache.close();
  });

  it("keeps dev and prod caches isolated", async () => {
    const devImage = fakeImage();
    const prodImage = fakeImage();
    const dev = new AssetCache("dev", devImage.service, { dbName: "rpg_test_dev" });
    const prod = new AssetCache("prod", prodImage.service, { dbName: "rpg_test_prod" });

    const req = { entity: "npc/elder", pose: "idle", prompt: "p", seed: "s" };
    await dev.getOrGenerate(req);
    await prod.getOrGenerate(req);

    expect(devImage.calls).toHaveLength(1);
    expect(prodImage.calls).toHaveLength(1);

    // Second calls still miss (isolated DBs).
    await dev.getOrGenerate(req);
    await prod.getOrGenerate(req);
    expect(devImage.calls).toHaveLength(1);
    expect(prodImage.calls).toHaveLength(1);

    await dev.close();
    await prod.close();
  });

  it("surfaces generate errors without caching a partial result", async () => {
    const service: ImageService = {
      async generate() {
        throw new Error("mock generateImage: injected failure");
      },
    };
    const cache = new AssetCache("dev", service, { dbName: "rpg_test_dev" });

    await expect(
      cache.getOrGenerate({ entity: "npc/elder", pose: "idle", prompt: "p", seed: "s" }),
    ).rejects.toThrow(/injected failure/);
    expect(await cache.count()).toBe(0);

    await cache.close();
  });
});
