import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { EmailModule } from '../email/email.module';
import { AccountEmailService } from './account-email.service';
import { AccountPasswordService } from './account-password.service';
import { AccountTokenService } from './account-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenCookie } from './refresh-token.cookie';
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
 * `EmailModule`, **as of Feature 036**. Feature 032 left it out and said why —
 * "importing a mailer in advance of having anything to send would be the guess
 * Feature 025 explicitly refused to make" — and this is the feature that finally
 * has something to send: an invitation link and a password-reset link. It is
 * imported for `EmailService.send` and nothing else; no `SMTP_*` variable is read
 * in this module, and `AccountEmailService` composes while that service delivers.
 *
 * It does not create a cycle: `EmailModule` depends on nothing, which is the
 * property its own documentation asks to be protected.
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
 * `AccountTokenService` and `AccountEmailService` are exported **as of Feature
 * 036**, for one caller each and for the same underlying reason: onboarding
 * starts in the users module — an administrator creates an account, or resends
 * an invitation — and ends here, when the person follows the link. The account
 * lives in `users`, the credential mechanism lives in `auth`, and the module that
 * owns each does its own half.
 *
 * `UserModule` is deliberately **not** imported in return. The dependency points
 * one way — users → auth — so the graph stays acyclic and this module keeps the
 * property its own documentation asks for: everything will eventually depend on
 * authentication, so authentication depends on none of it. Where this module
 * needs an account it reads the `users` table directly, which it already did for
 * login.
 *
 * `TokenService` is not exported. Nothing outside this module has any business
 * signing a token — and `AccountTokenService`, which mints the link secrets, is
 * exported only so the users module can *ask for* one, never to hash or verify.
 *
 * `RefreshTokenCookie` is not exported either, for a sharper version of the same
 * reason: it is the only class that writes the refresh cookie, and a second
 * writer somewhere else would be a second answer to what the cookie's attributes
 * are — which is the failure mode where a `clear` silently removes nothing
 * because it disagreed about the path. `AuthController` is its one consumer.
 *
 * The `cookie-parser` middleware it reads through is **not** registered here.
 * It is global, and it is registered in `configureApp` beside Helmet and the
 * validation pipe, so bootstrap and every spec that boots through that function
 * get the same request object. A module registering global middleware for its
 * own benefit would make "is a cookie parsed" depend on which module happened to
 * be imported.
 *
 * ## What this does not do
 *
 * It authorises nothing. An authenticated caller is known to be who their token
 * says; whether they may do a particular thing is `AuthorizationModule`
 * (Feature 035), which adds a second global guard reading `@CurrentUser()` and
 * the effective permission set `PermissionManagementModule` resolves. Splitting
 * the two was deliberate: identity is a prerequisite for authorization and has
 * nothing to do with it, and a feature that shipped half of each would leave
 * both half-testable. Nothing in this module changed when the other half landed,
 * which is what the split was for.
 */
@Module({
  imports: [JwtModule.register({}), EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    AccountTokenService,
    AccountEmailService,
    AccountPasswordService,
    RefreshTokenCookie,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    AccountTokenService,
    AccountEmailService,
  ],
})
export class AuthModule {}
