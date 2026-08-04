import { IsEmailAddress } from '../../../../common/decorators/is-email-address.decorator';

/**
 * Body of `POST /api/v1/leave-notification-emails`.
 *
 * One field, because an address is all this resource is. There is no owning
 * configuration for it to point at — see the `LeaveNotificationEmail` model —
 * so unlike `CreateTimesheetApprovalEmailDto`, which omits a `workScheduleId`
 * that does exist, this class omits nothing. Anything beyond `email` is a `400`
 * rather than a field silently ignored.
 *
 * `@IsEmailAddress()` trims, lower-cases and checks the address. The
 * lower-casing is what makes the unique index on `email` the real guarantee
 * behind the duplicate check: without it `hr@company.com` and `HR@company.com`
 * would be two rows notifying one mailbox twice.
 */
export class CreateLeaveNotificationEmailDto {
  @IsEmailAddress()
  readonly email!: string;
}
