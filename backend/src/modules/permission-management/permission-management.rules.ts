import { BadRequestException, ConflictException } from '@nestjs/common';

import { UserRole } from '../../generated/prisma/enums';

/**
 * The assertions both services in this module share.
 *
 * Two rules, and they are the two that would otherwise be written twice each:
 * `PUT`, `apply-preset` and `DELETE` all refuse a super-admin target, and `PUT`
 * and `apply-preset` both have to reject a key the catalog does not know. A
 * second copy of either is how the message and the status code drift apart.
 */

/**
 * Refuses any write against a super-admin's permissions.
 *
 * **The one rule that makes the super-admin bypass safe.** A super-admin holds
 * every permission by resolution rather than by stored rows — see
 * `PermissionService.resolveEffective` — so there is nothing for a write to
 * change: persisting a `REVOKE` against an account whose resolution never reads
 * overrides would store an exception that silently did nothing, and the screen
 * would then show a permission removed while the account still held it. Worse,
 * accepting the write would make the matrix screen a place where somebody could
 * *appear* to lock the system's last administrator out.
 *
 * A `409` rather than a `403`, and the difference is deliberate: this is a
 * statement about the state of the resource — *this account cannot be
 * configured* — not about who is asking. The same call
 * `NotificationCampaignService` makes for a campaign that has already been sent.
 * When authorization exists, "may this caller edit permissions at all" will be a
 * `403` raised somewhere else entirely, and the two will not be confusable.
 *
 * The message names the account, because "cannot be modified" without the reason
 * sends an administrator looking for a permission problem that does not exist.
 */
export function assertNotSuperadmin(userId: string, role: UserRole): void {
  if (role === UserRole.SUPERADMIN) {
    throw new ConflictException(
      `User ${userId} is a ${UserRole.SUPERADMIN} and holds every permission: a super-admin's permissions are not stored and cannot be modified`,
    );
  }
}

/**
 * Rejects a body naming a permission the catalog does not contain.
 *
 * Every unknown key is reported at once, as an array — the same shape the
 * `ValidationPipe` produces — so a form can mark each one instead of surfacing
 * the second problem only after the first is fixed. They are sorted, so two runs
 * of the same bad body produce the same message rather than whatever order a
 * `Set` happened to iterate in.
 *
 * A `400` rather than a `404`: the collection being addressed is fine, it is the
 * submitted body that names something absent. The same call
 * `NotificationCampaignService.assertRecipientsExist` makes for an employee id
 * that matches nobody.
 *
 * It cannot be a DTO rule. `@IsIn()` would need the catalog as a compile-time
 * constant, and the catalog is *seeded data* — the whole point of Feature 029's
 * storage decision is that a later feature adds a permission with a migration
 * and a seed entry, not by editing a TypeScript literal every DTO imports.
 */
export function assertKnownPermissionKeys(
  submitted: readonly string[],
  known: ReadonlySet<string>,
): void {
  const unknown = [...new Set(submitted)]
    .filter((key) => !known.has(key))
    .sort();

  if (unknown.length > 0) {
    throw new BadRequestException(
      unknown.map((key) => `Permission "${key}" does not exist`),
    );
  }
}
