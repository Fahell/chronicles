export type DialogueState = "idle" | "speaking" | "choices" | "ended";

export interface DialogueTurn {
  speaker: string;
  text: string;
  options: string[];
}

export interface DialogueMachine {
  state: DialogueState;
  speaker: string | null;
  text: string;
  options: string[];
  selected: number | null;
}

export const initialMachine: DialogueMachine = {
  state: "idle",
  speaker: null,
  text: "",
  options: [],
  selected: null,
};

/** Pure reducer: returns a new snapshot, never mutates. */
export function beginDialogue(
  turn: DialogueTurn,
  previous: DialogueMachine = initialMachine,
): DialogueMachine {
  if (previous.state !== "idle" && previous.state !== "ended") {
    return previous;
  }
  return {
    ...previous,
    state: turn.options.length > 0 ? "choices" : "speaking",
    speaker: turn.speaker,
    text: turn.text,
    options: turn.options,
    selected: null,
  };
}

export function chooseOption(machine: DialogueMachine, index: number): DialogueMachine {
  if (machine.state !== "choices" || index < 0 || index >= machine.options.length) {
    return machine;
  }
  return { ...machine, state: "ended", selected: index };
}

export function escapeDialogue(machine: DialogueMachine): DialogueMachine {
  if (machine.state === "idle" || machine.state === "ended") return machine;
  return { ...machine, state: "ended", selected: null };
}

export function advanceDialogue(machine: DialogueMachine): DialogueMachine {
  if (machine.state !== "speaking") return machine;
  return { ...machine, state: "ended" };
}
