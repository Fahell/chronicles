/**
 * In-game day clock (day-cycle-spec §3).
 *
 * A day is a sequence of periods (baseline: Morning / Afternoon / Night,
 * tunable). Each period holds a budget of scenes/interactions (baseline:
 * SCENES_PER_PERIOD). When a period's budget is spent, the next interaction
 * advances the clock to the next period; when Night's budget is spent the day
 * ends and the next interaction starts a new day. Sleeping ends the day
 * immediately ("or earlier, by choice" — sleep is a player action, §3).
 *
 * Pure logic — no stores, no signals — so the transitions are unit-testable.
 */

/** Baseline periods (tunable). Order defines the day progression. */
export const PERIODS = ["morning", "afternoon", "night"] as const;
export type Period = (typeof PERIODS)[number];

/** Interactions/scenes a period can hold before the clock advances (baseline). */
export const SCENES_PER_PERIOD = 3;

/** The period a brand-new game starts in (the open-plains scene is twilight). */
export const INITIAL_PERIOD: Period = "afternoon";

/** The day the game starts on. */
export const INITIAL_DAY = 1;

export interface DayState {
  day: number;
  period: Period;
  /** Interactions consumed in the current period (budget: SCENES_PER_PERIOD). */
  scenesInPeriod: number;
}

export function isPeriod(value: string): value is Period {
  return (PERIODS as readonly string[]).includes(value);
}

/**
 * Maps a persisted period string to the baseline set. Saves created before
 * the day system used the stub `"dusk"` (rounds 9-11); unknown values fall
 * back to the initial period so old saves load cleanly.
 */
export function normalizePeriod(value: string): Period {
  return isPeriod(value) ? value : INITIAL_PERIOD;
}

/** Day state of a brand-new game. */
export function initialDayState(): DayState {
  return { day: INITIAL_DAY, period: INITIAL_PERIOD, scenesInPeriod: 0 };
}

/**
 * Consumes one interaction in the current period. When the period's budget is
 * spent the clock advances to the next period; when Night's budget is spent
 * the day ends (day + 1, Morning).
 */
export function advanceScene(state: DayState): DayState {
  const next = state.scenesInPeriod + 1;
  if (next < SCENES_PER_PERIOD) {
    return { ...state, scenesInPeriod: next };
  }
  const idx = PERIODS.indexOf(state.period);
  if (idx === PERIODS.length - 1) {
    // Night's budget spent — the day ends and a new one begins.
    return { day: state.day + 1, period: PERIODS[0], scenesInPeriod: 0 };
  }
  return { day: state.day, period: PERIODS[idx + 1]!, scenesInPeriod: 0 };
}

/** Ends the day by choice (sleep): the next day starts in the Morning. */
export function sleep(state: DayState): DayState {
  return { day: state.day + 1, period: PERIODS[0], scenesInPeriod: 0 };
}
