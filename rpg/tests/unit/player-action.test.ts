import { describe, expect, it } from "vitest";

import { beginDialogue, initialMachine } from "../../src/game/dialogue/machine";
import {
  appendPlayerAction,
  closePlayerInput,
  openPlayerInput,
  playerInputOpen,
} from "../../src/game/state/dialogue";

describe("free-form player action (round 10)", () => {
  it("openPlayerInput / closePlayerInput toggle the input state", () => {
    openPlayerInput();
    expect(playerInputOpen.value).toBe(true);
    closePlayerInput();
    expect(playerInputOpen.value).toBe(false);
  });

  it("appendPlayerAction appends the typed action plus the finished NPC turn", () => {
    const machine = beginDialogue(
      { speaker: "Serran", text: "What do you want?", options: ["Ask", "Leave"] },
      initialMachine,
    );
    const before = [
      { speaker: "Serran", text: "Hello there." },
      { speaker: "player", text: "Hi." },
    ];

    const next = appendPlayerAction(before, machine, "I came to help.", 40);

    expect(next).toEqual([
      ...before,
      { speaker: "player", text: "I came to help." },
      { speaker: "Serran", text: "What do you want?" },
    ]);
  });

  it("appendPlayerAction caps the conversation to the last N turns", () => {
    const machine = beginDialogue(
      { speaker: "Serran", text: "Go on.", options: [] },
      initialMachine,
    );
    const before = Array.from({ length: 6 }, (_, i) => ({ speaker: "player", text: `turn ${i}` }));
    const next = appendPlayerAction(before, machine, "Action!", 4);
    expect(next.length).toBe(4);
    expect(next[next.length - 1]).toEqual({ speaker: "Serran", text: "Go on." });
  });

  it("appendPlayerAction drops empty actions", () => {
    const machine = beginDialogue(
      { speaker: "Serran", text: "Go on.", options: [] },
      initialMachine,
    );
    const before = [{ speaker: "Serran", text: "Hello." }];
    expect(appendPlayerAction(before, machine, "   ", 40)).toEqual(before);
  });
});
