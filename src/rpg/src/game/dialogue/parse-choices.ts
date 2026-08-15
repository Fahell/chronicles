export interface ParsedDialogue {
  dialogue: string;
  options: string[];
}

const CHOICE_MARKER = "[choices]";
/** Literal escaped form `\[choices\]` as written by the LLM. */
const ESCAPED_MARKER = "\\[choices\\]";
const MAX_OPTIONS = 4;

/**
 * Parses the AI-proposed choices format (narrative-spec §3.1):
 * - `[choices]` alone on its own line starts the block; everything before is dialogue;
 * - each option is `N. <text>` on its own line, at most 4;
 * - a literal `\[choices\]` inside dialogue is unescaped to literal text;
 * - marker absent → all dialogue, no options;
 * - marker with zero valid options → dialogue-only;
 * - malformed lines are dropped individually; dedupe/trim/cap at 4;
 * - never throws — any failure degrades to dialogue-only.
 */
export function parseChoices(text: string): ParsedDialogue {
  const lines = text.split("\n");

  const markerIndex = lines.findIndex((line) => line.trim() === CHOICE_MARKER);

  if (markerIndex === -1) {
    return { dialogue: unescapeMarker(text), options: [] };
  }

  const dialogue = unescapeMarker(lines.slice(0, markerIndex).join("\n"));

  const options: string[] = [];
  for (const line of lines.slice(markerIndex + 1)) {
    if (options.length >= MAX_OPTIONS) break;
    const match = /^\s*\d+\.\s+(.+)$/.exec(line.trim());
    const optionText = match?.[1]?.trim();
    if (optionText && !options.includes(optionText)) {
      options.push(optionText);
    }
  }

  return { dialogue, options };
}

function unescapeMarker(text: string): string {
  return text.split(ESCAPED_MARKER).join(CHOICE_MARKER).trim();
}
