import { describe, expect, it } from "vitest";
import { buildDayRecap } from "../../src/game/day/recap";
import {
  BATCH_CHARS_LIMIT,
  MAX_SCORING_ATTEMPTS,
  runEndOfDay,
  USER_NODE,
} from "../../src/game/day/run";
import { LogStore } from "../../src/game/logs/store";
import { tierOf } from "../../src/game/relationships/graph";
import { RelationshipStore } from "../../src/game/relationships/store";
import { RpgDatabase } from "../../src/services/db";
import { createMockHarness } from "../../src/services/mock";
import { createPlatformRuntime } from "../../src/services/perchance-runtime";

function freshDb(): RpgDatabase {
  return new RpgDatabase("dev", `test-run-${Math.random().toString(36).slice(2)}`);
}

/** A typed TextService backed by the mock root (so `{text}` matches). */
function mockRuntime(script: Parameters<typeof createMockHarness>[0]) {
  const harness = createMockHarness(script);
  return { harness, text: createPlatformRuntime(harness.root, "dev").text };
}

/** One valid scoring block for the named NPC (with the `--- <name>` header). */
function block(name: string, userToNpc: number, npcToUser: number, memory: string): string {
  const u = userToNpc > 0 ? `+${userToNpc}` : String(userToNpc);
  const n = npcToUser > 0 ? `+${npcToUser}` : String(npcToUser);
  return `--- ${name}
user->npc: ${u}
npc->user: ${n}
reason: They talked by the fire.
day-memory: ${memory}`;
}

const SCORING_SCRIPT = (reply: string | string[]) => ({
  entries: [{ match: /world-scoring/, reply }],
  defaultReply: "",
});

async function seedDayLog(db: RpgDatabase, slot: string, npc: string, dayId = 1) {
  const logs = new LogStore(db);
  await logs.append({
    slotId: slot,
    characterId: npc,
    type: "turn",
    owner: "npc",
    dayId,
    period: "afternoon",
    text: "Greetings, traveler.",
  });
  await logs.append({
    slotId: slot,
    characterId: npc,
    type: "action",
    owner: "user",
    dayId,
    period: "afternoon",
    text: "Ask about the ruins.",
  });
  return logs;
}

const npcs = (logs: LogStore, slot: string, ids: string[]) =>
  Promise.all(
    ids.map(async (id) => ({
      characterId: id,
      npcName: id.replace("npc/", ""),
      entries: await logs.dayLog(slot, id, 1),
    })),
  );

