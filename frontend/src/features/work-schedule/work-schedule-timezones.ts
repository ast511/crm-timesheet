/**
 * Every IANA zone name this screen may offer — **built the same way the backend
 * builds the set it validates against.**
 *
 * `work-schedule.constants.ts` writes, verbatim:
 *
 * ```ts
 * const SUPPORTED_TIMEZONES: ReadonlySet<string> = new Set([
 *   ...Intl.supportedValuesOf('timeZone'),
 *   'UTC',
 * ]);
 * ```
 *
 * This file is that expression again, in the browser. That is the point: the
 * options a person can choose and the values `PUT /work-schedule` accepts are
 * the same list **by construction** rather than by two lists agreeing. A
 * hand-picked selection of twenty familiar zones would have been shorter and
 * would have made a company in a zone nobody thought of unconfigurable, while a
 * checked-in copy of the tz database would go stale the first time a zone is
 * added or renamed. Both sides read the platform's own tz database instead.
 *
 * **`UTC` is added explicitly**, and the backend's note says why: ECMA-402
 * canonicalises it separately, so it is absent from the enumeration while being
 * the one identifier every runtime understands — and the obvious answer for a
 * company that wants no local zone at all. Omitting it here would hide a value
 * the API accepts. It is de-duplicated rather than appended blindly, because a
 * runtime that does include it would otherwise produce two identical options.
 *
 * ## The one way the two sides can still differ
 *
 * They are two runtimes with two tz databases — an old browser against a
 * freshly updated server, or the reverse. Neither is worth guarding here: the
 * backend remains the source of truth, and a name it refuses arrives back as a
 * `VALIDATION_ERROR` naming `timezone`, which the form puts on the field. What
 * this construction removes is the *systematic* mismatch, where the UI simply
 * never offered a whole class of valid zones.
 */

/**
 * The zone a configuration starts out in, mirroring `DEFAULT_TIMEZONE` in
 * `work-schedule.constants.ts` and the `timezone` column's own default.
 *
 * Only ever *offered* — it pre-fills the field on a deployment where nothing
 * has been stored yet, exactly as the other values in `WORK_SCHEDULE_DEFAULTS`
 * do, and it is stored only when somebody presses Save.
 *
 * Deliberately **not** the browser's zone. `Intl.DateTimeFormat().resolvedOptions()`
 * would offer whatever laptop happens to be open, which is the machine's zone
 * rather than the company's — the precise confusion `lib/datetime.ts` requires
 * an explicit zone in every signature to prevent.
 */
export const DEFAULT_TIMEZONE = 'Europe/Bucharest';

/** Every zone the runtime recognises, sorted, `UTC` included exactly once. */
export const SUPPORTED_TIMEZONES: readonly string[] = [
  ...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']),
].sort((left, right) => left.localeCompare(right));

const SUPPORTED_TIMEZONE_SET: ReadonlySet<string> = new Set(SUPPORTED_TIMEZONES);

/**
 * Whether a string names a zone this runtime can interpret days in.
 *
 * An **exact** match, as `isSupportedTimezone` on the backend is: IANA names
 * have one canonical spelling, and folding `europe/bucharest` into
 * `Europe/Bucharest` here would let the form send a value the API refuses under
 * a different message than the one shown.
 *
 * A `Set` lookup rather than a scan over four hundred strings, built once at
 * module load rather than on every keystroke the resolver re-validates.
 */
export const isSupportedTimezone = (value: string): boolean =>
  SUPPORTED_TIMEZONE_SET.has(value);
