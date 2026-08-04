import { IsEmailAddress } from '../../../../common/decorators/is-email-address.decorator';
import { ValidateIfPresent } from '../../../../common/decorators/validate-if-present.decorator';

/**
 * Body of `PATCH /api/v1/leave-notification-emails/:id`.
 *
 * The one field is optional, so a body that mentions nothing is a request that
 * changes nothing and returns the row as it stands — the ordinary reading of a
 * `PATCH`, and cheaper than a `400` for a client that submitted an unedited
 * form.
 *
 * `@ValidateIfPresent()` rather than `@IsOptional()`: the column is `NOT NULL`,
 * so `null` is not a way to clear an address — it is a value the column cannot
 * hold, and `@IsOptional()` would wave it past every constraint and let Prisma
 * reject it as a `500` where the client deserved a `400` naming the field. An
 * address is removed with `DELETE`, which is the endpoint that means it.
 *
 * This endpoint exists so a typo can be corrected in place. Deleting the row and
 * posting a new one would work, but it would change the id a client may be
 * holding and lose `createdAt` — the record of when the company started
 * notifying that person.
 */
export class UpdateLeaveNotificationEmailDto {
  @ValidateIfPresent()
  @IsEmailAddress()
  readonly email?: string;
}
