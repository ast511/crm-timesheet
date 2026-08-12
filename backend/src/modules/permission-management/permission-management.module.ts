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
 * ## This module stores and resolves permissions. Something else enforces them.
 *
 * There is still no guard here, no decorator and no interceptor, and that
 * separation held through the feature that finally did the enforcing:
 *
 * ```text
 *   permission-management   who may do what             (this module)
 *   authentication          who the caller actually is  (Feature 032)
 *   authorization           refusing the request        (Feature 035)
 * ```
 *
 * Enforcement could not be written before authentication, because there was
 * nothing to enforce *against*: `@CurrentUser()` read `x-user-id` and
 * `x-user-role` from headers any caller could set to anything, so a
 * `@RequirePermission()` guard on top of that would have resolved the
 * permissions of whoever the request *claimed* to be and refused or admitted
 * accordingly — a check that reads as protection while providing none, and one
 * the first penetration test would find in a minute. Worse, it would have made
 * every subsequent feature *feel* protected, so the missing half would have
 * stopped being obvious.
 *
 * Feature 032 supplied the identity; **Feature 035 added the guard, and not one
 * line of this module changed for it.** `AuthorizationModule` imports this one
 * and calls {@link PermissionService.resolveEffective} — the export below was
 * written for a caller that did not yet exist, and the caller needed nothing
 * that was not already there. That is the whole return on having declined to
 * write a dead decorator in advance: there was no unexercised code for the
 * enforcing feature to audit before trusting it.
 *
 * `GET /permissions/me/effective` still exists and still means the same thing: a
 * frontend uses it to hide the buttons it should not offer. It was always
 * honestly labelled as a courtesy rather than a control, and it stays one — a
 * client that ignores it now meets a real `403` instead of nothing.
 *
 * The permission-management routes are themselves gated as of 035, with
 * `PERMISSIONS.VIEW`, `PERMISSIONS.EDIT` and `PERMISSIONS.CONFIGURE`. See the
 * two controllers.
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
 * that something else reads it — and as of Feature 035 something does:
 * `AuthorizationModule` imports this module and calls `resolveEffective` from
 * its guard. `UserPermissionService` is exported alongside it so any such caller
 * reaches the tables through the module that owns them rather than querying
 * `user_permission_overrides` directly; nothing outside this module reads it
 * yet.
 */
@Module({
  imports: [UserModule],
  controllers: [PermissionController, UserPermissionController],
  providers: [PermissionService, UserPermissionService],
  exports: [PermissionService, UserPermissionService],
})
export class PermissionManagementModule {}
