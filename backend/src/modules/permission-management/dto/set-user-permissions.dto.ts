import { IsArray } from 'class-validator';

import { IsPermissionKeys } from './permission-management-field.decorators';

/**
 * Body of `PUT /api/v1/users/:id/permissions` — the full intended matrix.
 *
 * **A replace, not a patch**, which is why the verb is `PUT` and why the field is
 * named for the whole set rather than for a change to it. The array is every
 * cell the caller intends to leave *ticked*; anything absent from it is intended
 * to be unticked. The service then normalises that intention against the role
 * baseline and stores only where the two differ — see
 * `UserPermissionService.replace`.
 *
 * The alternative — a body of `{ grants: [], revokes: [] }` — was not taken, and
 * the reason is what it would ask the client to know. Those two lists are
 * *deviations*, so composing them means the screen has to hold a correct copy of
 * the role baseline and diff against it before it can send anything; the day a
 * baseline changed, every open tab would be computing deviations from a stale
 * one. Sending the intended state instead means the server, which owns the
 * baseline, does the only calculation that depends on it.
 *
 * That also makes the endpoint **idempotent** in the way `PUT` promises: the
 * same body sent twice leaves the same overrides and — because the second send
 * diffs to nothing — writes no second batch of history.
 *
 * The array is required but may be **empty**. `{ "permissionKeys": [] }` is the
 * intended set "nothing", which revokes everything the role grants; it is a
 * different request from `DELETE`, which removes the exceptions so the role
 * applies in full. Making the empty case impossible would have collapsed the two.
 */
export class SetUserPermissionsDto {
  /**
   * Every permission key the user should hold, by `key` rather than by id.
   *
   * Keys rather than ids because a key is what a screen, a feature document and
   * a future `@RequirePermission('TIMESHEET.CREATE')` all already say. Accepting
   * cuids would mean a client fetching the catalog purely to translate names it
   * already knows into ids it does not, and would make a request body
   * unreadable in a log.
   *
   * `@IsArray()` is stated here rather than folded into `@IsPermissionKeys()`
   * because the element rules inside it are `{ each: true }`, and
   * class-validator silently skips those on a non-array — so without this a
   * string body would pass validation and reach the service.
   */
  @IsArray()
  @IsPermissionKeys()
  readonly permissionKeys!: string[];
}
