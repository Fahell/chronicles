import { signal } from "@preact/signals";

import {
  advanceDialogue as advanceMachine,
  beginDialogue,
  chooseOption,
  type DialogueMachine,
  escapeDialogue,
  initialMachine,
} from "../dialogue/machine";
import type { ConversationTurn } from "../payload/builder";

export const dialogueMachine = signal<DialogueMachine>(initialMachine);

export const dialogueVisible = signal(false);

/** True while a text generation is in flight (thinking state). */
export const dialoguePending = signal(false);

/** Speaker name to show on the thinking line while a generation is in flight. */
export const pendingSpeaker = signal<string | null>(null);

/** True while the free-form "write your own action" input box is open. */
export const playerInputOpen = signal(false);

/** Max length of a typed player action (protects the context window). */
export const PLAYER_ACTION_MAX = 300;

export function showTurn(speaker: string, text: string, options: string[] = []) {
  dialogueMachine.value = beginDialogue({ speaker, text, options });
  dialogueVisible.value = true;
}

export function selectOption(index: number) {
  dialogueMachine.value = chooseOption(dialogueMachine.value, index);
}

export function closeDialogue() {
  dialogueMachine.value = escapeDialogue(dialogueMachine.value);
  dialogueVisible.value = false;
  playerInputOpen.value = false;
}

export function advanceDialogue() {
  dialogueMachine.value = advanceMachine(dialogueMachine.value);
}

/** Opens the free-form player-action input box (round 10). */
export function openPlayerInput() {
  playerInputOpen.value = true;
}

/** Closes the input box without submitting (returns to the choices). */
export function closePlayerInput() {
  playerInputOpen.value = false;
}

/**
 * Appends a typed player action to the conversation (round 10): the action
 * itself plus the finished NPC turn, capped to the last N turns. Empty
 * actions are dropped (the conversation is returned unchanged).
 */
export function appendPlayerAction(
  conversation: ConversationTurn[],
  machine: DialogueMachine,
  action: string,
  cap = 40,
): ConversationTurn[] {
  const trimmed = action.trim();
  if (!trimmed) return conversation;
  const next = [
    ...conversation,
    { speaker: "player", text: trimmed },
    { speaker: machine.speaker ?? "npc", text: machine.text },
  ];
  return next.slice(-cap);
}
