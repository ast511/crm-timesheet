import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { AccountStatus, UserRole } from '../../../generated/prisma/enums';
import type { Prisma } from '../../../generated/prisma/client';
import type { UserModel } from '../../../generated/prisma/models';

/**
 * A user as the API exposes it — the account, as an administrator sees it.
 *
 * `passwordHash` is absent, and its absence is the point. A bcrypt hash is not
 * a secret the way a password is, but publishing one hands an attacker an
 * offline oracle: they can test guesses at their own pace, on their own
 * hardware, with no rate limit and no log entry, and a hit gives them the
 * plain-text password — which people reuse. Nothing a client renders needs it,
 * so nothing sends it.
 *
 * Excluding it is enforced twice, deliberately. {@link USER_PUBLIC_SELECT} is
 * handed to every Prisma call in the service, so the hash is never read out of
 * PostgreSQL in the first place; and {@link toUserEntity} accepts only
 * {@link PublicUserRow}, a type that has no `passwordHash` for a mapper to
 * copy. Forgetting either one is a compile error rather than a leak: a `select`
 * left off produces a `UserModel` the mapper will not accept, and a field added
 * to the entity has nothing to read it from.
 *
 * `colorScheme` and `cornerRadius` are absent too, for a different reason than
 * the hash: they are not secret, they are simply **not this resource's
 * business**. Feature 039 put them on `users` because a UI preference belongs to
 * an account rather than to an employment record, but the only person who reads
 * or writes one is its owner, through `/profile/me`. An administrator listing
 * accounts has no use for a colleague's choice of palette, and shipping it here
 * would invite a `PATCH /users/:id` that set somebody else's theme — the one
 * thing that feature deliberately does not build.
 *
 * The other difference from the row is the timestamps: `Date` in PostgreSQL,
 * ISO-8601 strings here, which is what the client actually receives once the
 * body is serialised. Declaring them as `string` makes the type honest and
 * routes the format through `toIsoTimestamp`, the project's single definition
 * of it.
 */
export class UserEntity {
  id!: string;
  email!: string;
  username!: string | null;
  role!: UserRole;
  /**
   * Where the account stands in its own life.
   *
   * **Replaced `isActive` in Feature 036**, and it is a breaking change to this
   * resource rather than a rename: the boolean could not express
   * `PENDING_ACTIVATION`, so a screen listing accounts had no way to show the
   * difference between somebody who has never accepted their invitation and a
   * colleague who has been working here for a year. See [AccountStatus] in
   * `schema.prisma` for why one column replaced the boolean instead of sitting
   * beside it.
   *
   * A client that used to read `isActive` reads `status !== 'DISABLED'`, and a
   * client that filtered `?isActive=true` filters `?status=ACTIVE`.
   */
  status!: AccountStatus;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * The columns every query in `UserService` reads.
 *
 * `satisfies Prisma.UserSelect` checks the keys against the model without
 * widening the constant, so a column renamed in `schema.prisma` breaks the
 * build here instead of at runtime.
 */
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

/**
 * A `users` row read through {@link USER_PUBLIC_SELECT}.
 *
 * Derived **from the select** rather than as `Omit<UserModel, 'passwordHash'>`,
 * which is what it used to be. The two were the same type for as long as the
 * select happened to name every column but the hash, and Feature 039 ended that:
 * `color_scheme` and `corner_radius` are columns of `users` that this resource
 * deliberately does not return, so the subtraction would have had to grow a
 * second exclusion — and a third the next time somebody added a column here for
 * a different screen. A `Pick` over the select's own keys cannot drift from it:
 * it is the same list, read once.
 */
export type PublicUserRow = Pick<UserModel, keyof typeof USER_PUBLIC_SELECT>;

/** Maps a `users` row onto the resource returned by the endpoints. */
export function toUserEntity(user: PublicUserRow): UserEntity {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    createdAt: toIsoTimestamp(user.createdAt),
    updatedAt: toIsoTimestamp(user.updatedAt),
  };
}
