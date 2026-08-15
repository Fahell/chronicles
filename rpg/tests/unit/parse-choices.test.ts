import { describe, expect, it } from "vitest";

import { parseChoices } from "../../src/game/dialogue/parse-choices";

describe("parseChoices (narrative-spec §3.1)", () => {
  it("splits dialogue text from the [choices] block", () => {
    const { dialogue, options } = parseChoices(
      "The elder studies you.\n\n[choices]\n1. Ask about the ruins\n2. Offer your help",
    );

    expect(dialogue).toContain("The elder studies you.");
    expect(options).toEqual(["Ask about the ruins", "Offer your help"]);
  });

  it("returns all text as dialogue when the marker is absent", () => {
    const { dialogue, options } = parseChoices("Just a line of dialogue.");

    expect(dialogue).toBe("Just a line of dialogue.");
    expect(options).toEqual([]);
  });

  it("treats a marker with zero valid options as dialogue-only", () => {
    const { dialogue, options } = parseChoices("Dialogue.\n\n[choices]\nnot a numbered option");

    expect(dialogue).toContain("Dialogue.");
    expect(options).toEqual([]);
  });

  it("caps options at 4 and trims them", () => {
    const { options } = parseChoices("[choices]\n1. a\n2. b\n3. c\n4. d\n5. e");

    expect(options).toHaveLength(4);
    expect(options[0]).toBe("a");
  });

  it("handles the escaped literal \\[choices\\] as dialogue text", () => {
    const { dialogue, options } = parseChoices(
      "He said \\[choices\\] are important.\n\n[choices]\n1. Agree",
    );

    expect(dialogue).toContain("[choices] are important.");
    expect(options).toEqual(["Agree"]);
  });

  it("never throws on malformed input", () => {
    expect(() => parseChoices("")).not.toThrow();
    expect(() => parseChoices("[choices]")).not.toThrow();
    expect(() => parseChoices("1. no marker")).not.toThrow();
  });
});
