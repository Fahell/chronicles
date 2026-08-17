import { describe, expect, it } from "vitest";
import { NPC_POOL } from "../../src/content/npcPool";
import { dialogueInstruction } from "../../src/game/dialogue/prompts";
import { buildIdentity } from "../../src/game/identity";
import {
  buildInspectorState,
  INSPECTOR_WINDOW_TRIGGER,
  type InspectorVoiceId,
} from "../../src/game/inspector";
import {
  buildNarratorInstruction,
  buildNarratorSections,
  buildNpcInstruction,
  buildNpcSections,
  PAYLOAD_BUDGET,
} from "../../src/game/payload/builder";
import { openPlainsManifest } from "../../src/scene/manifest/openPlains";

const user = buildIdentity({
  name: "Arin",
  archetypeId: "traveler",
  background: { kind: "template", templateId: "bt1" },
});
const npc = NPC_POOL[0]!;
const npc2 = NPC_POOL[1]!;
const scene = openPlainsManifest;
const conversation = [
  { speaker: "player", text: "Hello." },
  { speaker: npc.name, text: "Greetings, traveler." },
];
const language = "English";
const day = { day: 1, period: "afternoon" as const, scenesInPeriod: 0 };

describe("payload sections (round 10)", () => {
  it("buildNpcSections returns named sections with summarizable flags", () => {
    const sections = buildNpcSections({
      scene,
      npc,
      coPresent: [npc2],
      user,
      conversation,
      language,
      day,
    });
    const names = sections.map((s) => s.name);
    expect(names).toContain("System");
    expect(names).toContain("WHO YOU ARE");
    expect(names).toContain("CONVERSATION SO FAR");
    // the lore section is the summarizable one; instructions/identity are not
    expect(sections.find((s) => s.name === "CONVERSATION SO FAR")?.summarizable).toBe(true);
    for (const s of sections) {
      if (s.name !== "CONVERSATION SO FAR") expect(s.summarizable).toBe(false);
    }
  });

  it("buildNarratorSections returns scene + present + time-of-day sections", () => {
    const sections = buildNarratorSections({ scene, user, npcs: [npc, npc2], language, day });
    expect(sections.map((s) => s.name)).toEqual(["System", "SCENE", "PRESENT", "TIME OF DAY"]);
    expect(sections.every((s) => s.summarizable === false)).toBe(true);
    // day-cycle-spec §3: the current period is named context — never summarized.
    const tod = sections.find((s) => s.name === "TIME OF DAY");
    expect(tod?.content).toContain("afternoon");
    expect(tod?.content).toContain("day 1");
    // round 12: both present NPCs are listed (name + type), never backgrounds.
    const present = sections.find((s) => s.name === "PRESENT")!;
    expect(present.content).toContain(npc.name);
    expect(present.content).toContain(npc2.name);
    expect(present.content).not.toContain(npc2.backgroundPayload);
  });

  it("sections compose into the exact same instruction as before", () => {
    const npcSections = buildNpcSections({
      scene,
      npc,
      coPresent: [npc2],
      user,
      conversation,
      language,
      day,
    });
    const narrSections = buildNarratorSections({ scene, user, npcs: [npc, npc2], language, day });
    // rendered from sections must equal the legacy builders (regression guard)
    // — the NPC instruction additionally wraps the [choices] format rules.
    expect(dialogueInstruction(renderSections(npcSections, language))).toBe(
      buildNpcInstruction({ scene, npc, coPresent: [npc2], user, conversation, language, day }),
    );
    expect(renderSections(narrSections, language)).toBe(
      buildNarratorInstruction({ scene, user, npcs: [npc, npc2], language, day }),
    );
  });
});

describe("inspector state (round 10, tech-spec §6.4)", () => {
  it("buildInspectorState returns per-voice panels with counts and budget", () => {
    const state = buildInspectorState({
      scene,
      npcs: [npc, npc2],
      user,
      conversation,
      language,
      day,
    });
    const voices = Object.keys(state.voices) as InspectorVoiceId[];
    expect(voices).toEqual(["npc", "npc2", "narrator", "user"]);
    for (const voice of voices) {
      const panel = state.voices[voice]!;
      expect(panel.sections.length).toBeGreaterThan(0);
      expect(panel.totalChars).toBeGreaterThan(0);
      expect(panel.budgetFraction).toBeCloseTo(panel.totalChars / PAYLOAD_BUDGET, 5);
      expect(panel.visualDescription).toBeTruthy();
      // the narrator has no sprite prompt (world voice) — imagePrompt is null
      if (voice === "narrator") {
        expect(panel.imagePrompt).toBeNull();
      } else {
        expect(panel.imagePrompt).toBeTruthy();
      }
    }
  });

  it("the npc panel marks the conversation section as summarizable", () => {
    const state = buildInspectorState({
      scene,
      npcs: [npc, npc2],
      user,
      conversation,
      language,
      day,
    });
    const conv = state.voices.npc?.sections.find((s) => s.name === "CONVERSATION SO FAR");
    expect(conv?.summarizable).toBe(true);
  });

  it("a near-cap conversation flags the window-summary trigger", () => {
    const bigConversation = Array.from({ length: 60 }, (_, i) => ({
      speaker: "player",
      text: `a very long turn with many words to push the payload over the trigger threshold ${i} `.repeat(
        30,
      ),
    }));
    const state = buildInspectorState({
      scene,
      npcs: [npc, npc2],
      user,
      conversation: bigConversation,
      language,
      day,
    });
    expect(state.voices.npc!.windowTrigger).toBe(true);
    // the narrator and user panels stay under the trigger
    expect(state.voices.narrator!.windowTrigger).toBe(false);
    expect(state.voices.user!.windowTrigger).toBe(false);
  });
});

/** Renders sections the same way the builder composes them (regression guard). */
function renderSections(sections: { name: string; content: string }[], language: string): string {
  const body = sections
    .map((s) => (s.name === "System" ? s.content : `${s.name}\n${s.content}`))
    .join("\n\n");
  return `${languageDirective(language)}${body}`;
}

function languageDirective(language: string): string {
  return `Respond in ${language}. `;
}
