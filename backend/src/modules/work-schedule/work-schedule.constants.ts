import { Weekday } from '../../generated/prisma/enums';

/**
 * The work-schedule module's magic numbers and literals, in one place.
 *
 * Unlike the other modules, almost nothing here bounds a text column: the
 * configuration is numbers and one enum. What the bounds do instead is keep a
 * *stated* value physically possible — a day has 24 hours whoever is
 * configuring it — and keep every number inside the `decimal(5,2)` columns that
 * hold them.
 */

/**
 * The primary key of the one and only configuration row.
 *
 * The same literal is the column's default in `schema.prisma`, and that is
 * deliberate: the default is what makes a second `INSERT` collide on the
 * primary key instead of quietly becoming a second configuration, and this
 * constant is what every read and write in the service addresses. Change one
 * and the other has to change with it — there is no way to derive either from
 * the other, so both sides carry the note.
 */
export const WORK_SCHEDULE_ID = 'work_schedule';

/**
 * `HH:mm`, 24-hour, zero-padded: `09:00`, `18:30`, `00:00`.
 *
 * Anchored at both ends, so `9:00` and `09:00:00` are rejected rather than
 * stored as a second spelling of a time the column is sized for exactly once.
 * The hour alternation (`[01]\d|2[0-3]`) is what makes `24:00` and `25:00`
 * invalid — a length check alone would let both through.
 */
export const WORK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The zone a configuration starts out in.
 *
 * The same literal is the `timezone` column's default in `schema.prisma`, for
 * the same reason {@link WORK_SCHEDULE_ID} is duplicated there: neither side can
 * derive the other, so both carry the note that they move together. Here it is
 * additionally the example in the validation message, so an administrator who
 * sends an offset is shown the shape of a name rather than only told the value
 * was wrong.
 *
 * Bucharest rather than `UTC`, because it is what this deployment has always
 * meant in practice and a default that quietly re-grouped a running company's
 * days would be exactly the retroactive re-interpretation the column's comment
 * warns about.
 */
export const DEFAULT_TIMEZONE = 'Europe/Bucharest';

/**
 * Every IANA zone name this runtime recognises.
 *
 * Built from `Intl.supportedValuesOf('timeZone')` — the tz database the platform
 * already ships and already keeps updated — rather than from a list checked into
 * this repository. A hand-maintained list is a list that goes stale: zones are
 * added and renamed, and one that lags would refuse a name the same runtime is
 * perfectly able to resolve.
 *
 * `UTC` is added explicitly because ECMA-402 leaves it out of that set on
 * purpose: the specification canonicalises it separately, so it is absent from
 * the enumeration while being the one identifier every runtime understands — and
 * the obvious answer for a company that wants no local zone at all. Omitting it
 * would make the most defensible configuration a `400`.
 *
 * A `Set`, so the check is a hash lookup rather than a scan over four hundred
 * strings on every request, and built once at module load rather than per
 * validation.
 */
const SUPPORTED_TIMEZONES: ReadonlySet<string> = new Set([
  ...Intl.supportedValuesOf('timeZone'),
  'UTC',
]);

/**
 * Whether a string names a zone the application can actually interpret days in.
 *
 * An **exact** match, so `europe/bucharest` is refused rather than folded. IANA
 * names have one canonical spelling, and storing a second one would leave the
 * column holding two values that mean the same zone — the same argument the
 * `HH:mm` pattern makes about `9:00`. A rejected value is a `400` naming the
 * field, which is cheap to fix; a silently re-cased one is a configuration that
 * no longer matches what an administrator typed.
 */
export function isSupportedTimezone(value: string): boolean {
  return SUPPORTED_TIMEZONES.has(value);
}

/**
 * Decimals an hour value may carry, matching `decimal(5, 2)`.
 *
 * Validated rather than left to the column, because PostgreSQL would *round*
 * a third decimal into the stored value: `0.005` would silently become `0.01`,
 * and the configuration would then differ from what was submitted. Two decimals
 * cover the quarter-hour granularity people actually book in.
 */
export const HOURS_DECIMAL_PLACES = 2;

/**
 * Upper bound for any per-day hour value.
 *
 * A physical limit, not a policy: a day has 24 hours, so a maximum above it
 * could never be reached and a standard above it could never be met. The rules
 * this feature was asked for say only "greater than 0"; this is the other end,
 * present so a typo — `80` for `8` — is a `400` naming the field rather than a
 * configuration nothing will ever satisfy.
 */
export const MAX_HOURS_PER_DAY = 24;

/** The same limit for the week: 7 × 24. */
export const MAX_HOURS_PER_WEEK = 168;

/**
 * The order `workingDays` is stored and returned in.
 *
 * Taken from the enum's declaration order — Monday first — rather than written
 * out again, so there is no second list to fall out of step with the schema. A
 * canonical order means two configurations holding the same days are equal
 * arrays whatever order the boxes were ticked in, which is what lets a client
 * (or a diff, or a test) compare them without sorting first.
 */
const WEEK_ORDER = Object.values(Weekday);

/**
 * Compares two weekdays by their position in the week.
 *
 * A value that is not a weekday sorts to the front (`indexOf` returns `-1`)
 * rather than throwing: the sort runs as a transform, *before* validation, so
 * it has to survive input that is about to be rejected anyway.
 */
export function compareWeekdays(left: Weekday, right: Weekday): number {
  return WEEK_ORDER.indexOf(left) - WEEK_ORDER.indexOf(right);
}
