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
const npc2 = NPC_POOL[1]!;
const day = { day: 2, period: "night" as const, scenesInPeriod: 1 };

describe("payload builder", () => {
  it("language directive is present and language-aware", () => {
    expect(languageDirective("Spanish")).toContain("Spanish");
    expect(languageDirective("English")).toContain("English");
  });

  it("narrator instruction describes the scene and who is present, without the user's background", () => {
    const text = buildNarratorInstruction({
      scene: openPlainsManifest,
      user,
      npcs: [npc],
      language: "English",
      day,
    });
    expect(text).toContain(openPlainsManifest.backdrop.description);
    expect(text).toContain(openPlainsManifest.floor?.description ?? "");
    expect(text).toContain(npc.name);
    expect(text).toContain(user.name);
    expect(text).not.toContain(user.backgroundPayload);
    expect(text).toContain("English");
  });

  it("scene context carries the visual descriptions, never the raw art prompts (round-10 finding)", () => {
    const text = buildNarratorInstruction({
      scene: openPlainsManifest,
      user,
      npcs: [npc],
      language: "English",
      day,
    });
    // narrative-spec §2.2 "never send the recipe": the payload must not
    // contain the image-generation prompts (they are AssetCache inputs).
    expect(text).not.toContain("Backdrop art prompt");
    expect(text).not.toContain("Floor art prompt");
    expect(text).not.toContain("Three.js floor plane");
    expect(text).not.toContain("Do not include");
    // …while the authored descriptions do enter.
    expect(text).toContain(openPlainsManifest.backdrop.description);
    expect(text).toContain(openPlainsManifest.floor?.description);
  });

  it("npc instruction carries the npc background, user appearance (not background), and the conversation", () => {
    const conversation = [
      { speaker: "player", text: "Hello." },
      { speaker: npc.name, text: "Greetings, traveler." },
    ];
    const text = buildNpcInstruction({
      scene: openPlainsManifest,
      npc,
      coPresent: [npc2],
      user,
      conversation,
      language: "English",
      day,
    });
    expect(text).toContain(npc.backgroundPayload);
    expect(text).toContain(user.name);
    expect(text).not.toContain(user.backgroundPayload);
    expect(text).toContain("Hello.");
    expect(text).toContain("[choices]"); // dialogue format rules reused
    expect(text).toContain("English");
    // day-cycle-spec §3: TIME OF DAY is a named, never-summarized section.
    expect(text).toContain("TIME OF DAY");
    expect(text).toContain("night");
    expect(text).toContain("day 2");
    // round 12: the co-present NPC is mentioned by name + type only — the
    // background stays private (§2.1).
    expect(text).toContain(npc2.name);
    expect(text).toContain(npc2.type);
    expect(text).not.toContain(npc2.backgroundPayload);
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
