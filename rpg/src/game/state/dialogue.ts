import { signal } from "@preact/signals";

import {
  advanceDialogue as advanceMachine,
  beginDialogue,
  chooseOption,
  type DialogueMachine,
  escapeDialogue,
  initialMachine,
} from "../dialogue/machine";

export const dialogueMachine = signal<DialogueMachine>(initialMachine);

export const dialogueVisible = signal(false);

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
}

export function advanceDialogue() {
  dialogueMachine.value = advanceMachine(dialogueMachine.value);
}
