import { signal } from "@preact/signals";

export interface DialogueLine {
  speaker: string;
  text: string;
}

export const dialogueVisible = signal(false);

export const currentLine = signal<DialogueLine | null>(null);

export function showLine(line: DialogueLine) {
  currentLine.value = line;
  dialogueVisible.value = true;
}

export function closeDialogue() {
  dialogueVisible.value = false;
  currentLine.value = null;
}
