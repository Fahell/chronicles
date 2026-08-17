import { describe, expect, it } from "vitest";
import { LogStore } from "../../src/game/logs/store";
import { applyDelta, defaultBond, tierOf } from "../../src/game/relationships/graph";
import { RelationshipStore } from "../../src/game/relationships/store";
import { RpgDatabase } from "../../src/services/db";

function freshDb(): RpgDatabase {
  return new RpgDatabase("dev", `test-logs-${Math.random().toString(36).slice(2)}`);
}

describe("LogStore (day-cycle-spec §4)", () => {
  it("appends raw entries with computed chars and reads the day log view", async () => {
    const db = freshDb();
    const logs = new LogStore(db);
    const slot = "slot-1";
    const npc = "npc/elder";

    await logs.append({
      slotId: slot,
      characterId: npc,
      type: "scene",
      owner: "world",
      dayId: 1,
      period: "afternoon",
      text: "Entered scene.open.plains (day 1, afternoon).",
    });
    await logs.append({
      slotId: slot,
      characterId: npc,
      type: "turn",
      owner: "npc",
      dayId: 1,
      period: "afternoon",
      text: "Greetings, traveler.",
    });
    await logs.append({
      slotId: slot,
      characterId: npc,
      type: "action",
      owner: "user",
      dayId: 1,
      period: "afternoon",
      text: "Ask about the ruins.",
    });
    await logs.append({
      slotId: slot,
      characterId: npc,
      type: "turn",
      owner: "npc",
      dayId: 2,
      period: "morning",
      text: "A new day.",
    });

    const dayLog = await logs.dayLog(slot, npc, 1);
    // the day log view is the turn/action entries of that day, oldest first
    expect(dayLog.map((e) => e.type)).toEqual(["turn", "action"]);
    expect(dayLog[0]?.chars).toBe("Greetings, traveler.".length);

    const recent = await logs.recent(slot, npc, 10);
    expect(recent.map((e) => e.dayId)).toEqual([1, 1, 1, 2]);

    // save lifecycle: deleting the slot deletes its logs
    await logs.removeSlot(slot);
    expect(await logs.allForSlot(slot)).toEqual([]);
  });

  it("stores daily summaries per character", async () => {
    const db = freshDb();
    const logs = new LogStore(db);
    const slot = "slot-1";
    const npc = "npc/elder";

    await logs.putSummary({
      slotId: slot,
      dayId: 1,
      characterId: npc,
      summary: "The traveler asked about my brother.",
      scoreUserToNpc: 3,
      scoreNpcToUser: -1,
      reason: "She softened.",
    });
    await logs.putSummary({
      slotId: slot,
      dayId: 2,
      characterId: npc,
      summary: "A quiet day.",
      scoreUserToNpc: 0,
      scoreNpcToUser: 0,
      reason: "Nothing notable.",
    });

    const pile = await logs.summariesFor(slot, npc);
    expect(pile.map((s) => s.dayId)).toEqual([1, 2]);
    expect(pile[0]?.scoreUserToNpc).toBe(3);

    await logs.removeSlot(slot);
    expect(await logs.summariesFor(slot, npc)).toEqual([]);
  });
});

describe("RelationshipStore (relationships-spec §2, §8)", () => {
  it("applyDelta creates the edge at zero and clamps deltas", async () => {
    const db = freshDb();
    const bonds = new RelationshipStore(db);
    const slot = "slot-1";

    expect(await bonds.get(slot, "player", "npc/elder")).toBeUndefined();

    const after = await bonds.applyDelta(slot, "player", "npc/elder", 3);
    // born neutral (friendship) but the delta is already applied
    expect(after).toEqual({ ...defaultBond("player", "npc/elder"), intensity: 3 });
    expect(tierOf(after.intensity)).toBe("stranger");

    // a second delta accumulates
    const again = await bonds.applyDelta(slot, "player", "npc/elder", 60);
    expect(again.intensity).toBe(63);
    expect(tierOf(again.intensity)).toBe("close-friend");

    // clamps to the web bounds
    const clamped = await bonds.applyDelta(slot, "player", "npc/elder", 500);
    expect(clamped.intensity).toBe(100);
  });

  it("stores both directions independently and lists edges touching a character", async () => {
    const db = freshDb();
    const bonds = new RelationshipStore(db);
    const slot = "slot-1";
    const npc = "npc/elder";

    await bonds.applyDelta(slot, "player", npc, 10);
    await bonds.applyDelta(slot, npc, "player", -30);
    await bonds.applyDelta(slot, npc, "npc/mira", 20);

    const userSide = await bonds.get(slot, "player", npc);
    const npcSide = await bonds.get(slot, npc, "player");
    expect(userSide?.intensity).toBe(10);
    expect(npcSide?.intensity).toBe(-30);

    const touching = await bonds.edgesFor(slot, npc);
    expect(touching).toHaveLength(3);

    // save lifecycle cleanup
    await bonds.removeSlot(slot);
    expect(await bonds.edgesFor(slot, npc)).toEqual([]);
  });

  it("applyDelta can set the bond type on an existing edge", async () => {
    const db = freshDb();
    const bonds = new RelationshipStore(db);
    const slot = "slot-1";

    await bonds.applyDelta(slot, "a", "b", 1);
    const updated = await bonds.applyDelta(slot, "a", "b", 2, "romance");
    expect(updated.type).toBe("romance");
    expect((await bonds.get(slot, "a", "b"))?.type).toBe("romance");
  });

  it("applyDelta clamps via the pure graph helper", () => {
    const bond = defaultBond("a", "b");
    expect(applyDelta(bond, 200).intensity).toBe(100);
    expect(applyDelta(bond, -200).intensity).toBe(-100);
  });
});
