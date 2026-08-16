import { describe, expect, it } from "vitest";
import { NPC_POOL } from "../../src/content/npcPool";
import { buildIdentity } from "../../src/game/identity";
import {
  buildNarratorInstruction,
  buildNpcInstruction,
  languageDirective,
  PAYLOAD_BUDGET,
  trimConversation,
} from "../../src/game/payload/builder";
import { openPlainsManifest } from "../../src/scene/manifest/openPlains";

const user = buildIdentity({
  name: "Arin",
  archetypeId: "traveler",
  background: { kind: "template", templateId: "bt1" },
});
const npc = NPC_POOL[0]!;

describe("payload builder", () => {
  it("language directive is present and language-aware", () => {
    expect(languageDirective("Spanish")).toContain("Spanish");
    expect(languageDirective("English")).toContain("English");
  });

  it("narrator instruction describes the scene and who is present, without the user's background", () => {
    const text = buildNarratorInstruction({
      scene: openPlainsManifest,
      user,
      npc,
      language: "English",
    });
    expect(text).toContain(openPlainsManifest.backdrop.description);
    expect(text).toContain(npc.name);
    expect(text).toContain(user.name);
    expect(text).not.toContain(user.backgroundPayload);
    expect(text).toContain("English");
  });

  it("npc instruction carries the npc background, user appearance (not background), and the conversation", () => {
    const conversation = [
      { speaker: "player", text: "Hello." },
      { speaker: npc.name, text: "Greetings, traveler." },
    ];
    const text = buildNpcInstruction({
      scene: openPlainsManifest,
      npc,
      user,
      conversation,
      language: "English",
    });
    expect(text).toContain(npc.backgroundPayload);
    expect(text).toContain(user.name);
    expect(text).not.toContain(user.backgroundPayload);
    expect(text).toContain("Hello.");
    expect(text).toContain("[choices]"); // dialogue format rules reused
    expect(text).toContain("English");
  });

  it("trimConversation drops oldest turns to fit the budget", () => {
    const turns = Array.from({ length: 300 }, (_, i) => ({
      speaker: "s",
      text: `word ${"x".repeat(100)} ${i}`,
    }));
    const trimmed = trimConversation(turns);
    const total = trimmed.reduce((n, t) => n + t.text.length + t.speaker.length + 4, 0);
    expect(total).toBeLessThanOrEqual(PAYLOAD_BUDGET);
    expect(trimmed.length).toBeLessThan(turns.length);
    // newest turn is kept
    expect(trimmed[trimmed.length - 1]?.text).toBe(turns[turns.length - 1]!.text);
  });

  it("short conversations are not trimmed", () => {
    const turns = [{ speaker: "a", text: "hi" }];
    expect(trimConversation(turns)).toEqual(turns);
  });
});
