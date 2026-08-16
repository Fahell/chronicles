import { describe, expect, it } from "vitest";
import { NPC_POOL } from "../../src/content/npcPool";
import { buildIdentity } from "../../src/game/identity";
import { conversationSignal, npcActor, startSession, userActor } from "../../src/game/session";
import { parseSceneManifest } from "../../src/scene/loader";

const identity = buildIdentity({
  name: "Arin",
  archetypeId: "traveler",
  appearanceSeed: "id-testseed",
  background: { kind: "template", templateId: "bt1" },
});

describe("session", () => {
  it("builds a valid dynamic manifest with user + picked NPC actors", () => {
    const npc = NPC_POOL[2]!;
    const save = {
      slotId: "slot-1",
      identity,
      scene: { sceneId: "scene.open.plains", npcId: npc.id, day: 1, period: "dusk" },
      progress: { talkedTo: [] },
      flags: {},
      updatedAt: 1,
    };
    const session = startSession(save);
    const manifest = parseSceneManifest(session.buildManifest());

    expect(manifest.actors.map((a) => a.characterId)).toEqual(["player", npc.id]);
    expect(manifest.actors[0]?.sprite?.seed).toBe(`identity:${identity.appearanceSeed}`);
    expect(manifest.actors[1]?.sprite?.assetKey).toContain(npc.id);
    expect(manifest.effects.some((e) => e.kind === "fog")).toBe(true);
    expect(session.npc.id).toBe(npc.id);
    expect(session.save.slotId).toBe("slot-1");
  });

  it("userActor and npcActor produce stable actor specs", () => {
    const npc = NPC_POOL[0]!;
    expect(userActor(identity).characterId).toBe("player");
    expect(npcActor(npc).characterId).toBe(npc.id);
    // the sprite prompt describes the NPC's look (not the name)
    expect(npcActor(npc).sprite?.prompt).toContain(npc.type);
  });

  it("startSession throws for an unknown NPC id and resets the conversation", () => {
    conversationSignal.value = [{ speaker: "x", text: "y" }];
    const save = {
      slotId: "slot-1",
      identity,
      scene: { sceneId: "s", npcId: "npc/ghost", day: 1, period: "dusk" },
      progress: { talkedTo: [] },
      flags: {},
      updatedAt: 1,
    };
    expect(() => startSession(save)).toThrow(/unknown NPC/i);
    expect(conversationSignal.value).toEqual([]);
  });
});
