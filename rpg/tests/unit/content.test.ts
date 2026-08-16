import { describe, expect, it } from "vitest";
import { ARCHETYPES, archetypeById } from "../../src/content/archetypes";
import { backgroundTemplateById, USER_BACKGROUND_TEMPLATES } from "../../src/content/backgrounds";
import { NPC_POOL, npcById, pickNpc } from "../../src/content/npcPool";
import { PAYLOAD_BACKGROUND_LIMIT } from "../../src/game/identity";

describe("seed content", () => {
  it("has 4 archetypes with unique ids and prompt text", () => {
    expect(ARCHETYPES.length).toBe(4);
    expect(new Set(ARCHETYPES.map((a) => a.id)).size).toBe(4);
    for (const a of ARCHETYPES) {
      expect(a.spritePrompt.length).toBeGreaterThan(50);
      expect(a.appearanceSummary.length).toBeGreaterThan(10);
    }
    expect(archetypeById("traveler")).toBeDefined();
    expect(archetypeById("ghost")).toBeUndefined();
  });

  it("has 3 user background templates within the payload limit", () => {
    expect(USER_BACKGROUND_TEMPLATES.length).toBe(3);
    for (const b of USER_BACKGROUND_TEMPLATES) {
      expect(b.payload.length).toBeLessThanOrEqual(PAYLOAD_BACKGROUND_LIMIT);
      expect(b.ui.length).toBeGreaterThan(b.payload.length);
      expect(backgroundTemplateById(b.id)).toBeDefined();
    }
  });

  it("has 9 NPCs (3 types × 3 backgrounds), ids unique, payloads bounded", () => {
    expect(NPC_POOL.length).toBe(9);
    expect(new Set(NPC_POOL.map((n) => n.id)).size).toBe(9);
    const types = new Set(NPC_POOL.map((n) => n.type));
    expect(types.size).toBe(3);
    // exactly 3 NPCs per type
    for (const type of types) {
      expect(NPC_POOL.filter((n) => n.type === type).length).toBe(3);
    }
    for (const n of NPC_POOL) {
      expect(n.backgroundPayload.length).toBeLessThanOrEqual(PAYLOAD_BACKGROUND_LIMIT);
      expect(n.backgroundUi.length).toBeGreaterThan(n.backgroundPayload.length);
      expect(n.spritePrompt.length).toBeGreaterThan(50);
      expect(n.name).toBeTruthy();
    }
    expect(npcById(NPC_POOL[0]!.id)).toBeDefined();
    expect(npcById("nope")).toBeUndefined();
  });

  it("pickNpc is seeded and returns a pool member", () => {
    const rng = () => 0;
    const a = pickNpc(rng);
    const b = pickNpc(rng);
    expect(a.id).toBe(b.id);
    expect(NPC_POOL.some((n) => n.id === a.id)).toBe(true);
    // a high rng value picks the last member
    expect(pickNpc(() => 0.999).id).toBe(NPC_POOL[NPC_POOL.length - 1]!.id);
  });
});
