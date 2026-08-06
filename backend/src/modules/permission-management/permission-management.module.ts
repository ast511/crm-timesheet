import { Module } from '@nestjs/common';

import { UserModule } from '../users/user.module';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { UserPermissionController } from './user-permission.controller';
import { UserPermissionService } from './user-permission.service';

/**
 * The permission-management feature: two controllers, two services, one module.
 *
 * They are together because they are two halves of one screen — a catalog and
 * the presets built from it on one side, a person's matrix and its history on
 * the other — and apart from each other because they answer different questions:
 * *what can be granted*, and *what has been granted to whom*. The shape
 * `NotificationManagementModule` already uses for reminders and campaigns.
 *
 * The split between the services is the one that matters. `PermissionService`
 * reads: the catalog, the presets, and — in exactly one method —
 * {@link PermissionService.resolveEffective}, which computes what somebody may
 * do. `UserPermissionService` writes, and calls that method rather than
 * repeating its three lines, because an effective set computed in two places is
 * two answers to one question.
 *
 * ## This feature stores and resolves permissions. It does not enforce them.
 *
 * There is no guard here, no decorator, no interceptor, and no access check
 * added to any other module's endpoints. That is the feature's central decision
 * and it is the same one every module up to 028 has recorded:
 *
 * ```text
 *   permission-management   who may do what          (this module)
 *   authentication          who the caller actually is    (not written)
 *   permission enforcement  refusing the request           (not written)
 * ```
 *
 * Enforcement cannot be written before authentication, because there is nothing
 * yet to enforce *against*. `@CurrentUser()` reads `x-user-id` and
 * `x-user-role` from headers, which any caller may set to anything; a
 * `@RequirePermission()` guard on top of that would resolve the permissions of
 * whoever the request claimed to be and refuse or admit accordingly — a check
 * that reads as protection while providing none, and one that the first
 * penetration test would find in a minute. Worse, it would make every subsequent
 * feature *feel* protected, so the missing half would stop being obvious.
 *
 * What ships instead is `GET /permissions/me/effective`, which a frontend uses to
 * hide the buttons it should not offer. That is a courtesy to the person using
 * the screen, honestly labelled as such, and it is exactly the part of
 * enforcement that does not depend on the caller being who they say they are.
 *
 * The intended guard is designed and documented in
 * `FEATURES/029-permission-management.md` — its name, how it would read
 * `@CurrentUser()`, and how it would call `resolveEffective` — and deliberately
 * not written. A dead decorator nothing applies is worse than none: it is
 * unexercised code that the feature which finally needs it would have to audit
 * before trusting.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable in both services without the repetition every feature module would
 * otherwise carry.
 *
 * **`UserModule` is the only import**, and it is imported for exactly one fact:
 * which role an account holds. That is the input the whole resolution starts
 * from, and it lives in the `users` table, which this module does not own — so
 * it is read through `UserService.findRole` rather than by querying the table,
 * the rule every module here follows. Note what is *not* imported:
 * `EmployeeModule` is absent, because permissions are held by accounts rather
 * than by employment records — a super-admin created to administer the system has
 * no employee row and must still have permissions — which is also why the audit
 * trail credits a `User` where a campaign credits an `Employee`.
 *
 * `PermissionService` is exported, because the whole point of a resolution is
 * that something else reads it: the Permission Enforcement feature will import
 * this module and call `resolveEffective`, and a future Authentication feature
 * will do the same to put a permission set on a token. `UserPermissionService`
 * is exported alongside it so those features reach the tables through the module
 * that owns them rather than querying `user_permission_overrides` directly. No
 * method is written for either caller in advance.
 */
@Module({
  imports: [UserModule],
  controllers: [PermissionController, UserPermissionController],
  providers: [PermissionService, UserPermissionService],
  exports: [PermissionService, UserPermissionService],
})
export class PermissionManagementModule {}
