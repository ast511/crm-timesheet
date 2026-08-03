/**
 * Direction accepted by every sortable list endpoint: `?sortOrder=desc`.
 *
 * Shared rather than declared per module because the direction is part of the
 * API's vocabulary, exactly like `page` and `limit` — the *field* being sorted
 * differs from one resource to the next, the direction never does. The values
 * are the strings Prisma's `orderBy` expects, so a validated value is passed
 * straight through without a translation table.
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}
