import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  beginDialogue,
  chooseOption,
  escapeDialogue,
  initialMachine,
} from "../../src/game/dialogue/machine";

describe("dialogue machine", () => {
  it("begins in idle", () => {
    expect(initialMachine.state).toBe("idle");
  });

  it("goes to speaking for a line without options", () => {
    const machine = beginDialogue({ speaker: "Narrator", text: "A wind blows.", options: [] });
    expect(machine.state).toBe("speaking");
    expect(machine.speaker).toBe("Narrator");
  });

  it("goes to choices when options are present", () => {
    const machine = beginDialogue({
      speaker: "Elder",
      text: "What will you do?",
      options: ["Ask", "Leave"],
    });
    expect(machine.state).toBe("choices");
    expect(machine.options).toHaveLength(2);
  });

  it("selecting an option ends the turn and records the choice", () => {
    const machine = chooseOption(
      beginDialogue({ speaker: "Elder", text: "t", options: ["A", "B"] }),
      1,
    );
    expect(machine.state).toBe("ended");
    expect(machine.selected).toBe(1);
  });

  it("escape always ends the interaction (always-escape)", () => {
    const speaking = escapeDialogue(beginDialogue({ speaker: "Elder", text: "t", options: [] }));
    const choosing = escapeDialogue(beginDialogue({ speaker: "Elder", text: "t", options: ["A"] }));

    expect(speaking.state).toBe("ended");
    expect(choosing.state).toBe("ended");
  });

  it("advance ends a speaking turn", () => {
    const machine = advanceDialogue(beginDialogue({ speaker: "N", text: "t", options: [] }));
    expect(machine.state).toBe("ended");
  });

  it("ignore escapes when already ended (idempotent)", () => {
    const ended = escapeDialogue(initialMachine);
    expect(escapeDialogue(ended).state).toBe("idle");
  });
});
