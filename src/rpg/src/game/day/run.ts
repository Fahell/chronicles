/**
 * End-of-day processing run — System 1 (day-cycle-spec §5).
 *
 * Triggered by sleep (or night-budget exhaustion). For the NPCs that had
 * interactions that day:
 * 1. collect each NPC's day log (only the day's log — no bond state, no
 *    traits, per the interview decision in §5.2);
 * 2. ONE batched LLM call per up-to-2 NPCs (with clear log separation so the
 *    model does not mix them, §5.2) emits scoring + daily summaries;
 * 3. malformed output → bounded re-call (cap MAX_SCORING_ATTEMPTS, §5.3);
 * 4. deltas are applied to the directed web edges (user→NPC and NPC→user,
 *    clamped to ±100, §5.4) — stats are NOT updated;
 * 5. daily summaries are stored (`daySummaries`) and scoring is logged as
 *    relation-event entries in the character log (observability).
 *
 * Batching (round 12): up to 2 NPCs per call, combined only when their day
 * logs fit the safety threshold (BATCH_CHARS_LIMIT ≈ 20k, §5.2); otherwise
 * one NPC per call. Output blocks are separated per NPC (`--- <name>`), each
 * parsed with the same line contract as §5.3 — any malformed block rejects
 * the whole batch and re-calls it (bounded, never an infinite loop).
 */

import type { CharacterLogEntry } from "../../services/db";
import type { TextService } from "../../services/perchance-runtime";
import type { LogStore } from "../logs/store";
import type { RelationshipStore } from "../relationships/store";
import type { SlotId } from "../save/types";
import { DAILY_DELTA_MAX, parseScoringOutput, type ScoringOutput } from "./scoring";

/** Re-call cap per batch (§5.3: 2–3 attempts; never an infinite loop). */
export const MAX_SCORING_ATTEMPTS = 3;

/** The web node id of the user (matches the scene actor characterId). */
export const USER_NODE = "player";

/** Combined-log safety threshold for batching (§5.2 baseline ~20k). */
export const BATCH_CHARS_LIMIT = 20_000;

/** Max NPCs combined in one scoring call (§5.2 baseline). */
export const BATCH_NPCS = 2;

export interface NpcDayLog {
  characterId: string;
  npcName: string;
  /** The day's turn/action entries (dayLogs view, oldest first). */
  entries: CharacterLogEntry[];
}

export interface NpcDayResult {
  characterId: string;
  npcName: string;
  /** null when scoring attempts were exhausted — no score for the day (§5.3). */
  userToNpc: number | null;
  npcToUser: number | null;
  reason: string;
  /** The NPC's day-memory blurb (§5.3) — null when scoring failed. */
  dayMemory: string | null;
  attempts: number;
}

export interface EndOfDayDeps {
  text: Pick<TextService, "generate">;
  logs: LogStore;
  bonds: RelationshipStore;
}

export interface EndOfDayInput {
  slotId: SlotId;
  /** The day that just ended (sleep triggers the run, §5). */
  dayId: number;
  /** The period in which the day ended (logged for observability). */
  period: string;
  npcs: NpcDayLog[];
}

export interface EndOfDayResult {
  dayId: number;
  npcs: NpcDayResult[];
}

function renderDayLog(npcName: string, entries: CharacterLogEntry[]): string {
  if (entries.length === 0) return "(no conversation this day)";
  return entries
    .map((e) => {
      const speaker = e.owner === "user" ? "The player" : npcName;
      return `${speaker}: ${e.text}`;
    })
    .join("\n");
}

/** Builds one scoring instruction for a batch of NPCs (logs clearly separated). */
function buildScoringInstruction(input: {
  dayId: number;
  period: string;
  npcs: { npcName: string; npcId: string; dayLog: string }[];
}): string {
  const npcBlocks = input.npcs
    .map((npc, i) => `NPC ${i + 1} — ${npc.npcName} (${npc.npcId}):\n${npc.dayLog}`)
    .join("\n\n");

  return `You are the world-scoring process of a visual-novel RPG. Score how the player treated each NPC, and how each NPC treated the player, during day ${input.dayId} (${input.period}) of the story. Use ONLY the day logs below — ignore anything else (no bond history, no backstories).

Day logs (keep them separate — never mix one NPC's log with another's):
${npcBlocks}

Output EXACTLY one block per NPC, in the SAME order as above. Each block starts with a line "--- <npc name>" and contains exactly these lines:
--- ${input.npcs.map((n) => n.npcName).join("\n--- ")}
user->npc: <integer from -${DAILY_DELTA_MAX} to +${DAILY_DELTA_MAX} — how the PLAYER treated THIS NPC; positive = warmer/closer, negative = colder/harsher>
npc->user: <integer from -${DAILY_DELTA_MAX} to +${DAILY_DELTA_MAX} — how THIS NPC treated the PLAYER>
reason: <one short line, up to ~120 chars, explaining the scores>
day-memory: <one short sentence THIS NPC remembers from this day>

Example:
--- ${input.npcs[0]!.npcName}
user->npc: +2
npc->user: 0
reason: They shared stories by the fire.
day-memory: We talked about the ruins.`;
}

