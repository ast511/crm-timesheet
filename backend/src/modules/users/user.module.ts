import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * The users feature — accounts, and their whole life.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every future module would otherwise
 * carry.
 *
 * **`AuthModule` is imported as of Feature 036**, and the direction is the
 * interesting part. This module owns the *account*; the auth module owns the
 * *credential mechanism* — the link secrets, the emails that carry them, and the
 * sessions a disabling has to end. So onboarding starts here (an administrator
 * creates an account, or resends an invitation) and finishes there (the person
 * follows the link and sets a password), and this module reaches across for three
 * things and nothing else:
 *
 * | From `AuthModule` | Used for |
 * | --- | --- |
 * | `AccountTokenService` | minting the activation link, invalidating the old one |
 * | `AccountEmailService` | composing and sending the invitation |
 * | `AuthService.revokeSessions` | ending a disabled account's live sessions |
 *
 * **Users → auth, never back.** `AuthModule` imports nothing from here: where it
 * needs an account it reads the `users` table directly, which it already did for
 * login. That keeps the graph acyclic and preserves the property `AuthModule`'s
 * own documentation asks for — everything will eventually depend on
 * authentication, so authentication depends on none of it. No `forwardRef` is
 * needed and none should be added; a cycle here would be a sign that account
 * rules had started living in the auth module.
 *
 * `UserService` is exported because other modules need it: Employees must confirm
 * an account exists — and is not already taken by another employee — before
 * linking one, and as of Feature 036 also *creates* one through
 * `UserService.create` when the account opt-in is used. The permission module
 * reads a role through it. All of them ask this module rather than query the
 * `users` table themselves, which is what keeps "never return the password hash"
 * a rule with one enforcement point instead of a convention every caller might
 * forget.
 */
@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
