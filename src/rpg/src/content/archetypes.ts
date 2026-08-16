import { characterPortraitPrompt, characterSpritePrompt } from "./sprite";

/**
 * Visual archetypes for the player identity (narrative-spec §9: the user
 * picks a template or writes their own; the archetype drives the sprite).
 */
export interface Archetype {
  id: string;
  label: string;
  /** One-line look summary shared with NPCs (never the background). */
  appearanceSummary: string;
  spritePrompt: string;
  /** Bust portrait prompt (dialogue box frame, round 10). */
  portraitPrompt: string;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "knight",
    label: "Knight",
    appearanceSummary:
      "a knight in weathered silver plate with a faded tabard and a battered longsword at their hip",
    spritePrompt: characterSpritePrompt(
      "a young wandering knight in weathered silver plate armor with a faded cloth tabard, a dented helmet tucked under one arm, a longsword at the hip, short practical hair",
    ),
    portraitPrompt: characterPortraitPrompt(
      "a young wandering knight in weathered silver plate armor with a faded cloth tabard and a longsword at the hip",
    ),
  },
  {
    id: "mage",
    label: "Mage",
    appearanceSummary:
      "a mage in a deep indigo robe with silver embroidery and a wooden staff crowned with a faintly glowing crystal",
    spritePrompt: characterSpritePrompt(
      "a young forest mage in a deep indigo robe with silver embroidery, a wooden staff crowned with a faintly glowing crystal, wisps of hair escaping a loose hood",
    ),
    portraitPrompt: characterPortraitPrompt(
      "a young forest mage in a deep indigo robe with silver embroidery and a faintly glowing crystal",
    ),
  },
  {
    id: "rogue",
    label: "Rogue",
    appearanceSummary:
      "a street rogue in dark leathers with a hood, a satchel of tools, and a short blade sheathed at the back",
    spritePrompt: characterSpritePrompt(
      "a young street rogue in dark fitted leathers with a low hood, a satchel of tools across the chest, a short blade sheathed at the back, sharp quick posture",
    ),
    portraitPrompt: characterPortraitPrompt(
      "a young street rogue in dark fitted leathers with a low hood and a short blade sheathed at the back",
    ),
  },
  {
    id: "traveler",
    label: "Traveler",
    appearanceSummary:
      "a traveler in a simple ochre tunic, a hooded cloak, a small satchel and sturdy boots",
    spritePrompt: characterSpritePrompt(
      "a young traveler in a simple warm-ochre tunic, a hooded cloak, a small satchel and sturdy boots, calm open expression",
    ),
    portraitPrompt: characterPortraitPrompt(
      "a young traveler in a simple warm-ochre tunic with a hooded cloak and sturdy boots",
    ),
  },
];

export function archetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}
