import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from './token.service';

/**
 * Authentication: who is calling, proved rather than claimed.
 *
 * The feature the identity seam was written to be replaced by. Features 023 and
 * 026 both recorded, in the files they created, that the day authentication
 * arrived their decorator's body would become `request.user` and no signature
 * downstream would move — see `current-user.decorator.ts`, which quotes its own
 * contract back. This module is what made that true: `x-user-id`, `x-user-role`
 * and `x-employee-id` are read nowhere in this application any more, and the
 * eighteen modules that consume `@CurrentUser()` were not edited.
 *
 * ## What is imported, and what is not
 *
 * `JwtModule.register({})` — registered with **no** secret and no default
 * options, deliberately. There are two keys here, one per token kind, and a
 * module-level default would mean the common case (signing) picked up a secret
 * implicitly while the other had to override it. `TokenService` passes both
 * explicitly on every call, so the question "which key signed this" has one
 * answer and it is visible at the call site.
 *
 * `ConfigModule` and `PrismaModule` are global, so `ConfigService` and
 * `PrismaService` are injectable here without being imported. Nothing else is:
 * this module reads `users` and writes `refresh_tokens`, and it depends on no
 * business module at all. That emptiness is worth protecting for the reason
 * `EmailModule`'s is — everything else in the application will eventually depend
 * on authentication, so authentication must depend on none of it, or the graph
 * acquires a cycle the first time somebody sends a "new login" notification.
 *
 * Notably absent: `EmailModule`. It is available and this feature does not use
 * it. Password reset is Feature 034, and importing a mailer in advance of having
 * anything to send would be the guess Feature 025 explicitly refused to make.
 *
 * ## The dependency
 *
 * One new package, `@nestjs/jwt`, which wraps `jsonwebtoken`. It is here for the
 * part of this feature that is genuinely hard and genuinely dangerous to write
 * twice — signing and, above all, *verifying* a JWS, where the failure modes are
 * silent: an `alg` header taken from the token itself, a signature compared with
 * `===`, a base64url decoder that accepts what it should not. Everything else
 * the usual Nest recipe brings — `@nestjs/passport`, `passport`, `passport-jwt`
 * and a strategy class — is not here, because it exists to make one credential
 * interchangeable with another and this application has exactly one. The
 * argument is in `jwt-auth.guard.ts`.
 *
 * ## What is exported, and to whom
 *
 * `AuthService` and `JwtAuthGuard`, for two consumers and no others:
 *
 * - `app.module.ts` registers the guard as an `APP_GUARD`, which is what makes
 *   authentication the default for every route rather than an opt-in.
 * - `NotificationDeliveryModule` authenticates its WebSocket handshake through
 *   `AuthService.authenticate` — the same method the guard calls, so a socket and
 *   a request agree about what a token means and about whether the account behind
 *   it is still active. A second implementation for the socket is exactly the one
 *   that would still be honouring a deactivated account next week.
 *
 * `TokenService` is not exported. Nothing outside this module has any business
 * signing a token.
 *
 * ## What this does not do
 *
 * It authorises nothing. An authenticated caller is known to be who their token
 * says; whether they may read a particular timesheet or approve a particular
 * leave request is still unchecked, exactly as it was before this feature.
 * The authorization enforcement feature adds that on top, as a second global
 * guard reading `@CurrentUser()` and the effective permission set
 * `PermissionManagementModule` already resolves. Splitting the two was deliberate: identity is a prerequisite for
 * authorization and has nothing to do with it, and a feature that shipped half
 * of each would leave both half-testable.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
