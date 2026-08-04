import { IsEmailAddress } from '../../../common/decorators/is-email-address.decorator';

/**
 * Body of `POST /api/v1/work-schedule/emails`.
 *
 * One field, because the collection is a sub-resource of the configuration and
 * the URL already says which configuration that is. `workScheduleId` is
 * deliberately absent: there is exactly one schedule, so a client sending its
 * id could only ever be repeating what the path said — and, being absent from
 * this class, an attempt to send one is a `400` rather than a value silently
 * ignored.
 *
 * `@IsEmailAddress()` trims, lower-cases and checks the address. The
 * lower-casing is what makes the unique index on `email` the real guarantee
 * behind the duplicate check: without it `HR@company.com` and `hr@company.com`
 * would be two rows notifying one mailbox twice.
 */
export class CreateTimesheetApprovalEmailDto {
  @IsEmailAddress()
  readonly email!: string;
}
