import { paginate } from "./paginate";

export type DialogueState = "idle" | "speaking" | "choices" | "ended";

export interface DialogueTurn {
  speaker: string;
  text: string;
  options: string[];
}

export interface DialogueMachine {
  state: DialogueState;
  speaker: string | null;
  /** Full turn text (kept for the dev context inspector); UI renders pages. */
  text: string;
  options: string[];
  selected: number | null;
  /** Text split into bounded pages (round-3 finding: pagination). */
  pages: string[];
  /** Current page index (0-based); advances via advanceDialogue. */
  page: number;
}

export const initialMachine: DialogueMachine = {
  state: "idle",
  speaker: null,
  text: "",
  options: [],
  selected: null,
  pages: [],
  page: 0,
};

/** Pure reducer: returns a new snapshot, never mutates. */
export function beginDialogue(
  turn: DialogueTurn,
  previous: DialogueMachine = initialMachine,
): DialogueMachine {
  if (previous.state !== "idle" && previous.state !== "ended") {
    return previous;
  }
  const pages = paginate(turn.text);
  // Always start speaking: the player reads the text pages first; options are
  // offered after the final page (classic VN) via advanceDialogue.
  return {
    ...previous,
    state: "speaking",
    speaker: turn.speaker,
    text: turn.text,
    options: turn.options,
    selected: null,
    pages,
    page: 0,
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

/**
 * Advances the turn one page at a time (round-3 finding: the box must not
 * grow with the full AI text). On the last page: offer choices if the turn
 * has them, otherwise end the turn.
 */
export function advanceDialogue(machine: DialogueMachine): DialogueMachine {
  if (machine.state !== "speaking") return machine;
  if (machine.page < machine.pages.length - 1) {
    return { ...machine, page: machine.page + 1 };
  }
  if (machine.options.length > 0) {
    return { ...machine, state: "choices" };
  }
  return { ...machine, state: "ended" };
}
