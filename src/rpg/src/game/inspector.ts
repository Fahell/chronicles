import { archetypeById } from "../content/archetypes";
import type { NpcDefinition } from "../content/npcPool";
import type { SceneManifest } from "../scene/types";
import type { DayState } from "./day/clock";
import { type Identity, summarizeAppearance } from "./identity";
import {
  buildNarratorInstruction,
  buildNarratorSections,
  buildNpcInstruction,
  buildNpcSections,
  type ConversationTurn,
  PAYLOAD_BUDGET,
  type PayloadSection,
} from "./payload/builder";

/**
 * Dev context inspector v1 (tech-spec §6.4, round 10): shows everything that
 * defines a voice at the current moment — the payload sections exactly as the
 * builder emitted them (with the summarizable policy of narrative-spec §5.3),
 * the raw image prompt (never in the payload), the visual description, and
 * counts against the ~24k window. Reads from the same builders the app uses —
 * it never forks state.
 *
 * v1 scope: state section is the current scene only (day-cycle periods,
 * relationship edges and poses land when those features exist).
 */

/** The window-summary trigger (two-tier summarization, day-cycle-spec §6). */
export const INSPECTOR_WINDOW_TRIGGER = 22_000;

export type InspectorVoiceId = "npc" | "npc2" | "narrator" | "user";

export interface InspectorVoicePanel {
  /** Display label for the voice selector. */
  label: string;
  /** The payload sections exactly as the builder emitted them. */
  sections: PayloadSection[];
  /** The full composed instruction (what Copy payload copies). */
  instruction: string;
  /** Raw generation prompt — never enters the payload (narrative §2.2). */
  imagePrompt: string | null;
  /** Derived compact visual description that actually enters payloads (§2.2). */
  visualDescription: string;
  /** Own background, payload version (narrative §5.4). */
  backgroundPayload: string | null;
  /** Sum of section content lengths. */
  totalChars: number;
  /** totalChars / PAYLOAD_BUDGET — the budget bar fraction. */
  budgetFraction: number;
  /** True when totalChars approaches the ~22k window-summary trigger. */
  windowTrigger: boolean;
}

export interface InspectorState {
  sceneId: string;
  day: number;
  period: string;
  /** Present voices: npc (+ npc2 when a second NPC is in the scene), narrator, user. */
  voices: Partial<Record<InspectorVoiceId, InspectorVoicePanel>>;
}

export interface InspectorContext {
  scene: SceneManifest;
  /** All NPCs present (1..2) — the first is the primary NPC voice. */
  npcs: NpcDefinition[];
  user: Identity;
  conversation: ConversationTurn[];
  language: string;
  /** In-game time of day (day-cycle-spec §3). */
  day: DayState;
}

function panel(
  label: string,
  sections: PayloadSection[],
  instruction: string,
  imagePrompt: string | null,
  visualDescription: string,
  backgroundPayload: string | null,
): InspectorVoicePanel {
  const totalChars = sections.reduce((n, s) => n + s.content.length, 0);
  return {
    label,
    sections,
    instruction,
    imagePrompt,
    visualDescription,
    backgroundPayload,
    totalChars,
    budgetFraction: totalChars / PAYLOAD_BUDGET,
    windowTrigger: totalChars >= INSPECTOR_WINDOW_TRIGGER,
  };
}

/** Builds the inspector state for the current session (tech-spec §6.4 v1). */
export function buildInspectorState(ctx: InspectorContext): InspectorState {
  const narratorSections = buildNarratorSections(ctx);

  const userArchetype = archetypeById(ctx.user.archetypeId);
  const userSections: PayloadSection[] = [
    { name: "NAME", content: ctx.user.name, summarizable: false },
    {
      name: "APPEARANCE",
      content: summarizeAppearance(ctx.user),
      summarizable: false,
    },
    {
      name: "OWN BACKGROUND (payload version)",
      content: ctx.user.backgroundPayload,
      summarizable: false,
    },
  ];
  const userInstruction = userSections.map((s) => `${s.name}\n${s.content}`).join("\n\n");

  const voices: InspectorState["voices"] = {};
  ctx.npcs.forEach((npc, i) => {
    const id = i === 0 ? "npc" : "npc2";
    const npcCtx = {
      scene: ctx.scene,
      npc,
      coPresent: ctx.npcs.filter((other) => other.id !== npc.id),
      user: ctx.user,
      conversation: ctx.conversation,
      language: ctx.language,
      day: ctx.day,
    };
    voices[id] = panel(
      npc.name,
      buildNpcSections(npcCtx),
      buildNpcInstruction(npcCtx),
      npc.spritePrompt,
      ctx.scene.backdrop.description,
      npc.backgroundPayload,
    );
  });
  voices.narrator = panel(
    "Narrator",
    narratorSections,
    buildNarratorInstruction(ctx),
    null,
    ctx.scene.backdrop.description,
    null,
  );
  voices.user = panel(
    ctx.user.name,
    userSections,
    userInstruction,
    userArchetype?.spritePrompt ?? null,
    userArchetype?.appearanceSummary ?? summarizeAppearance(ctx.user),
    ctx.user.backgroundPayload,
  );

  return {
    sceneId: ctx.scene.id,
    day: ctx.day.day,
    period: ctx.day.period,
    voices,
  };
}
