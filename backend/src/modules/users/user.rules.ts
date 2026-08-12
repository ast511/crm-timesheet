import { ForbiddenException } from '@nestjs/common';

import {
  ACCOUNT_ADMIN_ROLES,
  isAccountAdminRole,
} from '../../common/constants/role.constants';
import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';

/**
 * Who may administer accounts — the boundary the rest of the authorization model
 * stands on.
 *
 * **A role check, deliberately, and not a `@RequirePermission()` gate.** Feature
 * 035 built the permission mechanism and made reports granular with it, on the
 * argument that whether HR should read company-wide reports is a question the
 * company might reasonably answer either way — so a permission keeps that door
 * open. Account administration is the opposite kind of question, and the same
 * feature recorded the exception: "for something only ever meant for admins
 * regardless of fine-grained perms, a role check may remain".
 *
 * The reason is not convenience. **A configurable permission to administer
 * accounts is a permission to grant oneself every other permission.** Whoever can
 * set a role can set their own to `ADMIN`, and from there reach the permissions
 * screen and the rest of the catalog; whoever can create accounts can create one
 * with any role at all. A checkbox that hands out that capability is not a
 * granular control, it is a way to escalate through the UI, and the permission
 * catalog would then be guarding a door whose hinges anybody could unscrew. So
 * this is a fixed property of two roles, held in code, with no cell on the matrix
 * screen that could ever turn it on.
 *
 * ## ADMIN and SUPERADMIN only — never `isAdministrativeRole`
 *
 * The distinction is the single most consequential one in this file, and it is
 * why {@link ACCOUNT_ADMIN_ROLES} exists beside `ADMINISTRATIVE_ROLES` rather
 * than the two sharing a list:
 *
 * ```text
 *   ADMINISTRATIVE_ROLES   SUPERADMIN, ADMIN, HR   "administers the company"
 *   ACCOUNT_ADMIN_ROLES    SUPERADMIN, ADMIN       "administers who can log in"
 * ```
 *
 * **HR is on the first list and not the second.** HR manages *people* — hiring
 * somebody, recording their department, approving their leave — and does not
 * manage *access*. Reaching for `isAdministrativeRole` here, which is the obvious
 * mistake because it is the helper this project already had, would let any HR
 * account create logins and set roles, and therefore let any HR account make
 * itself an administrator. The two helpers are named so that a call site reads
 * as the question it is asking.
 *
 * ## Where it is applied
 *
 * Every account and role route on `UserController`, and the account opt-in on
 * `POST /employees` — which is the case that could not have been a route-level
 * gate at all, because whether the request administers an account depends on
 * whether its *body* asks for one. Creating an employee is HR's job and creating
 * a login is not, and the same request may do both.
 */

/** What a caller who may not administer accounts is told. */
export const ACCOUNT_ADMIN_REQUIRED_MESSAGE = `Only ${ACCOUNT_ADMIN_ROLES.join(' and ')} may create accounts, change roles, or enable and disable accounts`;

/**
 * Refuses a caller who is not `ADMIN` or `SUPERADMIN`.
 *
 * A `403` rather than a `404`: the endpoint plainly exists, and hiding it would
 * send an HR user looking for a typo instead of understanding that account
 * administration is not theirs. It carries
 * {@link ERROR_CODES.AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED} rather than the
 * permission-denied code, because there is nothing here to be granted — a
 * frontend offering "request access" for this would be promising something no
 * screen in this application can do.
 */
export function assertAccountAdministrator(user: CurrentUser): void {
  if (!isAccountAdminRole(user.role)) {
    throw new ForbiddenException(
      codedError(
        ERROR_CODES.AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED,
        ACCOUNT_ADMIN_REQUIRED_MESSAGE,
      ),
    );
  }
}
