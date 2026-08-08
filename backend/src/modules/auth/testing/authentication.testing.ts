import { Provider, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { isAdministrativeRole } from '../../../common/constants/role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { codedError } from '../../../common/errors/coded-error';
import { UserRole } from '../../../generated/prisma/enums';
import { AuthService } from '../auth.service';
import { BEARER_SCHEME } from '../auth.constants';
import { JwtAuthGuard } from '../jwt-auth.guard';

/**
 * Authentication for a routing spec that is not *about* authentication.
 *
 * Before Feature 032 each module's routing spec said who was calling with two
 * headers and a helper called `as()`. Those headers are gone, and every one of
 * those specs needs to keep asserting what it was asserting — which routes
 * exist, what the `ValidationPipe` rejects, what `@CurrentUser()` resolves to —
 * without becoming a test of JWT verification. This is what they use instead:
 * the **real** `JwtAuthGuard`, wired to a stubbed `AuthService`, driven by real
 * `Authorization` headers.
 *
 * The line is drawn deliberately. What each spec still exercises for itself is
 * the part that concerns it: that its routes are guarded at all, that a request
 * with no token is refused, and that a token resolves to the `CurrentUser` its
 * handlers read. What it no longer exercises — signatures, expiry, the account
 * lookup, `isActive` — belongs to one feature and is tested once, in
 * `auth.service.spec.ts` and `auth/routing.spec.ts`. Nineteen copies of a JWT
 * test would be nineteen places to update the day the token format changes.
 *
 * The `.testing.ts` suffix is excluded by `tsconfig.build.json`, so no test
 * scaffolding is compiled into `dist/`.
 *
 * ```ts
 * const auth = new TestAuthentication();
 *
 * const moduleRef = await Test.createTestingModule({
 *   controllers: [ThingController],
 *   providers: [{ provide: ThingService, useValue: thing }, ...auth.providers],
 * }).compile();
 *
 * await request(app.getHttpServer()).get('/api/v1/things').set(auth.as());
 * ```
 */
export class TestAuthentication {
  /** Tokens handed out by {@link as}, and who each one stands for. */
  private readonly sessions = new Map<string, CurrentUser>();

  private issued = 0;

  /**
   * The providers a testing module registers: the guard, globally, and the
   * service it asks.
   *
   * `APP_GUARD` rather than `@UseGuards()`, because that is how the application
   * registers it — a spec that guarded its controller by hand would be testing a
   * wiring the running server does not have, and would pass on a route that
   * `app.module.ts` had forgotten.
   */
  get providers(): Provider[] {
    return [
      { provide: AuthService, useValue: { authenticate: this.authenticate } },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
    ];
  }

  /**
   * Headers that authenticate as a caller, minting a token for them.
   *
   * Every field of `CurrentUser` has a default, so `as()` with no argument is a
   * plausible administrator and a spec that does not care about identity says
   * nothing about it. `administrativeAccess` is **derived from the role** here
   * exactly as `toCurrentUser` derives it in the application, so a spec cannot
   * accidentally construct an ordinary employee holding administrative access
   * and assert against a caller the real system could never produce.
   */
  as(user: Partial<CurrentUser> = {}): Record<string, string> {
    const role = user.role ?? UserRole.ADMIN;
    const token = `test-access-token-${String(++this.issued)}`;

    this.sessions.set(token, {
      userId: user.userId ?? 'usr-1',
      employeeId: user.employeeId === undefined ? 'emp-1' : user.employeeId,
      role,
      administrativeAccess: isAdministrativeRole(role),
    });

    return { authorization: `${BEARER_SCHEME} ${token}` };
  }

  /**
   * The stub `AuthService.authenticate`.
   *
   * An arrow property rather than a method, so it survives being pulled off the
   * object into the `useValue` above without losing `this`.
   *
   * An unknown token throws `UnauthorizedException`, which is what the real
   * service does and what keeps "a token this spec never issued is refused" an
   * assertion a spec can make.
   */
  private readonly authenticate = (token: string): Promise<CurrentUser> => {
    const user = this.sessions.get(token);

    if (user === undefined) {
      throw new UnauthorizedException(
        codedError(
          ERROR_CODES.AUTH_UNAUTHENTICATED,
          'Invalid or expired access token',
        ),
      );
    }

    return Promise.resolve(user);
  };
}
