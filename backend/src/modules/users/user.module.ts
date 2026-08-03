import { Module } from '@nestjs/common';

import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * The users feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every future module would otherwise
 * carry.
 *
 * `UserService` is exported because the modules that follow need it: Employees
 * must confirm an account exists — and is not already taken by another
 * employee — before linking one, and Auth will need to read an account by its
 * email. Both should ask this module rather than query the `users` table
 * themselves, which is what keeps "never return the password hash" a rule with
 * one enforcement point instead of a convention every caller might forget.
 */
@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
