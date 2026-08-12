/**
 * The user module's magic numbers and literals, in one place.
 *
 * The database columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror. Two numbers are *not* declared here,
 * because neither is a property of this module:
 *
 * - the password maximum — bcrypt's 72-byte ceiling, which belongs to the
 *   hashing algorithm and lives in `common/password/password.hasher`;
 * - the email maximum — RFC 5321's 254 characters, which belongs to email and
 *   lives in `common/constants/email.constants.ts`, where Feature 016 put it so
 *   the users module and the work-schedule module bound an address identically.
 */

/** Short sign-in handle — `APO`, `mionescu` — not a display name. */
export const USER_USERNAME_MAX_LENGTH = 50;

/**
 * The password minimum used to be declared here, as
 * `USER_PASSWORD_MIN_LENGTH`.
 *
 * Feature 036 moved it to `common/password/password.policy.ts` as
 * `PASSWORD_MIN_LENGTH`, along with the rest of the rule. It was never a
 * property of this module — this file's own header already said as much about
 * the *maximum*, which belonged to bcrypt — and once activation, reset and
 * change all had to agree with each other, keeping the floor in the module that
 * no longer accepts a password at all would have been the way the four
 * eventually disagreed.
 */

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const USER_SEARCH_MAX_LENGTH = 100;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there. `passwordHash` is absent for the same reason it is absent from
 * every response — ordering by it would leak the relative order of hashes.
 */
export const USER_SORT_FIELDS = [
  'email',
  'username',
  'role',
  'createdAt',
] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `email` rather than `createdAt`: it is the account's identity, it is required
 * and unique, so the order is total and a record can never shift between two
 * pages of the same listing. `username` would have neither property — it is
 * nullable.
 */
export const DEFAULT_USER_SORT_FIELD: UserSortField = 'email';
