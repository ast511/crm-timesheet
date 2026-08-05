import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';

import { UserRole } from '../../generated/prisma/enums';
import { RELATION_ID_MAX_LENGTH } from '../constants/relation.constants';
import { isAdministrativeRole } from '../constants/role.constants';
import { CURRENT_EMPLOYEE_HEADER } from './current-employee-id.decorator';

/**
 * The headers that name the account making the request.
 *
 * Exported so tests, the routing spec and the feature documentation quote one
 * literal each rather than several copies of a string that has to agree.
 */
export const CURRENT_USER_HEADER = 'x-user-id';

export const CURRENT_USER_ROLE_HEADER = 'x-user-role';

/**
 * Who is calling — the whole of what this application knows about the caller
 * until authentication exists.
 *
 * Four fields, and each is here because something needs it rather than because
 * a user object usually has it:
 *
 * - `userId` is who notifications are addressed to. The `USER` recipient type
 *   points at `users.id`, not at an employee, because an account is what a
 *   person logs in with and not every account has an employment record.
 * - `employeeId` is the same person's employment record, when they have one. It
 *   is `null` for an account with no employee — a super-admin created to
 *   administer the system is the obvious case — and this feature reads it
 *   nowhere. It is carried because the seam should describe the caller once,
 *   and because the features that follow this one work in employees.
 * - `role` is what a `ROLE` notification is matched against, directly: the value
 *   stored in `notifications.recipient_role` is the value stored in
 *   `users.role`, with no translation between them.
 * - `administrativeAccess` is derived from `role` rather than sent, so a caller
 *   cannot claim it independently of the role they claimed.
 */
export interface CurrentUser {
  readonly userId: string;
  readonly employeeId: string | null;
  readonly role: UserRole;
  /** `true` for the three roles in `ADMINISTRATIVE_ROLES`. Derived, never sent. */
  readonly administrativeAccess: boolean;
}

/**
 * The caller, assembled from headers.
 *
 * **This is a placeholder for authentication**, and the second one — Feature 023
 * introduced `@CurrentEmployeeId()` for the same reason and reads the same
 * `x-employee-id` header, which this reuses rather than inventing a third
 * spelling of. Four things about how it is done are the point:
 *
 * 1. **It is one seam, in one file.** Every notification route reads the caller
 *    through this decorator and nothing else. When authentication arrives, the
 *    body of {@link resolveCurrentUser} becomes `request.user` and no
 *    controller, service, repository, DTO or test signature moves.
 * 2. **Nothing is hardcoded and nothing is defaulted.** There is no fallback
 *    user, no "assume admin in development", no id baked into a service. A
 *    request that does not say who is calling is a `400` naming the header it
 *    left out, which is the only answer that stays correct once the header is
 *    replaced by a token.
 * 3. **`administrativeAccess` is computed here, from the claimed role.** Sending
 *    it as a header of its own would let a caller claim `USER` and administrative
 *    access at once, and would give the application two sources for one fact.
 * 4. **It authenticates nothing and authorises nothing.** Any caller may claim
 *    any account and any role. That is not a weakness to be patched here — half
 *    an access check reads as protection while providing none — it is the honest
 *    shape of an API whose auth feature has not been written. The headers are a
 *    stand-in for claims, not credentials.
 *
 * What the service *does* enforce on top of this is the workspace rule: a caller
 * whose claimed role is not administrative cannot read the administrative
 * workspace. That is not authorization arriving early — it is what the
 * `ADMINISTRATIVE_USERS` recipient type *means*, and without it every employee
 * would receive the back-office broadcasts.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser =>
    resolveCurrentUser(context.switchToHttp().getRequest<Request>()),
);

/**
 * The decorator's body, as a plain function.
 *
 * Separated so it can be unit-tested directly: a param decorator runs inside
 * Nest's pipeline, so calling one in a test exercises nothing. The routing spec
 * still drives it through a real request; this is what lets the header rules
 * themselves be checked without booting an application.
 */
export function resolveCurrentUser(request: Request): CurrentUser {
  const role = readRole(request);

  return {
    userId: readRequiredId(request, CURRENT_USER_HEADER),
    employeeId: readOptionalId(request, CURRENT_EMPLOYEE_HEADER),
    role,
    administrativeAccess: isAdministrativeRole(role),
  };
}

/**
 * An id header that must be there.
 *
 * Validated for *shape* only — present, non-empty, and no longer than a foreign
 * key may be. Whether the account exists is a question for the database, and
 * this feature deliberately does not ask it: a notification list scoped to an id
 * nobody holds is empty, which is the honest answer, and querying `users` on
 * every request to produce a nicer error would be a round trip bought for a
 * placeholder.
 */
function readRequiredId(request: Request, header: string): string {
  const value = request.headers[header];

  // Express repeats a header sent twice as an array. One identity was asked
  // for, so two answers are a malformed request rather than a value to pick
  // from — taking the first would let a caller smuggle a second claim past
  // anything that logged only one.
  if (typeof value !== 'string') {
    throw new BadRequestException([missingHeaderMessage(header)]);
  }

  return assertIdShape(value.trim(), header);
}

/**
 * An id header that may legitimately be absent.
 *
 * Only `x-employee-id` is read this way: not every account has an employment
 * record — a super-admin created to administer the system is the obvious case —
 * and no notification route reads one. A header that *is* sent still gets the
 * same treatment, because a blank or oversized value is a mistake worth naming
 * whether or not the field was compulsory.
 */
function readOptionalId(request: Request, header: string): string | null {
  const value = request.headers[header];

  if (value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException([missingHeaderMessage(header)]);
  }

  return assertIdShape(value.trim(), header);
}

/** The bounds both readers apply, so they cannot drift apart. */
function assertIdShape(id: string, header: string): string {
  if (id.length === 0) {
    throw new BadRequestException([missingHeaderMessage(header)]);
  }

  if (id.length > RELATION_ID_MAX_LENGTH) {
    throw new BadRequestException([
      `${header} must be at most ${String(RELATION_ID_MAX_LENGTH)} characters`,
    ]);
  }

  return id;
}

/**
 * The claimed role, which must be one the schema knows.
 *
 * Checked against the enum rather than accepted as text, because the value
 * decides which notifications the caller is shown: an unrecognised role would
 * otherwise reach the repository and quietly match the broadcasts of a workspace
 * nobody meant to open.
 */
function readRole(request: Request): UserRole {
  const value = request.headers[CURRENT_USER_ROLE_HEADER];

  if (typeof value !== 'string') {
    throw new BadRequestException([
      missingHeaderMessage(CURRENT_USER_ROLE_HEADER),
    ]);
  }

  const role = value.trim().toUpperCase();

  if (!isUserRole(role)) {
    throw new BadRequestException([
      `${CURRENT_USER_ROLE_HEADER} must be one of: ${Object.values(UserRole).join(', ')}`,
    ]);
  }

  return role;
}

/** Whether a string is one of the enum's members. */
function isUserRole(value: string): value is UserRole {
  return (Object.values(UserRole) as string[]).includes(value);
}

/**
 * The message every absent-header path reports, so an empty header and a missing
 * one cannot drift into saying different things about the same mistake.
 *
 * An array at each call site, the same shape the `ValidationPipe` produces, so a
 * client handles it with the code it already has for field errors.
 */
function missingHeaderMessage(header: string): string {
  return `${header} header is required until authentication is implemented`;
}