describe("end-of-day run (day-cycle-spec §5)", () => {
  it("single NPC: scores both directions, applies deltas and stores the summary", async () => {
    const { harness, text } = mockRuntime({
      script: SCORING_SCRIPT(block("Elder", 3, -1, "The traveler asked about my brother.")),
    });
    const db = freshDb();
    const logs = await seedDayLog(db, "slot-1", "npc/elder");
    const bonds = new RelationshipStore(db);

    const result = await runEndOfDay(
      { text, logs, bonds },
      {
        slotId: "slot-1",
        dayId: 1,
        period: "afternoon",
        npcs: await npcs(logs, "slot-1", ["npc/elder"]),
      },
    );

    expect(result.npcs).toHaveLength(1);
    const r = result.npcs[0]!;
    expect(r.userToNpc).toBe(3);
    expect(r.npcToUser).toBe(-1);
    expect(r.dayMemory).toContain("brother");
    expect(r.attempts).toBe(0);

    expect((await bonds.get("slot-1", USER_NODE, "npc/elder"))?.intensity).toBe(3);
    expect((await bonds.get("slot-1", "npc/elder", USER_NODE))?.intensity).toBe(-1);
    expect(tierOf((await bonds.get("slot-1", USER_NODE, "npc/elder"))!.intensity)).toBe("stranger");

    const pile = await logs.summariesFor("slot-1", "npc/elder");
    expect(pile).toHaveLength(1);
    expect(pile[0]?.scoreUserToNpc).toBe(3);

    const events = (await logs.allForSlot("slot-1")).filter((e) => e.type === "relation-event");
    expect(events).toHaveLength(1);
    expect(events[0]?.text).toContain("user→npc/elder 3");

    expect(harness.control.calls).toHaveLength(1);
    expect(harness.control.calls[0]?.input).toContain("Ask about the ruins.");
  });

  it("two NPCs share ONE batched call, each with a separated block, both scored", async () => {
    const { harness, text } = mockRuntime({
      script: {
        entries: [
          {
            match: /world-scoring/,
            reply: [
              block("Elder", 3, -1, "We talked about the ruins."),
              block("Rinn", 0, 2, "The traveler listened to my story."),
            ].join("\n"),
          },
        ],
        defaultReply: "",
      },
    });
    const db = freshDb();
    const logs = new LogStore(db);
    await seedDayLog(db, "slot-1", "npc/elder");
    await seedDayLog(db, "slot-1", "npc/rinn");
    const bonds = new RelationshipStore(db);

    const result = await runEndOfDay(
      { text, logs, bonds },
      {
        slotId: "slot-1",
        dayId: 1,
        period: "afternoon",
        npcs: await npcs(logs, "slot-1", ["npc/elder", "npc/rinn"]),
      },
    );

    expect(result.npcs).toHaveLength(2);
    const elder = result.npcs.find((n) => n.characterId === "npc/elder")!;
    const rinn = result.npcs.find((n) => n.characterId === "npc/rinn")!;
    expect(elder.userToNpc).toBe(3);
    expect(elder.npcToUser).toBe(-1);
    expect(rinn.userToNpc).toBe(0);
    expect(rinn.npcToUser).toBe(2);

    // exactly ONE call for both NPCs (§5.2 batching)
    expect(harness.control.calls).toHaveLength(1);
    expect(harness.control.calls[0]?.input).toContain("npc/elder");
    expect(harness.control.calls[0]?.input).toContain("npc/rinn");

    expect((await bonds.get("slot-1", USER_NODE, "npc/elder"))?.intensity).toBe(3);
    expect((await bonds.get("slot-1", "npc/rinn", USER_NODE))?.intensity).toBe(2);
    expect(await logs.summariesFor("slot-1", "npc/elder")).toHaveLength(1);
    expect(await logs.summariesFor("slot-1", "npc/rinn")).toHaveLength(1);
  });

  it("oversized combined logs split into one call per NPC (§5.2 safety check)", async () => {
    const { harness, text } = mockRuntime({
      script: {
        entries: [
          { match: /world-scoring/, reply: block("Elder", 1, 1, "A long day.") },
          { match: /world-scoring/, reply: block("Rinn", -1, -1, "A quiet day.") },
        ],
        defaultReply: "",
      },
    });
    const db = freshDb();
    const logs = new LogStore(db);
    // fill each NPC's log past half the batch limit so the combined size trips it
    const big = "x".repeat(Math.ceil(BATCH_CHARS_LIMIT / 2) + 100);
    await logs.append({
      slotId: "slot-1",
      characterId: "npc/elder",
      type: "turn",
      owner: "npc",
      dayId: 1,
      period: "afternoon",
      text: big,
    });
    await logs.append({
      slotId: "slot-1",
      characterId: "npc/rinn",
      type: "turn",
      owner: "npc",
      dayId: 1,
      period: "afternoon",
      text: big,
    });
    const bonds = new RelationshipStore(db);

    const result = await runEndOfDay(
      { text, logs, bonds },
      {
        slotId: "slot-1",
        dayId: 1,
        period: "afternoon",
        npcs: await npcs(logs, "slot-1", ["npc/elder", "npc/rinn"]),
      },
    );

    expect(result.npcs).toHaveLength(2);
    expect(harness.control.calls).toHaveLength(2); // one call per NPC
    expect(harness.control.calls[0]?.input).toContain("npc/elder");
    expect(harness.control.calls[0]?.input).not.toContain("npc/rinn");
    expect(harness.control.calls[1]?.input).toContain("npc/rinn");
  });

  it("re-calls on malformed output (bounded) until a valid parse", async () => {
    const malformed = "not the format at all";
    const { harness, text } = mockRuntime({
      script: SCORING_SCRIPT([malformed, block("Elder", 3, -1, "We talked.")]),
    });
    const db = freshDb();
    const logs = await seedDayLog(db, "slot-1", "npc/elder");
    const bonds = new RelationshipStore(db);

    const result = await runEndOfDay(
      { text, logs, bonds },
      {
        slotId: "slot-1",
        dayId: 1,
        period: "afternoon",
        npcs: await npcs(logs, "slot-1", ["npc/elder"]),
      },
    );

    expect(result.npcs[0]?.attempts).toBe(1); // one failed + one success
    expect(result.npcs[0]?.userToNpc).toBe(3);
    expect(harness.control.calls).toHaveLength(2);
  });

  it("exhausts the re-call cap → no score for the day, recorded, edges untouched", async () => {
    const { harness, text } = mockRuntime({ script: SCORING_SCRIPT("garbage output") });
    const db = freshDb();
    const logs = await seedDayLog(db, "slot-1", "npc/elder");
    const bonds = new RelationshipStore(db);

    const result = await runEndOfDay(
      { text, logs, bonds },
      {
        slotId: "slot-1",
        dayId: 1,
        period: "afternoon",
        npcs: await npcs(logs, "slot-1", ["npc/elder"]),
      },
    );

    const r = result.npcs[0]!;
    expect(r.userToNpc).toBeNull();
    expect(r.npcToUser).toBeNull();
    expect(r.dayMemory).toBeNull();
    expect(r.attempts).toBe(MAX_SCORING_ATTEMPTS);
    expect(harness.control.calls).toHaveLength(MAX_SCORING_ATTEMPTS);

    expect(await bonds.get("slot-1", USER_NODE, "npc/elder")).toBeUndefined();
    expect(await bonds.get("slot-1", "npc/elder", USER_NODE)).toBeUndefined();
    expect(await logs.summariesFor("slot-1", "npc/elder")).toEqual([]);
    const events = (await logs.allForSlot("slot-1")).filter((e) => e.type === "relation-event");
    expect(events[0]?.text).toContain("malformed");
  });

  it("a batch is rejected whole when ANY block is malformed (re-call covers the batch)", async () => {
    const good = block("Elder", 3, -1, "We talked.");
    const bad = "--- Rinn\nuser->npc: not-a-number\nnpc->user: 0\nreason: x\nday-memory: y";
    const { harness, text } = mockRuntime({
      script: SCORING_SCRIPT([`${good}\n${bad}`, `${good}\n${block("Rinn", 0, 1, "Ok.")}`]),
    });
    const db = freshDb();
    const logs = new LogStore(db);
    await seedDayLog(db, "slot-1", "npc/elder");
    await seedDayLog(db, "slot-1", "npc/rinn");
    const bonds = new RelationshipStore(db);

    const result = await runEndOfDay(
      { text, logs, bonds },
      {
        slotId: "slot-1",
        dayId: 1,
        period: "afternoon",
        npcs: await npcs(logs, "slot-1", ["npc/elder", "npc/rinn"]),
      },
    );

    expect(harness.control.calls).toHaveLength(2);
    const elder = result.npcs.find((n) => n.characterId === "npc/elder")!;
    const rinn = result.npcs.find((n) => n.characterId === "npc/rinn")!;
    // second attempt parsed both blocks
    expect(elder.userToNpc).toBe(3);
    expect(rinn.userToNpc).toBe(0);
  });

  it("buildDayRecap maps deltas to qualitative phrases, never raw numbers", () => {
    const recap = buildDayRecap([
      {
        characterId: "npc/a",
        npcName: "A",
        userToNpc: 3,
        npcToUser: 1,
        reason: "x",
        dayMemory: "We talked.",
        attempts: 0,
      },
      {
        characterId: "npc/b",
        npcName: "B",
        userToNpc: -2,
        npcToUser: -1,
        reason: "x",
        dayMemory: null,
        attempts: 0,
      },
      {
        characterId: "npc/c",
        npcName: "C",
        userToNpc: 0,
        npcToUser: 0,
        reason: "x",
        dayMemory: "Hi.",
        attempts: 0,
      },
      {
        characterId: "npc/d",
        npcName: "D",
        userToNpc: null,
        npcToUser: null,
        reason: "malformed",
        dayMemory: null,
        attempts: 3,
      },
    ]);
    expect(recap.map((r) => r.change)).toEqual(["closer", "apart", "unchanged", "unchanged"]);
    expect(recap[0]?.memory).toBe("We talked.");
    expect(recap[1]?.memory).toBeNull();
    for (const entry of recap) {
      expect(entry.change).not.toMatch(/\d/);
    }
  });
});
