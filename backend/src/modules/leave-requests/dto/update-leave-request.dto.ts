import { IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import {
  IsLeaveReplacementIds,
  IsLeaveRequestReason,
} from './leave-request-field.decorators';

/**
 * Body of `PATCH /api/v1/me/leave-requests/:id`.
 *
 * Accepted **only while the request is `PENDING`**. Once it has been decided it
 * is read-only, and the service answers a `409` naming the status — see
 * `LeaveRequestsService.updateOwn`. That is not an access rule dressed as a
 * state rule: an approved request has already moved days out of a balance, so
 * editing its span would leave the deduction describing an absence that no
 * longer exists.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. `reason` is the one nullable column and therefore
 * the one field where an explicit `null` is a request ("clear it") rather than a
 * mistake; on the others `@ValidateIfPresent()` turns `null` into a `400`
 * instead of letting `@IsOptional()` wave it through to a `NOT NULL` column.
 *
 * **`status`, `processedById`, `processedAt` and `decisionReason` are
 * deliberately absent.** They are the record of a decision, and a decision is
 * not something the person asking makes about their own request. HR moves them,
 * through `PATCH /api/v1/leave-requests/:id/status`, and nothing else writes
 * them at all.
 *
 * **Nor is there an `employeeId`.** A request filed by the wrong person is
 * deleted while it is still `PENDING`, not reassigned: reassigning would move
 * consumed days between two people's balances with no record that it happened.
 */
export class UpdateLeaveRequestDto {
  @ValidateIfPresent()
  @IsRelationId()
  readonly leaveTypeId?: string;

  /**
   * Moving either end re-opens every rule.
   *
   * The service judges the span the patch would *leave behind*, not the fields
   * the body happens to carry: `PATCH { endDate }` is checked against the stored
   * `startDate`, the working days are recounted, and the balance is re-tested
   * against the new total. That is why the merge happens there rather than here,
   * the same shape `PublicHolidayService.update` uses.
   */
  @ValidateIfPresent()
  @IsIsoDateString()
  readonly startDate?: string;

  @ValidateIfPresent()
  @IsIsoDateString()
  readonly endDate?: string;

  /** Nullable: `null` (or `""`) clears the reason. */
  @IsOptional()
  @IsLeaveRequestReason()
  readonly reason?: string | null;

  /**
   * The **complete** replacement set, not an addition to it.
   *
   * Sending it replaces every nomination the request had; omitting it leaves
   * them untouched. There is no "add one" or "remove one" endpoint, and that is
   * deliberate: the rule is "at least one replacement, each of them free for the
   * whole span", which is a statement about the set. Judged one nomination at a
   * time, removing the last one would have to be refused by a rule that read as
   * if it were about that person rather than about the request.
   */
  @ValidateIfPresent()
  @IsLeaveReplacementIds()
  readonly replacementEmployeeIds?: string[];
}
