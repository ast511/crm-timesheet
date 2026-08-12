import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { isAdministrativeRole } from '../../../common/constants/role.constants';
import type { Prisma } from '../../../generated/prisma/client';
import type { AccountStatus, UserRole } from '../../../generated/prisma/enums';

/**
 * The account, as the caller's own session sees it.
 *
 * Returned by `POST /auth/login`, `POST /auth/refresh` and `GET /auth/me` — one
 * shape for all three rather than a smaller one at login, because they answer
 * the same question and a frontend hydrating its session state should not have
 * to reconcile two versions of "who am I". Every field is a fact about the
 * caller themselves, so there is nothing here they are not entitled to.
 *
 * It is {@link CurrentUser} plus `email`, minus nothing, and `id` is spelled
 * `id` rather than `userId` because on the wire this is a user resource and
 * `userId` would be a foreign key to itself — the same call `UserEntity` makes.
 *
 * `passwordHash` is absent, and its absence is the point; the argument is
 * `UserEntity`'s, in full. Neither is any token: the tokens are the session, and
 * they live in {@link AuthSessionEntity} beside this rather than inside it.
 */
export interface AuthUserEntity {
  id: string;
  email: string;
  role: UserRole;
  employeeId: string | null;
  administrativeAccess: boolean;
}

/**
 * The columns authentication reads from `users`.
 *
 * Run on **every authenticated request**, which is what shapes it: five values,
 * all from one indexed primary-key lookup, and a joined `employees.id` rather
 * than the row. `satisfies Prisma.UserSelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime.
 *
 * `passwordHash` is deliberately *not* here. Verifying a password is a different
 * question asked once, at login, by a query of its own — see
 * {@link CREDENTIALS_SELECT} — so the hash is never read into memory on the path
 * that runs a hundred times a minute.
 *
 * `status` is here rather than filtered in the `where`, because the two are not
 * the same answer: filtering would make a refused account indistinguishable from
 * a deleted one at the call site, and the caller wants to refuse both while
 * logging neither as a missing user. It replaced `isActive` in Feature 036, which
 * gave the column a third state — see [AccountStatus] in `schema.prisma`.
 */
export const AUTHENTICATED_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  employee: { select: { id: true } },
} as const satisfies Prisma.UserSelect;

/** A `users` row read through {@link AUTHENTICATED_USER_SELECT}. */
export interface AuthenticatedUserRow {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  employee: { id: string } | null;
}

/**
 * The columns a login reads, and the only query in this module that touches the
 * hash.
 *
 * `email` is absent: the lookup already knows it, and re-reading a value the
 * caller supplied is the round trip Feature 015 named. What comes back is what
 * has to be *checked* — the hash, and whether the account may sign in at all.
 */
export const CREDENTIALS_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  passwordHash: true,
  employee: { select: { id: true } },
} as const satisfies Prisma.UserSelect;

/**
 * A `users` row read through {@link CREDENTIALS_SELECT}.
 *
 * `passwordHash` is nullable as of Feature 036: an account created by an
 * administrator has none until its owner follows the activation link and chooses
 * one. Login reads the null through the decoy hash so the comparison still costs
 * what every comparison costs, and the `status` check then refuses it — see
 * `AuthService.login`.
 */
export interface CredentialsRow extends AuthenticatedUserRow {
  passwordHash: string | null;
}

/**
 * The row, as the identity seam expects it.
 *
 * This function is where `administrativeAccess` is derived, and it is now the
 * only place in the application that computes it for a request. It was derived
 * in `resolveCurrentUser` before Feature 032 and it moved here rather than being
 * computed in two places, because the fact it derives from — the role — is now
 * read here.
 *
 * `employee` collapses to an id or `null`. Not every account has an employment
 * record, and the whole application already reads that as a `string | null`.
 */
export function toCurrentUser(user: AuthenticatedUserRow): CurrentUser {
  return {
    userId: user.id,
    employeeId: user.employee?.id ?? null,
    role: user.role,
    administrativeAccess: isAdministrativeRole(user.role),
  };
}

/** The same row, as the client's own session state. */
export function toAuthUserEntity(user: AuthenticatedUserRow): AuthUserEntity {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee?.id ?? null,
    administrativeAccess: isAdministrativeRole(user.role),
  };
}
