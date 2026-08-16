/**
 * Dialogue text pagination (Perchance round 3 finding: the dialogue box grew
 * unbounded with long AI text). Pure + deterministic — the machine stores the
 * page list and the current page; the UI renders one page at a time.
 *
 * Strategy: pack sentences into pages up to `maxChars`, breaking at paragraph
 * and sentence boundaries. A single over-long sentence is hard-split at the
 * nearest word boundary. Content is preserved (pages joined with a space
 * reproduce the normalized input).
 */

export const DEFAULT_PAGE_MAX_CHARS = 280;

export function paginate(text: string, maxChars: number = DEFAULT_PAGE_MAX_CHARS): string[] {
  const limit = Math.max(1, Math.floor(maxChars));
  const normalized = text.trim();
  if (!normalized) return [""];

  const chunks = splitIntoChunks(normalized);
  const pages: string[] = [];
  let current = "";

  for (const chunk of chunks) {
    if (chunk.length > limit) {
      if (current) {
        pages.push(current.trim());
        current = "";
      }
      pages.push(...hardSplit(chunk, limit));
      continue;
    }
    if (current && current.length + chunk.length > limit) {
      pages.push(current.trim());
      current = chunk;
    } else {
      current += chunk;
    }
  }
  if (current.trim()) pages.push(current.trim());

  return pages.length > 0 ? pages : [""];
}

/**
 * Sentence-level chunks (pages break at sentence boundaries, never mid-way);
 * paragraphs are hard boundaries only in the sense that their sentences pack
 * in order. Each paragraph's LAST sentence keeps a trailing space so that
 * paragraphs packed onto the same page preserve the original spacing (the
 * page flush trims boundaries).
 */
function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const sentences: string[] = [];
    const re = /[^.!?…]*[.!?…]+[ \t]*|[^.!?…]+[ \t]*/g;
    for (const match of trimmed.matchAll(re)) {
      // Keep the trailing whitespace so concatenating sentences on the same
      // page preserves the original spacing.
      if (match[0]) sentences.push(match[0]);
    }
    const list = sentences.length > 0 ? sentences : [trimmed];
    const last = list.length - 1;
    chunks.push(...list.map((s, i) => (i === last && !s.endsWith(" ") ? `${s} ` : s)));
  }
  return chunks;
}

/** Cut an over-long chunk at the nearest word boundary before `limit`. */
function hardSplit(chunk: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = chunk;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(" ", limit);
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest.trim());
  return parts;
}
