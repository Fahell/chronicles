import { describe, expect, it } from "vitest";
import {
  advanceScene,
  INITIAL_PERIOD,
  initialDayState,
  normalizePeriod,
  PERIODS,
  SCENES_PER_PERIOD,
  sleep,
} from "../../src/game/day/clock";

describe("day clock (day-cycle-spec §3)", () => {
  it("starts on day 1 in the initial period with no interactions", () => {
    expect(initialDayState()).toEqual({ day: 1, period: INITIAL_PERIOD, scenesInPeriod: 0 });
  });

  it("consumes interactions within the period budget", () => {
    let state = initialDayState();
    for (let i = 1; i < SCENES_PER_PERIOD; i++) {
      state = advanceScene(state);
      expect(state.day).toBe(1);
      expect(state.period).toBe(INITIAL_PERIOD);
      expect(state.scenesInPeriod).toBe(i);
    }
  });

  it("advances to the next period when the budget is spent", () => {
    let state = initialDayState();
    for (let i = 0; i < SCENES_PER_PERIOD; i++) state = advanceScene(state);
    const idx = PERIODS.indexOf(INITIAL_PERIOD);
    expect(state.period).toBe(PERIODS[(idx + 1) % PERIODS.length]);
    expect(state.scenesInPeriod).toBe(0);
  });

  it("ends the day when night's budget is spent (day + 1, morning)", () => {
    let state = initialDayState();
    // Walk to the start of night, then exhaust night's budget.
    while (state.period !== "night") state = advanceScene(state);
    for (let i = 0; i < SCENES_PER_PERIOD; i++) state = advanceScene(state);
    expect(state.day).toBe(2);
    expect(state.period).toBe("morning");
    expect(state.scenesInPeriod).toBe(0);
  });

  it("sleep ends the day by choice, from any period", () => {
    const state = sleep({ day: 3, period: "morning", scenesInPeriod: 1 });
    expect(state).toEqual({ day: 4, period: "morning", scenesInPeriod: 0 });
  });

  it("normalizes legacy periods (the pre-day stub 'dusk') to the baseline", () => {
    expect(normalizePeriod("dusk")).toBe(INITIAL_PERIOD);
    expect(normalizePeriod("morning")).toBe("morning");
    expect(normalizePeriod("afternoon")).toBe("afternoon");
    expect(normalizePeriod("night")).toBe("night");
  });
});
