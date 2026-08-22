/**
 * Coherence notes the form *shows* and never *enforces*.
 *
 * ## Why these are not Zod rules
 *
 * A configuration whose standard day exceeds its own daily maximum is almost
 * certainly a typo, and telling somebody so is worth doing. But the backend
 * accepts it: `assertEntryRangeIsOrdered` is the **only** cross-field rule
 * `WorkScheduleService` has, and neither of the two below appears anywhere in
 * the DTO's decorators. Making them blocking would refuse a body the API would
 * have stored — the one direction `CLAUDE.md` says a browser check must never
 * err in, because a person cannot argue with it and has no other way to save.
 *
 * So they are rendered as a note beside the Save button, in a neutral tone,
 * and the button stays live. The person is told what looks wrong and decides;
 * `maxHoursPerEntry ≤ minHoursPerEntry`, which the server really does refuse,
 * is a field error in `work-schedule-schemas.ts` instead. The difference between
 * the two treatments is exactly the difference between "this will be rejected"
 * and "this looks like a mistake", and conflating them is how a form ends up
 * lying about which is which.
 *
 * If the backend ever adopts either rule, it moves into the schema and out of
 * here — the same one-place-to-change note F10 left about its `409`.
 */

/** The advisory keys, each an i18n key under `workSchedule.advisories`. */
export type WorkScheduleAdvisory =
  | 'standardDayAboveDailyMaximum'
  | 'entryMaximumAboveDailyMaximum';

/**
 * Reads a number out of a field the form holds as a string.
 *
 * Returns `null` for anything not yet a number — a half-typed `8.`, an empty
 * input, a cleared field — so an advisory never fires on a value somebody is in
 * the middle of writing. Advisories are for finished, plausible numbers that
 * disagree with each other.
 */
const toNumber = (value: string): number | null => {
  const trimmed = value.trim();

  if (trimmed === '') return null;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
};

const exceeds = (left: string, right: string): boolean => {
  const a = toNumber(left);
  const b = toNumber(right);

  return a !== null && b !== null && a > b;
};

/**
 * The three fields the notes are about — named rather than taking the whole
 * form, so the caller subscribes to exactly these and re-renders on nothing
 * else. Strings, because that is what the inputs hold until the schema's
 * transforms run on the way out.
 */
export interface WorkScheduleAdvisoryInput {
  maxHoursPerDay: string;
  standardHoursPerDay: string;
  maxHoursPerEntry: string;
}

/**
 * Which notes apply to the values currently in the form.
 *
 * Called on watched values, so the notes appear and disappear as the numbers
 * change rather than only after a failed submit — they are guidance, and
 * guidance that arrives at submit time has already let the mistake happen.
 */
export const workScheduleAdvisories = (
  values: WorkScheduleAdvisoryInput,
): WorkScheduleAdvisory[] => {
  const advisories: WorkScheduleAdvisory[] = [];

  /*
   * A standard day longer than the day's own ceiling: every timesheet would
   * have to breach the maximum to be considered complete.
   */
  if (exceeds(values.standardHoursPerDay, values.maxHoursPerDay)) {
    advisories.push('standardDayAboveDailyMaximum');
  }

  /*
   * A single entry allowed to be longer than the whole day: the larger bound
   * can never be reached, so it states a permission the day-level rule takes
   * straight back.
   */
  if (exceeds(values.maxHoursPerEntry, values.maxHoursPerDay)) {
    advisories.push('entryMaximumAboveDailyMaximum');
  }

  return advisories;
};
