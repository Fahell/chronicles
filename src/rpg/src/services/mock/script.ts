/**
 * Scripted text responses for the mock harness (tech-spec §6.2).
 * The default script includes a choice-format payload so the `[choices]`
 * parser (narrative-spec §3.1) is exercised by local tests.
 */

export interface TextScriptEntry {
  /** Substring (case-insensitive) or regex matched against the instruction. */
  match: string | RegExp;
  reply: string;
}

export interface TextScript {
  entries: TextScriptEntry[];
  defaultReply: string;
}

export const defaultTextScript: TextScript = {
  entries: [
    {
      match: /narrator|narrate|world narrator/i,
      reply:
        "The twilight valley stretches out before you, a thin ribbon of mist curling over the meadow. Beyond the grass, a lone figure stands by the path, watching your approach.",
    },
    {
      match: /choice|ask about the ruins/i,
      reply:
        "The figure studies you for a long moment, then nods slowly.\n\n[choices]\n" +
        "1. Ask about the ruins — you need to know what happened\n" +
        "2. Offer your help — the village is in danger\n" +
        "3. Leave quietly — this is not your fight",
    },
    {
      match: /offer your help|offer/i,
      reply:
        "A faint, tired smile crosses their face. 'Then we have much to do before dusk.'\n\n[choices]\n" +
        "1. Tell me what happened here\n" +
        "2. What do you need from me first?",
    },
    {
      match: /greet|hello|hi\b/i,
      reply: "Welcome, traveler. Not many come this way anymore.",
    },
    {
      match: /who are you|tell me what happened|what do you need/i,
      reply:
        "'I was a soldier once, in a war that never ended. These days I keep watch over the valley.' They gesture toward the distant ruins. 'The old war has a way of coming back.'",
    },
  ],
  defaultReply: "The wind carries the distant sound of the river.",
};