/** Splits the output into per-NPC blocks (`--- <name>` separated). */
function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current = "";
  let seenHeader = false;
  for (const raw of text.split("\n")) {
    if (raw.trim().startsWith("--- ")) {
      if (seenHeader && current.trim().length > 0) blocks.push(current);
      current = "";
      seenHeader = true;
    } else {
      current += raw + "\n";
    }
  }
  if (seenHeader && current.trim().length > 0) blocks.push(current);
  return blocks;
}

/** Splits the day logs into batches of ≤ BATCH_NPCS within the chars limit. */
function batchNpcs(npcs: NpcDayLog[]): NpcDayLog[][] {
  const batches: NpcDayLog[][] = [];
  for (let i = 0; i < npcs.length; i += BATCH_NPCS) {
    const batch = npcs.slice(i, i + BATCH_NPCS);
    const combinedChars = batch.reduce(
      (n, npc) => n + npc.entries.reduce((m, e) => m + e.chars, 0),
      0,
    );
    if (batch.length > 1 && combinedChars > BATCH_CHARS_LIMIT) {
      // The combined logs do not fit — deliver one NPC per call (§5.2).
      batches.push([batch[0]!]);
      batches.push([batch[1]!]);
    } else {
      batches.push(batch);
    }
  }
  return batches;
}

/**
 * Runs the end-of-day processing. Malformed output is re-called up to
 * MAX_SCORING_ATTEMPTS per batch; when exhausted, the batch's NPCs get no
 * score for the day (recorded in the logs, §5.3). Never loops forever.
 */
export async function runEndOfDay(
  deps: EndOfDayDeps,
  input: EndOfDayInput,
): Promise<EndOfDayResult> {
  const results: NpcDayResult[] = [];

  for (const batch of batchNpcs(input.npcs)) {
    const batchLogs = batch.map((npc) => ({
      npcName: npc.npcName,
      npcId: npc.characterId,
      dayLog: renderDayLog(npc.npcName, npc.entries),
    }));
    const instruction = buildScoringInstruction({
      dayId: input.dayId,
      period: input.period,
      npcs: batchLogs,
    });

    let blocks: string[] = [];
    let attempts = 0;
    for (; attempts < MAX_SCORING_ATTEMPTS; attempts++) {
      const { text } = await deps.text.generate({ instruction });
      blocks = splitBlocks(text);
      if (blocks.length === batch.length && blocks.every((b) => parseScoringOutput(b) !== null)) {
        break;
      }
      blocks = [];
    }

    const exhausted = blocks.length !== batch.length;
    const parsed: (ScoringOutput | null)[] = exhausted
      ? batch.map(() => null)
      : blocks.map((b) => parseScoringOutput(b));

    for (let i = 0; i < batch.length; i++) {
      const npc = batch[i]!;
      const score = parsed[i];
      const ok = score !== null;
      const result: NpcDayResult = {
        characterId: npc.characterId,
        npcName: npc.npcName,
        userToNpc: ok ? score!.userToNpc : null,
        npcToUser: ok ? score!.npcToUser : null,
        reason: ok
          ? score!.reason
          : `scoring output malformed after ${attempts} attempts — no score for the day`,
        dayMemory: ok ? score!.dayMemory : null,
        attempts,
      };
      results.push(result);

      if (ok) {
        // Apply deltas to the directed web edges (§5.4) — stats are NOT updated.
        await deps.bonds.applyDelta(input.slotId, USER_NODE, npc.characterId, result.userToNpc!);
        await deps.bonds.applyDelta(input.slotId, npc.characterId, USER_NODE, result.npcToUser!);
        await deps.logs.putSummary({
          slotId: input.slotId,
          dayId: input.dayId,
          characterId: npc.characterId,
          summary: result.dayMemory!,
          scoreUserToNpc: result.userToNpc!,
          scoreNpcToUser: result.npcToUser!,
          reason: result.reason,
        });
      }

      // Observability: log the relation-event (+ summary entry) per NPC (§4).
      await deps.logs.append({
        slotId: input.slotId,
        characterId: npc.characterId,
        type: "relation-event",
        owner: "world",
        dayId: input.dayId,
        period: input.period,
        text: ok
          ? `Day ${input.dayId} scoring: user→${npc.characterId} ${result.userToNpc}, ${npc.characterId}→user ${result.npcToUser} — ${result.reason}`
          : result.reason,
      });
      if (ok) {
        await deps.logs.append({
          slotId: input.slotId,
          characterId: npc.characterId,
          type: "summary",
          owner: "npc",
          dayId: input.dayId,
          period: input.period,
          text: result.dayMemory!,
        });
      }
    }
  }

  return { dayId: input.dayId, npcs: results };
}
