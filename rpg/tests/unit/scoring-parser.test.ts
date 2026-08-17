import { describe, expect, it } from "vitest";
import { DAILY_DELTA_MAX, parseScoringOutput } from "../../src/game/day/scoring";

describe("end-of-day scoring parser (day-cycle-spec §5.3)", () => {
  it("parses a valid block", () => {
    const parsed = parseScoringOutput(`user->npc: +3
npc->user: -1
reason: She softened when he asked about her brother.
day-memory: The traveler asked about my brother.`);
    expect(parsed).toEqual({
      userToNpc: 3,
      npcToUser: -1,
      reason: "She softened when he asked about her brother.",
      dayMemory: "The traveler asked about my brother.",
    });
  });

  it("accepts zero deltas and whitespace padding", () => {
    const parsed = parseScoringOutput(`
      user->npc: 0
      npc->user: 0
      reason: Quiet day, nothing notable.
      day-memory: A quiet day at the valley.
    `);
    expect(parsed).toEqual({
      userToNpc: 0,
      npcToUser: 0,
      reason: "Quiet day, nothing notable.",
      dayMemory: "A quiet day at the valley.",
    });
  });

  it("rejects a block missing any required line", () => {
    expect(parseScoringOutput("user->npc: +1\nnpc->user: +1\nreason: ok")).toBeNull();
    expect(parseScoringOutput("user->npc: +1")).toBeNull();
    expect(parseScoringOutput("")).toBeNull();
  });

  it("rejects non-integer deltas", () => {
    const text = `user->npc: +3.5
npc->user: 1
reason: ok
day-memory: ok`;
    expect(parseScoringOutput(text)).toBeNull();
  });

  it("rejects deltas beyond the daily bound (hard contract, §5.4)", () => {
    const text = `user->npc: +${DAILY_DELTA_MAX + 1}
npc->user: 0
reason: ok
day-memory: ok`;
    expect(parseScoringOutput(text)).toBeNull();
  });

  it("rejects duplicated lines", () => {
    const text = `user->npc: +1
user->npc: +2
npc->user: 0
reason: ok
day-memory: ok`;
    expect(parseScoringOutput(text)).toBeNull();
  });

  it("ignores stray prose lines around the block", () => {
    const text = `Some narrator preamble the model added.

user->npc: +2
npc->user: +2
reason: They shared stories by the fire.
day-memory: We traded stories about the ruins.`;
    const parsed = parseScoringOutput(text);
    expect(parsed?.userToNpc).toBe(2);
    expect(parsed?.dayMemory).toContain("ruins");
  });
});
