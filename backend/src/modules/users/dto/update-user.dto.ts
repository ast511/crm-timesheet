import { IsOptional } from 'class-validator';

import { UserRole } from '../../../generated/prisma/enums';
import { IsUserRole, IsUserUsername } from './user-field.decorators';

/**
 * Body of `PATCH /api/v1/users/:id` — what an administrator may change about
 * somebody else's account.
 *
 * Two fields, and the list of what is *not* here is longer than what is, which
 * is the point: this endpoint edits an account, and most of what an account is
 * cannot be edited by somebody who does not own it.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. `username: null` (or `""`) is the explicit way to
 * remove a username, which is a different request from omitting it.
 *
 * **`role` is the consequential one**, and it is why the whole endpoint is behind
 * `assertAccountAdministrator`: whoever can set a role can set their own, and
 * from there reach everything. Only `ADMIN` and `SUPERADMIN` reach this route at
 * all — never HR, whose job is employees rather than access.
 *
 * ## `password` is gone, as of Feature 036
 *
 * It used to be here as an administrative reset, described at the time as "not a
 * self-service password change: no current password is asked for, because there
 * is nobody to ask yet — authentication arrives in a later feature, and with it
 * the endpoint that should require one". That endpoint now exists
 * (`POST /auth/change-password`), and so does the recovery path for somebody who
 * has forgotten theirs (`POST /auth/forgot-password`), so the placeholder has
 * been removed rather than left as a second way to set a password that skips
 * both. Nobody but an account's owner ever knows its password.
 *
 * An administrator helping a locked-out colleague points them at
 * `POST /auth/forgot-password`; one dealing with a person who has left disables
 * the account instead.
 *
 * ## `email` is still absent, for the reason it always was
 *
 * It is the account's identity, and changing it is not a field edit but a flow:
 * the new address has to be proven reachable before the old one stops working, or
 * an administrator's typo locks a person out of an account they can no longer be
 * contacted about. Feature 036 makes that sharper rather than softer — the
 * address is now also where the activation and reset links go — so an unverified
 * change would redirect every future recovery for that account. Email
 * verification remains unimplemented and is recorded as a follow-up.
 *
 * ## `status` is absent too, and is not an oversight
 *
 * Enabling and disabling are `POST /users/:id/activate` and
 * `POST /users/:id/deactivate` rather than a field on this body. They are
 * *transitions* with preconditions and side effects — deactivating revokes the
 * account's live sessions — and `PATCH { "status": "ACTIVE" }` would invite a
 * client to write `PENDING_ACTIVATION` back onto an account that has long since
 * been activated, or to promote one to `ACTIVE` that has no password to sign in
 * with. The same call `TimesheetController` makes about its status.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsUserUsername()
  readonly username?: string | null;

  @IsOptional()
  @IsUserRole()
  readonly role?: UserRole;
}
