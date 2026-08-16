import { characterSpritePrompt } from "./sprite";

/**
 * Seed NPC pool (narrative-spec §9): 3 example types × 3 example context
 * stories = 9 authored NPCs. Illustrative seed content — the final cast is
 * decided later and world generation (relationships-spec) expands it.
 * Each NPC keeps the dual background versions (payload ≤ ~300 chars English
 * for the LLM context; UI full text for the future character stats menu).
 */
export interface NpcDefinition {
  /** Stable id — cache key + save pointer ("npc/{type}-{story}"). */
  id: string;
  name: string;
  type: string;
  backgroundPayload: string;
  backgroundUi: string;
  spritePrompt: string;
}

const KNIGHT = "wandering knight";
const MAGE = "forest mage";
const ROGUE = "street rogue";

export const NPC_POOL: NpcDefinition[] = [
  {
    id: "npc/knight-lost-battle",
    name: "Serran",
    type: KNIGHT,
    backgroundPayload:
      "A veteran knight who lost his entire company at the Battle of the Grey Ford. Remembers nothing of the battle itself; the memory is a blank that frightens him more than the fight did.",
    backgroundUi:
      "Serran once commanded a company of knights. At the Battle of the Grey Ford they were wiped out — every last one — and he walked out of the smoke with no memory of how. The blank where the battle should be frightens him more than the battle itself ever did. He wears the company's faded banner under his gambeson and searches for any record of what happened that day.",
    spritePrompt: characterSpritePrompt(
      "a wandering knight in battered half-plate with a faded banner-wrapped arm, a heavy greatsword across the back, short greying hair, a quiet haunted bearing",
    ),
  },
  {
    id: "npc/knight-missing-sibling",
    name: "Eldrin",
    type: KNIGHT,
    backgroundPayload:
      "A knight whose younger brother vanished while riding escort on the eastern road three winters ago. Has traced rumors ever since; every lead so far has been a dead end.",
    backgroundUi:
      "Eldrin's younger brother vanished three winters ago while riding escort on the eastern road. The wagon train made it through; the brother did not. Eldrin left his post and has traced rumors ever since — a flash of a familiar shield here, a half-remembered voice there — each lead a dead end that he refuses to let finish the story.",
    spritePrompt: characterSpritePrompt(
      "a knight in clean silver plate with a family-crest shield strapped to the back, short dark hair, earnest worried eyes, a coil of rope and a rolled map at the belt",
    ),
  },
  {
    id: "npc/knight-hidden-village",
    name: "Mira",
    type: KNIGHT,
    backgroundPayload:
      "A knight sworn to protect a hidden mountain village whose location she never speaks of. Treats every traveler's tale of the mountains as possible news of home.",
    backgroundUi:
      "Somewhere in the high passes there is a village that does not appear on any map, and Mira is its sworn protector. She never speaks its name or its location — only that she will die before it is found. Every traveler's tale of the mountains is, to her, possible news of home, which is why she listens to strangers so carefully.",
    spritePrompt: characterSpritePrompt(
      "a knight in grey-green armor with a snow-cloak and a round shield painted with an unreadable mountain sigil, pale eyes, watchful calm posture",
    ),
  },
  {
    id: "npc/mage-lost-battle",
    name: "Veska",
    type: MAGE,
    backgroundPayload:
      "A forest mage who survived the Grey Ford by accident — she was supposed to be elsewhere. Haunted by the survivors' stories and by what the dead battlefield whispers to her.",
    backgroundUi:
      "Veska was never meant to be at the Grey Ford. A wrong turn on a quiet errand put her in the path of the slaughter, and she survived by accident while hundreds did not. The battlefield still whispers to her in her craft — fragments of the dead, unfinished sentences. She listens, trying to learn what truly happened there, and whether her wrong turn was really an accident.",
    spritePrompt: characterSpritePrompt(
      "a forest mage in moss-green robes with ivy-wrapped staff and a small glowing lantern at the belt, deep green eyes, thoughtful guarded expression",
    ),
  },
  {
    id: "npc/mage-missing-sibling",
    name: "Talen",
    type: MAGE,
    backgroundPayload:
      "A hedge mage whose twin sister walked into the deep woods three years ago and never returned. Follows the faint magical traces she left; the traces have begun to move again.",
    backgroundUi:
      "Talen's twin sister was the better mage of the two. Three years ago she walked into the deep woods to study an old grove and never walked back out. Talen has followed the faint magical traces she left behind ever since — cold imprints of her spells that have, for years now, sat perfectly still. This spring, for the first time, they moved.",
    spritePrompt: characterSpritePrompt(
      "a hedge mage in patched brown robes with a staff wrapped in copper wire, a familiar small fox perched on the shoulder, sharp searching eyes",
    ),
  },
  {
    id: "npc/mage-hidden-village",
    name: "Ilya",
    type: MAGE,
    backgroundPayload:
      "A village ward-mage who left her hidden home to study abroad and swore to return with the knowledge to protect it. The longer she stays away, the harder it is to go back.",
    backgroundUi:
      "Ilya grew up in a hidden village protected by old wards she was meant to inherit. To learn the deeper magic they needed, she left to study abroad — promising to return with the knowledge. Years later, the knowledge is almost complete and the promise is heavy. Every season she tells herself this is the last one abroad; every season she finds a reason to delay the return that will bind her forever.",
    spritePrompt: characterSpritePrompt(
      "a village ward-mage in a deep blue robe embroidered with protective sigils, a book-staff, soft serious face, ink-stained fingers",
    ),
  },
  {
    id: "npc/rogue-lost-battle",
    name: "Kest",
    type: ROGUE,
    backgroundPayload:
      "A street rogue who picked the pockets of the dead at the Grey Ford and found a sealed letter addressed to a name he now cannot forget. Carries it still.",
    backgroundUi:
      "Kest survived the Grey Ford the only way a street rogue could: by moving through the aftermath before the crows did. Among the dead he found a sealed letter addressed to a name he had never heard — and, unaccountably, has not been able to forget since. He has carried it for years, unopened, through every town on the map, waiting to meet the person it belongs to, or the courage to read it himself.",
    spritePrompt: characterSpritePrompt(
      "a street rogue in dark fitted leathers with a worn satchel, a hood half-up, a lockpick kit at the belt, clever watchful eyes, one hand always near the satchel",
    ),
  },
  {
    id: "npc/rogue-missing-sibling",
    name: "Rinn",
    type: ROGUE,
    backgroundPayload:
      "A former fence whose little sister disappeared into the city's underbelly and resurfaced in rumors tied to a shadowy guild. Infiltrated the guild to find her.",
    backgroundUi:
      "Rinn once ran the most honest fence operation in the port city — a strange boast, but a true one. When her little sister vanished into the underbelly and resurfaced only in rumors tied to a shadowy guild, Rinn sold everything and infiltrated the guild itself. Two years inside, and she is close enough to the top to start asking the questions that get people buried.",
    spritePrompt: characterSpritePrompt(
      "a street rogue in a dark grey hooded cloak over simple clothes, a guild-marked coin on a cord at the neck, tired sharp eyes, agile stance",
    ),
  },
  {
    id: "npc/rogue-hidden-village",
    name: "Dario",
    type: ROGUE,
    backgroundPayload:
      "A smuggler who grew up in a hidden village and now runs goods along the routes that keep it supplied. Sworn to silence about it; buys secrets to protect it.",
    backgroundUi:
      "The hidden village needs things no valley can grow and no map can show: salt, iron, news. Dario is the smuggler who runs those routes, a villager by birth who left so the village could keep its secret. He buys secrets the way other men buy wine — collecting rumors of anyone hunting the hidden valleys, so he is always one step ahead of the people who would sell his home for gold.",
    spritePrompt: characterSpritePrompt(
      "a smuggler-rogue in a patched oilskin coat with a deep hood, rope and pouches at the belt, a knowing easy smile, weather-worn hands",
    ),
  },
];

/** Seeded pick for the test scene (rng 0..1; default Math.random). */
export function pickNpc(rng: () => number = Math.random): NpcDefinition {
  const index = Math.min(NPC_POOL.length - 1, Math.floor(rng() * NPC_POOL.length));
  return NPC_POOL[index]!;
}

export function npcById(id: string): NpcDefinition | undefined {
  return NPC_POOL.find((n) => n.id === id);
}
