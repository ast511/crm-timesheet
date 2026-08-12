import { Module } from '@nestjs/common';

import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * A person's own account and employment record, on one screen.
 *
 * **It owns no table**, which is the whole of what there is to say about its
 * shape: `users` belongs to the users module and `employees` to the employees
 * module, and this reads across both to answer one question — "who am I here" —
 * that neither of them can answer alone without knowing about the other.
 *
 * ## Why it is a module rather than a route on one of them
 *
 * Putting `/profile/me` on `UserController` would have made an endpoint every
 * employee uses live in the controller nobody but an administrator may reach,
 * which is a confusing place to look and one deactivated `@CurrentUser()` away
 * from a mistake. Putting it on `EmployeeController` would have been worse: a
 * profile is an *account* first — a super-admin with no employment record still
 * has one — so it would have been a route about users on the resource that is
 * not users.
 *
 * The third option, and the one taken, is that "my profile" is genuinely its own
 * concern: it is the only place in the application where the two halves of a
 * person are deliberately shown together, and the only place a person edits
 * anything about themselves.
 *
 * ## Why it imports nothing
 *
 * `PrismaModule` is `@Global`, so `PrismaService` is injectable without it, and
 * this module queries `users` with a join to `employees` rather than going
 * through `UserService` and `EmployeeService`.
 *
 * That is a deliberate departure from the project's usual rule — read another
 * module's table through the service that owns it — and it is worth naming
 * rather than glossing. The rule exists so that a table's *invariants* have one
 * enforcement point, and this module enforces none: it reads two rows in one
 * query and writes exactly one column, `employees.phone`, which no rule anywhere
 * constrains beyond the shared `@IsEmployeePhone()` its DTO already applies. The
 * alternative — a `findOwnProfile` on each of the two services, plus a third
 * method to combine them — would have put a profile screen's shape into two
 * modules that have no interest in it, and taken two queries to do it.
 *
 * The guarantee that actually matters here is kept the way the users module
 * keeps it: an explicit `select` that never names `passwordHash`, so the hash is
 * not read out of PostgreSQL at all. See `PROFILE_SELECT`.
 *
 * Nothing is exported. This module is the end of a chain — nothing reads a
 * profile but the person it belongs to.
 */
@Module({
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
