import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  beginDialogue,
  chooseOption,
  escapeDialogue,
  initialMachine,
} from "../../src/game/dialogue/machine";

// Longer than DEFAULT_PAGE_MAX_CHARS (280) so pagination actually splits it.
const LONG_TEXT = [
  "The elder studies you with tired eyes. The harvest was thin this year.",
  "The wolves grow bolder with the cold. The villagers speak of omens.",
  "You must decide what the village needs before the frost sets in.",
  "The smith speaks of iron and fire, of blades that remember their temper.",
  "The children gather at the well, whispering of shapes in the wheat.",
].join(" ");

describe("dialogue machine", () => {
  it("begins in idle", () => {
    expect(initialMachine.state).toBe("idle");
  });

  it("goes to speaking for a line without options", () => {
    const machine = beginDialogue({ speaker: "Narrator", text: "A wind blows.", options: [] });
    expect(machine.state).toBe("speaking");
    expect(machine.speaker).toBe("Narrator");
    expect(machine.pages).toEqual(["A wind blows."]);
    expect(machine.page).toBe(0);
  });

  it("starts speaking even with options — choices come after the final page", () => {
    const machine = beginDialogue({
      speaker: "Elder",
      text: "What will you do?",
      options: ["Ask", "Leave"],
    });
    expect(machine.state).toBe("speaking");
    expect(machine.options).toHaveLength(2);
  });

  it("paginates long text and advances page by page", () => {
    const machine = beginDialogue({ speaker: "Elder", text: LONG_TEXT, options: [] });
    expect(machine.pages.length).toBeGreaterThan(1);
    expect(machine.page).toBe(0);

    const page2 = advanceDialogue(machine);
    expect(page2.state).toBe("speaking");
    expect(page2.page).toBe(1);
    expect(page2.text).toBe(machine.text);
  });

  it("advance on the last page ends a turn without options", () => {
    const machine = beginDialogue({ speaker: "N", text: "t", options: [] });
    const ended = advanceDialogue(machine);
    expect(ended.state).toBe("ended");
  });

  it("advance on the last page reveals options, then a choice ends the turn", () => {
    const machine = beginDialogue({
      speaker: "Elder",
      text: "The village needs a leader. Who will it be?",
      options: ["I will", "The smith will"],
    });
    const choosing = advanceDialogue(machine);
    expect(choosing.state).toBe("choices");
    expect(choosing.page).toBe(machine.pages.length - 1);

    const ended = chooseOption(choosing, 0);
    expect(ended.state).toBe("ended");
    expect(ended.selected).toBe(0);
  });

  it("selecting an option is only valid in the choices state", () => {
    const speaking = beginDialogue({ speaker: "Elder", text: "t", options: ["A", "B"] });
    expect(chooseOption(speaking, 1).state).toBe("speaking");
  });

  it("escape always ends the interaction (always-escape)", () => {
    const speaking = escapeDialogue(beginDialogue({ speaker: "Elder", text: "t", options: [] }));
    const choosing = escapeDialogue(beginDialogue({ speaker: "Elder", text: "t", options: ["A"] }));
    const midPage = escapeDialogue(
      advanceDialogue(beginDialogue({ speaker: "Elder", text: LONG_TEXT, options: [] })),
    );

    expect(speaking.state).toBe("ended");
    expect(choosing.state).toBe("ended");
    expect(midPage.state).toBe("ended");
  });

  it("advance is a no-op outside speaking", () => {
    const idle = advanceDialogue(initialMachine);
    const ended = advanceDialogue(
      escapeDialogue(beginDialogue({ speaker: "N", text: "t", options: [] })),
    );
    expect(idle.state).toBe("idle");
    expect(ended.state).toBe("ended");
  });
});
