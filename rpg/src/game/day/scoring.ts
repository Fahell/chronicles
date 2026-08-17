/**
 * End-of-day scoring output parser (day-cycle-spec §5.3).
 *
 * The scoring call emits a line-oriented, parseable block — the same
 * philosophy as the choice format (narrative-spec §3.1: never JSON):
 *
 * ```
 * user->npc: +3
 * npc->user: -1
 * reason: <one short line per direction or combined>
 * day-memory: <short blurb the NPC remembers of the day>
 * ```
 *
 * Contract (robust, never crashes): any malformed line (missing, non-integer,
 * out of the ±5 daily delta bounds) rejects the whole block → the caller
 * re-issues the call (bounded re-call, day-cycle-spec §5.3). Deltas outside
 * ±5 are treated as malformed: the daily delta bound is a hard contract.
 */

/** Max per-day delta magnitude (day-cycle-spec §5.4 baseline, tunable). */
export const DAILY_DELTA_MAX = 5;

export interface ScoringOutput {
  /** user → NPC delta (−5..+5). */
  userToNpc: number;
  /** NPC → user delta (−5..+5). */
  npcToUser: number;
  /** One short line explaining the scores (may be combined). */
  reason: string;
  /** Short blurb the NPC remembers of the day (daily summary seed, §5.5). */
  dayMemory: string;
}

const DELTA_RE = /^([+-]?\d+)$/;

function parseDelta(line: string, prefix: string): number | null {
  const body = line.slice(prefix.length).trim();
  if (!body.startsWith(":")) return null;
  const raw = body.slice(1).trim();
  const match = DELTA_RE.exec(raw);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > DAILY_DELTA_MAX) return null;
  return value;
}

function parseTextLine(line: string, prefix: string): string | null {
  const body = line.slice(prefix.length).trim();
  if (!body.startsWith(":")) return null;
  const text = body.slice(1).trim();
  return text.length > 0 ? text : null;
}

/**
 * Parses a scoring block. Returns null when any required line is missing or
 * malformed (caller re-issues the call, bounded). Extra lines are ignored
 * (the model may add a blank line or stray prose).
 */
export function parseScoringOutput(text: string): ScoringOutput | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let userToNpc: number | null = null;
  let npcToUser: number | null = null;
  let reason: string | null = null;
  let dayMemory: string | null = null;

  for (const line of lines) {
    if (line.startsWith("user->npc")) {
      if (userToNpc !== null) return null;
      userToNpc = parseDelta(line, "user->npc");
      if (userToNpc === null) return null;
    } else if (line.startsWith("npc->user")) {
      if (npcToUser !== null) return null;
      npcToUser = parseDelta(line, "npc->user");
      if (npcToUser === null) return null;
    } else if (line.startsWith("reason")) {
      if (reason !== null) return null;
      reason = parseTextLine(line, "reason");
      if (reason === null) return null;
    } else if (line.startsWith("day-memory")) {
      if (dayMemory !== null) return null;
      dayMemory = parseTextLine(line, "day-memory");
      if (dayMemory === null) return null;
    }
  }

  if (userToNpc === null || npcToUser === null || reason === null || dayMemory === null) {
    return null;
  }
  return { userToNpc, npcToUser, reason, dayMemory };
}
