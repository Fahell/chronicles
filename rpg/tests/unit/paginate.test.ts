import { describe, expect, it } from "vitest";

import { paginate } from "../../src/game/dialogue/paginate";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("paginate", () => {
  it("returns a single empty page for empty/whitespace text", () => {
    expect(paginate("")).toEqual([""]);
    expect(paginate("   \n  ")).toEqual([""]);
  });

  it("keeps short text on a single page", () => {
    const pages = paginate("A short line.");
    expect(pages).toEqual(["A short line."]);
  });

  it("splits long text into bounded pages, preserving content", () => {
    const text =
      "First sentence of the elder. Second sentence about the harvest. " +
      "Third sentence warning about the wolves. Fourth sentence mentioning the well. " +
      "Fifth sentence about the festival. Sixth sentence and the weather. " +
      "Seventh sentence, the road ahead. Eighth sentence, the final word.";
    const pages = paginate(text, 80);

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(80);
      expect(page).toBeTruthy();
    }
    expect(normalize(pages.join(" "))).toBe(normalize(text));
  });

  it("breaks at sentence boundaries, not mid-sentence", () => {
    const pages = paginate("The sky darkens. The wind picks up. The rain begins to fall.", 30);
    // 30 chars fits roughly one short sentence per page — no sentence is cut.
    for (const page of pages) {
      const endsWithTerminator = /[.!?…]$/.test(page.trimEnd());
      expect(endsWithTerminator).toBe(true);
    }
  });

  it("preserves spacing when paragraphs are packed onto the same page", () => {
    const pages = paginate(
      "First paragraph. Second sentence.\n\nSecond paragraph. Another sentence.",
      200,
    );
    expect(pages).toHaveLength(1);
    expect(pages[0]).toBe("First paragraph. Second sentence. Second paragraph. Another sentence.");
  });

  it("never splits a paragraph mid-way (paragraphs pack only if they fit)", () => {
    const pages = paginate("Paragraph one.\n\nParagraph two.\n\nParagraph three.", 20);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toBe("Paragraph one.");
    expect(pages[1]).toBe("Paragraph two.");
    expect(pages[2]).toBe("Paragraph three.");
  });

  it("hard-splits a single over-long sentence at a word boundary", () => {
    const long = "word ".repeat(30).trim();
    const pages = paginate(long, 40);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(40);
      expect(page).toBeTruthy();
    }
    expect(normalize(pages.join(" "))).toBe(long);
  });

  it("word-splits when the limit is smaller than any word", () => {
    expect(paginate("hello world", 5)).toEqual(["hello", "world"]);
  });

  it("never hangs on a non-positive maxChars", () => {
    const pages = paginate("hello world", 0);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.join(" ").length).toBeGreaterThan(0);
  });
});
