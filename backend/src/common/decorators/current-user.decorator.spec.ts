import { UnauthorizedException } from '@nestjs/common';

import { UserRole } from '../../generated/prisma/enums';
import {
  ADMINISTRATIVE_ROLES,
  isAdministrativeRole,
} from '../constants/role.constants';
import {
  AuthenticatedRequest,
  CurrentUser,
  resolveCurrentUser,
} from './current-user.decorator';

/**
 * The decorator itself runs inside Nest's pipeline, so it is exercised through
 * real requests in each module's routing spec. What is tested here is its body.
 *
 * **This file is the acceptance test of Feature 032's seam replacement, and what
 * it no longer contains is the point.** It used to check header rules — trimming,
 * length bounds, a role the enum does not know, a header sent twice — because
 * the caller was assembled from three headers a client could write. There is
 * nothing left to validate: the caller is now assembled by `AuthService` from
 * the `users` row itself, so a role that is not a `UserRole` is unrepresentable
 * rather than rejected, and an over-long id cannot arrive because no id arrives.
 * Those rules did not move; the mistakes they guarded against stopped existing.
 *
 * What remains is the contract that did not change, and that is what the rest of
 * the application depends on: the four fields, and `administrativeAccess` being
 * derived rather than claimed.
 */
const requestWith = (user?: CurrentUser): AuthenticatedRequest => ({ user });

const CALLER: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.HR,
  administrativeAccess: true,
};

describe('resolveCurrentUser', () => {
  it('returns the caller the guard resolved, unchanged', () => {
    expect(resolveCurrentUser(requestWith(CALLER))).toEqual({
      userId: 'usr-1',
      employeeId: 'emp-1',
      role: UserRole.HR,
      administrativeAccess: true,
    });
  });

  it('carries a null employee for an account with no employment record', () => {
    expect(
      resolveCurrentUser(requestWith({ ...CALLER, employeeId: null }))
        .employeeId,
    ).toBeNull();
  });

  /**
   * Reachable only by putting `@CurrentUser()` on a `@Public()` handler, which
   * is a wiring mistake rather than something a client can do. It refuses rather
   * than inventing an anonymous caller — the absence of exactly that kind of
   * fallback is what made this seam replaceable in the first place.
   */
  it('refuses to invent a caller when the route did not authenticate one', () => {
    expect(() => resolveCurrentUser(requestWith())).toThrow(
      UnauthorizedException,
    );
  });
});

/**
 * `administrativeAccess` is derived in `toCurrentUser`, where the role is read,
 * rather than here — so this is where the *rule* is asserted, and the auth
 * module's spec asserts that the rule is applied to a real row.
 */
describe('isAdministrativeRole', () => {
  it('accepts the three administrative roles and nothing else', () => {
    const administrative = Object.values(UserRole).filter(isAdministrativeRole);

    expect(administrative).toEqual([...ADMINISTRATIVE_ROLES]);
  });

  it('excludes USER, which is what makes the list mean anything', () => {
    expect(isAdministrativeRole(UserRole.USER)).toBe(false);
  });
});
