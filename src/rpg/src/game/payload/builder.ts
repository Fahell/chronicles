import type { NpcDefinition } from "../../content/npcPool";
import type { SceneManifest } from "../../scene/types";
import type { DayState } from "../day/clock";
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
  /** All NPCs present in the scene (1..2, round 12). */
  npcs: NpcDefinition[];
  /** English name of the player's language (e.g. "Spanish"). */
  language: string;
  /** In-game time of day (day-cycle-spec §3) — injected as a named section. */
  day: DayState;
}

export interface NpcContext {
  scene: SceneManifest;
  /** The NPC this payload belongs to. */
  npc: NpcDefinition;
  /** The other NPC(s) present (appearance only — backgrounds stay private, §2.1). */
  coPresent: NpcDefinition[];
  user: Identity;
  conversation: ConversationTurn[];
  language: string;
  /** In-game time of day (day-cycle-spec §3) — injected as a named section. */
  day: DayState;
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
  // narrative-spec §2.2: payloads receive the authored visual descriptions,
  // NEVER the raw image-generation prompts ("never send the recipe"). The
  // prompts are image-pipeline inputs (AssetCache); leaking them into the
  // payload burned ~3k chars of the 24k budget and injected art meta-details
  // ("Three.js floor plane", "do not include…") into the character's head
  // (round-10 validation finding).
  const parts = [scene.backdrop.description];
  if (scene.floor?.description) parts.push(scene.floor.description);
  return parts.join("\n");
}

function userSummary(user: Identity): string {
  return `${user.name} — ${summarizeAppearance(user)}`;
}

/** Time-of-day named section (day-cycle-spec §3 — never summarized). */
function timeOfDaySection(day: DayState): PayloadSection {
  return {
    name: "TIME OF DAY",
    content: `It is ${day.period} of day ${day.day} (${day.scenesInPeriod} interaction${day.scenesInPeriod === 1 ? "" : "s"} so far in this period).`,
    summarizable: false,
  };
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
  const present = ctx.npcs.map((n) => `${n.name}, a ${n.type}`).join("; ");
  return [
    {
      name: "System",
      content:
        "You are the world narrator of a visual-novel RPG. Describe the scene in 2-3 sentences of vivid, grounded prose: where the player is, the atmosphere, and the people present. Do not role-play as any character and do not repeat the player's name more than once.",
      summarizable: false,
    },
    { name: "SCENE", content: sceneContext(ctx.scene), summarizable: false },
    {
      name: "PRESENT",
      content: `The player: ${userSummary(ctx.user)}\nPresent: ${present}.`,
      summarizable: false,
    },
    timeOfDaySection(ctx.day),
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
      content: `The player, a stranger: ${userSummary(ctx.user)}. They are a stranger to you — do not assume shared history or knowledge of their past.${
        ctx.coPresent.length > 0
          ? `\nAlso present: ${ctx.coPresent.map((n) => `${n.name}, a ${n.type}`).join("; ")}.`
          : ""
      }`,
      summarizable: false,
    },
    { name: "WHERE YOU ARE", content: sceneContext(ctx.scene), summarizable: false },
    timeOfDaySection(ctx.day),
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
