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
 *
 * Each builder exposes BOTH a structured section list (for the dev context
 * inspector, tech-spec §6.4 — named sections with the summarizable policy of
 * narrative-spec §5.3) and the composed instruction string. The instruction
 * is ALWAYS composed from the sections, so the two can never drift.
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

/**
 * One named payload section (narrative-spec §5.3 taxonomy). `summarizable`
 * is the policy column: only the lore sections (conversation so far / rolling
 * summaries) undergo daily + window summarization (day-cycle-spec §6);
 * everything else is never summarized.
 */
export interface PayloadSection {
  name: string;
  content: string;
  summarizable: boolean;
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

/** Composes the sections into the single instruction string (byte-identical). */
function compose(sections: PayloadSection[], language: string): string {
  const body = sections
    .map((s) => (s.name === "System" ? s.content : `${s.name}\n${s.content}`))
    .join("\n\n");
  return `${languageDirective(language)}${body}`;
}

/** The narrator's named sections (world voice — none are summarizable). */
export function buildNarratorSections(ctx: NarratorContext): PayloadSection[] {
  return [
    {
      name: "System",
      content:
        "You are the world narrator of a visual-novel RPG. Describe the scene in 2-3 sentences of vivid, grounded prose: where the player is, the atmosphere, and the person present. Do not role-play as any character and do not repeat the player's name more than once.",
      summarizable: false,
    },
    { name: "SCENE", content: sceneContext(ctx.scene), summarizable: false },
    {
      name: "PRESENT",
      content: `The player: ${userSummary(ctx.user)}\nAlso present: ${ctx.npc.name}, a ${ctx.npc.type}.`,
      summarizable: false,
    },
  ];
}

/** The NPC's named sections — only CONVERSATION SO FAR is summarizable lore. */
export function buildNpcSections(ctx: NpcContext): PayloadSection[] {
  return [
    {
      name: "System",
      content: `You are ${ctx.npc.name}, a ${ctx.npc.type} in the world of the game. Stay in character, keep replies brief and grounded (1-3 short paragraphs max), and react naturally to what is said.`,
      summarizable: false,
    },
    {
      name: "WHO YOU ARE",
      content: `Name: ${ctx.npc.name} (${ctx.npc.type})\nYour story: ${ctx.npc.backgroundPayload}`,
      summarizable: false,
    },
    {
      name: "WHO YOU ARE TALKING TO",
      content: `A stranger: ${userSummary(ctx.user)}. They are a stranger to you — do not assume shared history or knowledge of their past.`,
      summarizable: false,
    },
    { name: "WHERE YOU ARE", content: sceneContext(ctx.scene), summarizable: false },
    {
      name: "CONVERSATION SO FAR",
      content: renderConversation(trimConversation(ctx.conversation)),
      summarizable: true,
    },
  ];
}

/** World-narrator opening for the scene (narrative-spec §9). */
export function buildNarratorInstruction(ctx: NarratorContext): string {
  return compose(buildNarratorSections(ctx), ctx.language);
}

/** NPC dialogue generation — identity + background + user + scene + conversation. */
export function buildNpcInstruction(ctx: NpcContext): string {
  return dialogueInstruction(compose(buildNpcSections(ctx), ctx.language));
}
