import { archetypeById } from "../content/archetypes";
import type { NpcDefinition } from "../content/npcPool";
import type { SceneManifest } from "../scene/types";
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

export type InspectorVoiceId = "npc" | "narrator" | "user";

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
  voices: Record<InspectorVoiceId, InspectorVoicePanel>;
}

export interface InspectorContext {
  scene: SceneManifest;
  npc: NpcDefinition;
  user: Identity;
  conversation: ConversationTurn[];
  language: string;
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
  const npcSections = buildNpcSections(ctx);
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

  return {
    sceneId: ctx.scene.id,
    day: 1,
    period: "dusk",
    voices: {
      npc: panel(
        ctx.npc.name,
        npcSections,
        buildNpcInstruction(ctx),
        ctx.npc.spritePrompt,
        ctx.scene.backdrop.description,
        ctx.npc.backgroundPayload,
      ),
      narrator: panel(
        "Narrator",
        narratorSections,
        buildNarratorInstruction(ctx),
        null,
        ctx.scene.backdrop.description,
        null,
      ),
      user: panel(
        ctx.user.name,
        userSections,
        userInstruction,
        userArchetype?.spritePrompt ?? null,
        userArchetype?.appearanceSummary ?? summarizeAppearance(ctx.user),
        ctx.user.backgroundPayload,
      ),
    },
  };
}
