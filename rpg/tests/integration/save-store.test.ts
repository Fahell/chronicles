import { describe, expect, it } from "vitest";
import { buildIdentity } from "../../src/game/identity";
import { AUTOSAVE_SLOT, MANUAL_SLOTS, SaveStore } from "../../src/game/save/store";
import { RpgDatabase } from "../../src/services/db";

let dbCounter = 0;

async function makeStore() {
  const db = new RpgDatabase("dev", `test_saves_${dbCounter++}`);
  return { db, store: new SaveStore(db) };
}

function identity(name: string) {
  return buildIdentity({
    name,
    archetypeId: "traveler",
    appearanceSeed: `s-${name}`,
    background: { kind: "template", templateId: "bt1" },
  });
}

function save(slotId: string, name: string, updatedAt: number) {
  return {
    slotId,
    identity: identity(name),
    scene: { sceneId: "scene.open.plains", npcId: "npc/knight-1", day: 1, period: "dusk" },
    progress: { talkedTo: [] },
    flags: {},
    updatedAt,
  };
}

describe("SaveStore", () => {
  it("lists saves newest-first and supports get/put/remove", async () => {
    const { db, store } = await makeStore();
    await store.put(save("slot-1", "A", 1));
    await store.put(save("slot-2", "B", 2));
    const saves = await store.list();
    expect(saves.map((s) => s.slotId)).toEqual(["slot-2", "slot-1"]);
    expect((await store.get("slot-1"))?.identity.name).toBe("A");
    await store.remove("slot-1");
    expect(await store.get("slot-1")).toBeUndefined();
    db.close();
  });

  it("reports free manual slots and writes the autosave slot separately", async () => {
    const { db, store } = await makeStore();
    expect(await store.hasFreeManualSlot()).toBe(true);
    expect(await store.nextFreeSlot()).toBe("slot-1");
    for (let i = 0; i < MANUAL_SLOTS; i++) {
      await store.put(save(`slot-${i + 1}`, `N${i}`, i));
    }
    expect(await store.hasFreeManualSlot()).toBe(false);
    expect(await store.nextFreeSlot()).toBeNull();
    await store.saveAutosave(save(AUTOSAVE_SLOT, "Auto", 99));
    expect((await store.get(AUTOSAVE_SLOT))?.identity.name).toBe("Auto");
    db.close();
  });
});
