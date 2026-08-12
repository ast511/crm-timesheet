import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { PermissionManagementModule } from '../permission-management/permission-management.module';
import { PermissionsGuard } from './permissions.guard';
import { PublicRouteValidator } from './public-route.validator';

/**
 * Authorization: whether the caller authentication identified may do the thing
 * they are asking to do.
 *
 * Cross-cutting plumbing rather than a resource, like Error Code
 * Standardization (033) and Rate Limiting (034) before it — **it owns no table,
 * exposes no endpoint and adds no migration.** What it adds is a decorator, a
 * guard and a startup check, and it is the third and last of the three layers
 * that stand in front of every request:
 *
 * ```text
 *   034  how often may anybody ask
 *   032  who is asking                 → 401
 *   035  may they ask this             → 403     (this module)
 * ```
 *
 * ## What it closes
 *
 * Nearly every module written before this one carries a version of the same
 * sentence — `PermissionManagementModule`'s "there is no guard here",
 * `TimesheetManagementModule`'s "no permission is checked",
 * `ReportingModule`'s "`PermissionResource.REPORTS` is already seeded and
 * waiting", `permission.service.ts`'s "this computes but does not enforce". All
 * of them deferred the same half for the same reason, stated most sharply in
 * Feature 029: enforcement against a *claimed* identity is a check that reads as
 * protection while providing none, and building it on `x-user-id` would have
 * made every later feature feel protected while the hole stayed open. Feature
 * 032 replaced the claim with an account behind a validated token. This module
 * is the deferral being paid off, and it needed no change to 029 to do it —
 * `PermissionService` was already exported for exactly this caller.
 *
 * ## The two imports
 *
 * `PermissionManagementModule`, for `PermissionService.resolveEffective` — the
 * single source of truth for what one person may do, including the super-admin
 * branch. This module resolves nothing of its own and reads none of the four
 * permission tables; it injects that one method and turns its answer into a
 * refusal. The dependency points the harmless way round: 029 knows nothing about
 * this module.
 *
 * `DiscoveryModule`, for the startup check alone. It is what lets
 * {@link PublicRouteValidator} walk every controller in the application —
 * including the ones in modules this one neither imports nor knows about — so
 * that "`@Public()` and `@RequirePermission()` together" is a boot failure
 * rather than a route that quietly answers `401` to everybody.
 *
 * ## Registration
 *
 * `PermissionsGuard` is exported and registered as an `APP_GUARD` in
 * `app.module.ts`, **after** `JwtAuthGuard`, following the shape
 * `RateLimitingModule` uses: the module owns the guard, the composition root
 * decides the order. The order is load-bearing and is documented on both the
 * guard and the provider — authenticate first, authorise second.
 *
 * Registering it globally does **not** gate anything on its own. Only a route
 * carrying `@RequirePermission()` is checked; everything else passes through
 * untouched and keeps whatever domain rules it already had. See the guard for
 * why authorization is opt-in where authentication is opt-out.
 *
 * Nothing else is imported. `PrismaModule` is `@Global` and in any case nothing
 * here queries, and `AuthModule` is deliberately absent: this module reads the
 * caller through `@CurrentUser()`'s own resolver, the same seam every other
 * module uses, rather than through the service that fills it in.
 */
@Module({
  imports: [PermissionManagementModule, DiscoveryModule],
  providers: [PermissionsGuard, PublicRouteValidator],
  exports: [PermissionsGuard],
})
export class AuthorizationModule {}
