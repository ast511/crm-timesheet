/**
 * The project's single definition of "a timestamp in an API payload":
 * ISO-8601, in UTC.
 *
 * Small on purpose. It exists so the format is a decision recorded in one file
 * rather than a `toISOString()` call repeated at every producer — the error
 * envelope today, response DTOs that expose `createdAt` / `updatedAt`
 * tomorrow.
 */

/** Renders a date as an ISO-8601 UTC string. Defaults to the current time. */
export function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * The same rendering for a column that may hold no date at all.
 *
 * Separate from {@link toIsoTimestamp} rather than folded into it, because that
 * function defaults an *absent* argument to "now" — exactly the wrong answer for
 * a `null` a nullable column deliberately stores. Feature 011 is the first
 * resource with optional dates (`Project.startDate` / `endDate`); the vacations
 * and time-entry features have more, so the null-handling is written once here
 * instead of as a ternary in each entity mapper.
 */
export function toNullableIsoTimestamp(date: Date | null): string | null {
  return date === null ? null : toIsoTimestamp(date);
}
