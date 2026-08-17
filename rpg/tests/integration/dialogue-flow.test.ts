import { describe, expect, it } from "vitest";
import { NPC_POOL } from "../../src/content/npcPool";
import { parseChoices } from "../../src/game/dialogue/parse-choices";
import { buildIdentity } from "../../src/game/identity";
import { buildNpcInstruction } from "../../src/game/payload/builder";
import { openPlainsManifest } from "../../src/scene/manifest/openPlains";
import { createMockHarness } from "../../src/services/mock";

const user = buildIdentity({
  name: "Arin",
  archetypeId: "traveler",
  background: { kind: "template", templateId: "bt1" },
});
const npc = NPC_POOL[0]!;
const npc2 = NPC_POOL[1]!;
const day = { day: 1, period: "afternoon" as const, scenesInPeriod: 0 };

describe("multi-turn dialogue loop (service level)", () => {
  it("a choice reply parses and the follow-up generation sees the grown conversation", async () => {
    const { root } = createMockHarness();
    let conversation: { speaker: string; text: string }[] = [];

    // Turn 1: opening with no conversation → mock returns the choice payload.
    const opening = await root.generateText?.({
      instruction: buildNpcInstruction({
        scene: openPlainsManifest,
        npc,
        coPresent: [npc2],
        user,
        conversation,
        language: "English",
        day,
      }),
    });
    const turn1 = parseChoices((opening as { generatedText: string }).generatedText);
    expect(turn1.options.length).toBeGreaterThanOrEqual(1);
    conversation = [
      { speaker: "player", text: turn1.options[0]! },
      { speaker: npc.name, text: turn1.dialogue },
    ];

    // Turn 2: the follow-up sees the choice in the conversation.
    const follow = await root.generateText?.({
      instruction: buildNpcInstruction({
        scene: openPlainsManifest,
        npc,
        coPresent: [npc2],
        user,
        conversation,
        language: "English",
        day,
      }),
    });
    const followText = (follow as { generatedText: string }).generatedText;
    const turn2 = parseChoices(followText);
    expect(turn2.dialogue.length).toBeGreaterThan(0);

    // The payload for the follow-up actually contained the player's choice.
    const instruction2 = buildNpcInstruction({
      scene: openPlainsManifest,
      npc,
      coPresent: [npc2],
      user,
      conversation,
      language: "English",
      day,
    });
    expect(instruction2).toContain(turn1.options[0]!);
    expect(instruction2).toContain("player");
  });
});
