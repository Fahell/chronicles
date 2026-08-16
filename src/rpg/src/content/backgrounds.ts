/**
 * User background templates (narrative-spec §9 — the user can pick one or
 * write their own). Each keeps the dual versions from narrative-spec §5.4:
 * `payload` (compact, English, no preamble — enters the LLM context) and
 * `ui` (the full readable version, shown in the future character stats menu).
 */
export interface BackgroundTemplate {
  id: string;
  label: string;
  payload: string;
  ui: string;
}

export const USER_BACKGROUND_TEMPLATES: BackgroundTemplate[] = [
  {
    id: "bt1",
    label: "Lost homeland",
    payload:
      "Grew up in a riverside village razed by a border war years ago. Travels to find a place that feels like home and to learn who lit the fire.",
    ui: "You grew up in a small riverside village, the kind where everyone knew everyone. A border war razed it years ago, and you have carried the ash in your memory ever since. You travel the open lands not as a refugee but as a seeker — looking for a place that could feel like home again, and quietly learning who it was that lit the fire.",
  },
  {
    id: "bt2",
    label: "Debt of honor",
    payload:
      "Owes a life-debt to an old healer who saved them from a fever. Swore to carry word and aid across the land until the debt is paid.",
    ui: "A fever nearly took you as a child. An old healer pulled you through, asking nothing in return. You swore then to carry her kindness forward — to cross the land carrying word between the scattered villages, offering aid where you can, until the debt is truly paid. The vow shaped everything: the road is your home now, and strangers are your neighbors.",
  },
  {
    id: "bt3",
    label: "Something to find",
    payload:
      "Came of age in a quiet coastal town but left after a recurring dream pointed to a symbol no one recognized. Seeks the meaning of the dream.",
    ui: "You came of age in a quiet coastal town where nothing much ever happened. Then the dream started — always the same: a symbol carved in stone, half-buried, humming with cold light. No one in town recognized it, which is exactly why you left. You have been walking inland ever since, showing the symbol to anyone who will look, convinced the dream is trying to tell you where you are actually from.",
  },
];

export function backgroundTemplateById(id: string): BackgroundTemplate | undefined {
  return USER_BACKGROUND_TEMPLATES.find((b) => b.id === id);
}
