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
