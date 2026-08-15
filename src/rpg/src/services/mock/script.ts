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
      match: /choice/i,
      reply:
        "The old innkeeper looks at you expectantly.\n\n[choices]\n" +
        "1. Ask about the ruins — you need to know what happened\n" +
        "2. Offer your help — the village is in danger\n" +
        "3. Leave quietly — this is not your fight",
    },
    {
      match: /greet|hello|hi\b/i,
      reply: "Welcome, traveler. Not many come this way anymore.",
    },
  ],
  defaultReply: "The wind carries the distant sound of the river.",
};
