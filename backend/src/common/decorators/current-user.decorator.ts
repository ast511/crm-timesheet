import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { UserRole } from '../../generated/prisma/enums';
import { ERROR_CODES } from '../constants/error-codes.constants';
import { codedError } from '../errors/coded-error';

/**
 * Who is calling — the whole of what this application knows about the caller.
 *
 * Four fields, and each is here because something needs it rather than because
 * a user object usually has it:
 *
 * - `userId` is who notifications are addressed to. The `USER` recipient type
 *   points at `users.id`, not at an employee, because an account is what a
 *   person logs in with and not every account has an employment record.
 * - `employeeId` is the same person's employment record, when they have one. It
 *   is `null` for an account with no employee — a super-admin created to
 *   administer the system is the obvious case.
 * - `role` is what a `ROLE` notification is matched against, directly: the value
 *   stored in `notifications.recipient_role` is the value stored in
 *   `users.role`, with no translation between them.
 * - `administrativeAccess` is derived from `role` rather than sent, so a caller
 *   cannot claim it independently of the role they hold.
 *
 * **The interface has not changed since Feature 026.** Where the values come
 * from has — see {@link resolveCurrentUser} — and that is the whole of Feature
 * 032's effect on everything outside the auth module.
 */
export interface CurrentUser {
  readonly userId: string;
  readonly employeeId: string | null;
  readonly role: UserRole;
  /** `true` for the three roles in `ADMINISTRATIVE_ROLES`. Derived, never sent. */
  readonly administrativeAccess: boolean;
}

/**
 * The caller, taken from the validated access token.
 *
 * **This is the seam Features 023 and 026 were built around, now delivering what
 * they promised.** Feature 026 recorded the contract in this file:
 *
 * > It is one seam, in one file. Every notification route reads the caller
 * > through this decorator and nothing else. When authentication arrives, the
 * > body of `resolveCurrentUser` becomes `request.user` and no controller,
 * > service, repository, DTO or test signature moves.
 *
 * That is exactly what happened. The body below is `request.user`, the interface
 * above is unchanged to the field, and not one controller, service, repository,
 * DTO or entity in the thirty-one features that came before was edited to make
 * it true. Three properties of the original design are what made that possible,
 * and they are worth naming because they are what a placeholder has to have to
 * be worth writing:
 *
 * 1. **Nothing was defaulted.** There was no fallback user, no "assume admin in
 *    development", no id baked into a service — so there is no such assumption
 *    to find and unpick now, and no route that silently kept working with an
 *    identity nobody supplied.
 * 2. **`administrativeAccess` was always derived here**, never sent. It is
 *    derived from the same role, in the same place, for the same reason; the only
 *    difference is that the role is now a fact from `users.role` instead of a
 *    claim from a header.
 * 3. **The shape was the caller, not the request.** `employeeId` was carried from
 *    the beginning although Feature 026 read it nowhere, so the modules that
 *    needed it later found it already there — and so does the token.
 *
 * What changed underneath: `x-user-id`, `x-user-role` and `x-employee-id` are no
 * longer read anywhere in this application. Identity comes from
 * `Authorization: Bearer <access token>`, is verified by `JwtAuthGuard`, and is
 * resolved from the database on every request rather than from the token's
 * claims — so a role change or a deactivation takes effect immediately instead
 * of when the token happens to expire. See `AuthService.authenticate`.
 *
 * What has *not* changed: this authorises nothing. An authenticated caller is
 * known to be who they say; whether they may touch a given resource is Feature
 * 033. The one check that already existed — the administrative workspace — was
 * never authorization arriving early, it is what `ADMINISTRATIVE_USERS` means,
 * and it stays where it was.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser =>
    resolveCurrentUser(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    ),
);

/**
 * A request that authentication has already run on.
 *
 * `user` is optional in the type and present in practice: `JwtAuthGuard` is
 * registered globally and assigns it before any handler runs, so the only
 * requests reaching a `@CurrentUser()` parameter without one are on routes the
 * guard was told to skip. Declaring it optional is what makes
 * {@link resolveCurrentUser} state that case out loud rather than hand a handler
 * an `undefined` typed as a `CurrentUser`.
 *
 * It replaces Feature 028's `HeaderBearingRequest`, which existed so the
 * notification gateway could reuse the header rules over a WebSocket handshake.
 * The gateway now authenticates the handshake's token through `AuthService` and
 * produces this same `CurrentUser`, so the two sides still share one definition
 * of the caller — one layer further in.
 */
export interface AuthenticatedRequest {
  user?: CurrentUser;
}

/**
 * The decorator's body, as a plain function.
 *
 * Separated so it can be unit-tested directly: a param decorator runs inside
 * Nest's pipeline, so calling one in a test exercises nothing. Each module's
 * routing spec still drives it through a real request.
 */
export function resolveCurrentUser(request: AuthenticatedRequest): CurrentUser {
  const { user } = request;

  // Reachable only by asking for the caller on a route that does not require
  // one — a handler marked `@Public()` with a `@CurrentUser()` parameter. That
  // is a wiring mistake rather than something a client did, and a `401` is the
  // honest answer to it: the request genuinely carried no identity, and
  // inventing an anonymous user here is precisely the fallback whose absence
  // made this seam replaceable in the first place.
  if (user === undefined) {
    throw new UnauthorizedException(
      codedError(
        ERROR_CODES.AUTH_UNAUTHENTICATED,
        'This route does not authenticate the caller, so there is no current user to read',
      ),
    );
  }

  return user;
}
