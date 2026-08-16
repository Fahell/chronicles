import type { NpcDefinition } from "../../content/npcPool";
import type { SceneManifest } from "../../scene/types";
import { dialogueInstruction } from "../dialogue/prompts";
import { type Identity, summarizeAppearance } from "../identity";

/**
 * Per-voice payload builder (narrative-spec §4-5, tech-spec §7.1).
 *
 * Taxonomy → one instruction per voice:
 * - Narrator (world): scene context (prompts/description) + who is present.
 * - NPC: own identity + background (payload version) + the user's NAME and
 *   APPEARANCE only (strangers — the background is never shared, narrative
 *   §9) + scene context + the bounded conversation log.
 *
 * The whole instruction is budget-guarded (PAYLOAD_BUDGET): the conversation
 * is trimmed oldest-first; if still over, the tail is hard-truncated.
 */

export const PAYLOAD_BUDGET = 24_000;

export interface ConversationTurn {
  speaker: string;
  text: string;
}

export interface NarratorContext {
  scene: SceneManifest;
  user: Identity;
  npc: NpcDefinition;
  /** English name of the player's language (e.g. "Spanish"). */
  language: string;
}

export interface NpcContext {
  scene: SceneManifest;
  npc: NpcDefinition;
  user: Identity;
  conversation: ConversationTurn[];
  language: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  zh: "Chinese",
  hi: "Hindi",
  es: "Spanish",
  ar: "Arabic",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  it: "Italian",
};

/** Best-effort English name of a language code for the AI directive. */
export function englishLanguageName(code: string): string {
  const base = code.split("-")[0]?.toLowerCase() ?? code;
  if (LANGUAGE_NAMES[base]) return LANGUAGE_NAMES[base]!;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(base) ?? code;
  } catch {
    return code;
  }
}

export function languageDirective(language: string): string {
  return `Respond in ${language}. `;
}

/** Drops oldest turns while the rendered size exceeds the budget. */
export function trimConversation(
  turns: ConversationTurn[],
  budget = PAYLOAD_BUDGET,
): ConversationTurn[] {
  const sizeOf = (list: ConversationTurn[]) =>
    list.reduce((n, t) => n + t.speaker.length + t.text.length + 4, 0);

  let kept = [...turns];
  while (kept.length > 1 && sizeOf(kept) > budget) {
    kept = kept.slice(1);
  }
  return kept;
}

function renderConversation(turns: ConversationTurn[]): string {
  if (turns.length === 0) return "(no conversation yet — this is the opening)";
  return turns.map((t) => `${t.speaker}: ${t.text}`).join("\n");
}

function sceneContext(scene: SceneManifest): string {
  const parts = [scene.backdrop.description];
  if (scene.backdrop.prompt) parts.push(`Backdrop art prompt: ${scene.backdrop.prompt}`);
  if (scene.floor?.prompt) parts.push(`Floor art prompt: ${scene.floor.prompt}`);
  return parts.join("\n");
}

function userSummary(user: Identity): string {
  return `${user.name} — ${summarizeAppearance(user)}`;
}

/** World-narrator opening for the scene (narrative-spec §9). */
export function buildNarratorInstruction(ctx: NarratorContext): string {
  const body = [
    "You are the world narrator of a visual-novel RPG. Describe the scene in 2-3 sentences of vivid, grounded prose: where the player is, the atmosphere, and the person present. Do not role-play as any character and do not repeat the player's name more than once.",
    "",
    "SCENE",
    sceneContext(ctx.scene),
    "",
    "PRESENT",
    `The player: ${userSummary(ctx.user)}`,
    `Also present: ${ctx.npc.name}, a ${ctx.npc.type}.`,
  ].join("\n");

  return `${languageDirective(ctx.language)}${body}`;
}

/** NPC dialogue generation — identity + background + user + scene + conversation. */
export function buildNpcInstruction(ctx: NpcContext): string {
  const base = [
    `You are ${ctx.npc.name}, a ${ctx.npc.type} in the world of the game. Stay in character, keep replies brief and grounded (1-3 short paragraphs max), and react naturally to what is said.`,
    "",
    "WHO YOU ARE",
    `Name: ${ctx.npc.name} (${ctx.npc.type})`,
    `Your story: ${ctx.npc.backgroundPayload}`,
    "",
    "WHO YOU ARE TALKING TO",
    `A stranger: ${userSummary(ctx.user)}. They are a stranger to you — do not assume shared history or knowledge of their past.`,
    "",
    "WHERE YOU ARE",
    sceneContext(ctx.scene),
    "",
    "CONVERSATION SO FAR",
    renderConversation(trimConversation(ctx.conversation)),
  ].join("\n");

  return dialogueInstruction(`${languageDirective(ctx.language)}${base}`);
}
