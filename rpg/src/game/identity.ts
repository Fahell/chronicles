import { ARCHETYPES, archetypeById } from "../content/archetypes";
import { backgroundTemplateById } from "../content/backgrounds";

/**
 * Player identity (narrative-spec §7, vn-rpg-spec §8.1).
 *
 * Locked to the save: the name may be edited only before the game is created;
 * appearance and background are never changed afterwards. The background keeps
 * two versions (narrative-spec §5.4):
 * - `backgroundPayload` — compact, direct, English, ≤ ~300 chars (enters the LLM context);
 * - `backgroundUi` — the full readable version (shown to the player later in
 *   the character stats menu once the relationship tier allows it).
 */
export interface Identity {
  name: string;
  /** Visual archetype id (content/archetypes.ts). */
  archetypeId: string;
  /** Cache-key component for the user sprite; re-rolls of the identity change it. */
  appearanceSeed: string;
  background:
    | { kind: "template"; templateId: string }
    | { kind: "custom"; text: string };
  backgroundPayload: string;
  backgroundUi: string;
  /** Final processed cut-out (RMBG + matte) data URL, generated at identity time. */
  spriteCutout: string | null;
}

/** Payload-version length cap (narrative-spec §5.4). */
export const PAYLOAD_BACKGROUND_LIMIT = 300;

export interface IdentityInput {
  name: string;
  archetypeId: string;
  appearanceSeed?: string;
  background: Identity["background"];
}

/** Strips narrative preamble and trims to the payload budget. */
export function compactPayload(text: string, limit = PAYLOAD_BACKGROUND_LIMIT): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit - 1).trimEnd()}…`;
}

function defaultAppearanceSeed(archetypeId: string, name: string): string {
  let h = 0;
  const base = `${archetypeId}:${name}`;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return `id-${h.toString(36)}`;
}

/** Builds a normalized identity; templates supply the dual background versions. */
export function buildIdentity(input: IdentityInput): Identity {
  const { name, archetypeId, background } = input;
  const seed = input.appearanceSeed ?? defaultAppearanceSeed(archetypeId, name);

  if (background.kind === "template") {
    const template = backgroundTemplateById(background.templateId);
    if (!template) {
      throw new Error(`Unknown background template: ${background.templateId}`);
    }
    return {
      name: name.trim(),
      archetypeId,
      appearanceSeed: seed,
      background,
      backgroundPayload: template.payload,
      backgroundUi: template.ui,
      spriteCutout: null,
    };
  }

  return {
    name: name.trim(),
    archetypeId,
    appearanceSeed: seed,
    background,
    backgroundPayload: compactPayload(background.text),
    backgroundUi: background.text.trim(),
    spriteCutout: null,
  };
}

/**
 * One-line appearance summary for payloads (the user's look is shared with
 * NPCs — narrative-spec §9 "User identity in NPC payloads: appearance:
 * shared"; the background is NOT).
 */
export function summarizeAppearance(identity: Identity): string {
  const archetype = archetypeById(identity.archetypeId);
  return archetype?.appearanceSummary ?? "a traveler";
}

/** True when no archetype exists for the id (defensive; content is static). */
export function hasArchetype(identity: Identity): boolean {
  return ARCHETYPES.some((a) => a.id === identity.archetypeId);
}
