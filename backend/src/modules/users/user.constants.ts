/**
 * The user module's magic numbers and literals, in one place.
 *
 * The database columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror. The one number *not* declared here is
 * the password maximum: bcrypt's 72-byte ceiling is a property of the hashing
 * algorithm, not of this module, so it is imported from
 * `common/password/password.hasher` where the algorithm is chosen.
 */

/**
 * RFC 5321 caps a forward path at 254 characters, which is the longest address
 * that can actually be delivered to. Bounding it here keeps a megabyte of text
 * out of a `LIKE` scan on the search path.
 */
export const USER_EMAIL_MAX_LENGTH = 254;

/** Short sign-in handle — `APO`, `mionescu` — not a display name. */
export const USER_USERNAME_MAX_LENGTH = 50;

/**
 * Shortest password the API accepts.
 *
 * 8 is the NIST SP 800-63B minimum for a user-chosen secret. It is a floor, not
 * a policy: composition rules (an upper-case letter, a digit, a symbol) are
 * deliberately absent, because the same guidance found they push people towards
 * predictable substitutions rather than stronger passwords.
 */
export const USER_PASSWORD_MIN_LENGTH = 8;

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
