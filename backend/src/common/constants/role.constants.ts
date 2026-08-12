import { UserRole } from '../../generated/prisma/enums';

/**
 * Which roles run the company, in one place.
 *
 * `UserRole` has four values and the fourth — `USER` — is an ordinary employee.
 * The other three are the people who administer the system, and "the
 * administrative roles" is a fact several unrelated things need: whether a
 * caller may open the administrative notification workspace, which roles a
 * `ROLE` notification may be addressed to, and, when RBAC arrives, which menu a
 * person is shown.
 *
 * It lives in `common/constants` rather than inside the notifications module
 * because it is a statement about `UserRole`, which that module does not own.
 * The first consumer being a notification is not a reason to file it there — the
 * same call Feature 013 made when `@IsRelationId()` moved out of the employees
 * module.
 */

/**
 * The three roles with access to the administrative side of the application.
 *
 * Derived from the enum rather than spelled as three string literals, so a value
 * renamed in `schema.prisma` breaks the build here instead of producing a list
 * that silently matches nobody.
 *
 * The order is the order a person would rank them in, most senior first. Nothing
 * depends on it — membership is the only question asked of this list — but a
 * list that is going to be rendered somewhere may as well already read correctly.
 */
export const ADMINISTRATIVE_ROLES = [
  UserRole.SUPERADMIN,
  UserRole.ADMIN,
  UserRole.HR,
] as const;

/**
 * One of the three, as a type.
 *
 * Narrower than `UserRole`, which is what makes it useful: a value typed
 * `AdministrativeRole` cannot be `USER`, so a function taking one does not have
 * to re-check what its caller already established.
 */
export type AdministrativeRole = (typeof ADMINISTRATIVE_ROLES)[number];

/**
 * Whether a role administers the system.
 *
 * A type guard rather than a plain boolean, so the caller that checks also gets
 * the narrowing — `if (isAdministrativeRole(role))` leaves `role` typed
 * `AdministrativeRole` inside the branch, and there is no second place where a
 * cast could disagree with the check.
 */
export function isAdministrativeRole(
  role: UserRole,
): role is AdministrativeRole {
  return (ADMINISTRATIVE_ROLES as readonly UserRole[]).includes(role);
}

/**
 * The two roles that may administer **accounts** — Feature 036.
 *
 * **Deliberately not {@link ADMINISTRATIVE_ROLES}, and the difference is HR.**
 * The two lists answer different questions and confusing them would be the
 * single most consequential mistake in this area:
 *
 * ```text
 *   ADMINISTRATIVE_ROLES   SUPERADMIN, ADMIN, HR   "administers the company"
 *   ACCOUNT_ADMIN_ROLES    SUPERADMIN, ADMIN       "administers who can log in"
 * ```
 *
 * HR manages *people* — hiring somebody, recording their department, approving
 * their leave. HR does not manage *access*: creating a login, changing what role
 * an account holds, or turning an account off are decisions about who can reach
 * the system and with what authority. An HR account that could set a role could
 * grant itself `ADMIN`, and from there everything else, which makes the
 * distinction between the two lists the boundary that holds the whole
 * authorization model up.
 *
 * **This is a rigid boundary rather than a configurable permission**, and that is
 * why it is a role check here instead of a `@RequirePermission()` gate. Feature
 * 035 made reports granular precisely because *whether HR should read them* is a
 * question the company might reasonably answer either way, and a permission
 * keeps that door open. Account administration is the opposite: there is no
 * account that should be able to grant itself authority, so there must be no
 * checkbox that grants it. 035 recorded exactly this case — "for something only
 * ever meant for admins regardless of fine-grained perms, a role check may
 * remain".
 *
 * It lives here beside its sibling rather than in the users module, for the
 * reason that one does: it is a statement about `UserRole`, which no module
 * owns, and the two must be readable side by side or somebody will eventually
 * reach for the wrong one.
 */
export const ACCOUNT_ADMIN_ROLES = [
  UserRole.SUPERADMIN,
  UserRole.ADMIN,
] as const;

/** One of the two, as a type. Narrower than {@link AdministrativeRole}. */
export type AccountAdminRole = (typeof ACCOUNT_ADMIN_ROLES)[number];

/**
 * Whether a role may create accounts, change roles, or enable and disable
 * accounts.
 *
 * A type guard for the reason {@link isAdministrativeRole} is one, and named so
 * that a call site reads as the question it is asking — `isAccountAdminRole` at
 * a glance cannot be mistaken for "is an administrator", which is the mistake
 * that would let HR through.
 */
export function isAccountAdminRole(role: UserRole): role is AccountAdminRole {
  return (ACCOUNT_ADMIN_ROLES as readonly UserRole[]).includes(role);
}
