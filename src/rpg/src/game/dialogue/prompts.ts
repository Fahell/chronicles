/**
 * Builds the dialogue-generation instruction (narrative-spec §3.1).
 *
 * The model MAY end its reply with an optional `[choices]` block — never
 * JSON. The block is line-oriented: dialogue first, blank line, `[choices]`
 * alone on its line, then `N. text` options (max 4). A literal `[choices]`
 * inside dialogue is escaped as `\[choices\]`. If no choices fit, the block
 * is omitted — the parser degrades to dialogue-only either way.
 */
export function dialogueInstruction(instruction: string): string {
  return `${instruction}

You MAY end your reply with an optional [choices] block proposing actions the player can take — use it only when it is natural and convenient. Follow these formatting rules exactly:

- Write the dialogue text first, as many paragraphs as you need.
- If you include choices, add a blank line, then a line containing exactly [choices], then one option per line in the form "1. <text>", "2. <text>", and so on — at most 4 options.
- Keep option texts short, in character, phrased as actions the player could take.
- If you need to mention a literal [choices] inside the dialogue, write it as \\[choices\\].
- If no choices are appropriate, simply omit the block.

Example:
The old innkeeper looks at you expectantly.

[choices]
1. Ask about the ruins — you need to know what happened
2. Offer your help — the village is in danger`;
}
