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
const scene = openPlainsManifest;
const conversation = [
  { speaker: "player", text: "Hello." },
  { speaker: npc.name, text: "Greetings, traveler." },
];
const language = "English";

describe("payload sections (round 10)", () => {
  it("buildNpcSections returns named sections with summarizable flags", () => {
    const sections = buildNpcSections({ scene, npc, user, conversation, language });
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

  it("buildNarratorSections returns scene + present sections", () => {
    const sections = buildNarratorSections({ scene, user, npc, language });
    expect(sections.map((s) => s.name)).toEqual(["System", "SCENE", "PRESENT"]);
    expect(sections.every((s) => s.summarizable === false)).toBe(true);
  });

  it("sections compose into the exact same instruction as before", () => {
    const npcSections = buildNpcSections({ scene, npc, user, conversation, language });
    const narrSections = buildNarratorSections({ scene, user, npc, language });
    // rendered from sections must equal the legacy builders (regression guard)
    // — the NPC instruction additionally wraps the [choices] format rules.
    expect(dialogueInstruction(renderSections(npcSections, language))).toBe(
      buildNpcInstruction({ scene, npc, user, conversation, language }),
    );
    expect(renderSections(narrSections, language)).toBe(
      buildNarratorInstruction({ scene, user, npc, language }),
    );
  });
});

describe("inspector state (round 10, tech-spec §6.4)", () => {
  it("buildInspectorState returns per-voice panels with counts and budget", () => {
    const state = buildInspectorState({ scene, npc, user, conversation, language });
    const voices = Object.keys(state.voices) as InspectorVoiceId[];
    expect(voices).toEqual(["npc", "narrator", "user"]);
    for (const voice of voices) {
      const panel = state.voices[voice];
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
    const state = buildInspectorState({ scene, npc, user, conversation, language });
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
      npc,
      user,
      conversation: bigConversation,
      language,
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
