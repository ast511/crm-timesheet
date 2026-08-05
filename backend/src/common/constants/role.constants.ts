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
