import { IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import {
  IsLeaveReplacementIds,
  IsLeaveRequestReason,
} from './leave-request-field.decorators';

/**
 * Body of `POST /api/v1/me/leave-requests`.
 *
 * **There is no `employeeId` field, and sending one is a `400`.** The request is
 * filed by whoever is calling, and the caller is named by the
 * `x-employee-id` header — see `@CurrentEmployeeId()`. Putting the requester in
 * the body would make "whose leave is this" a value a client chooses per
 * request, which is precisely what it will stop being once authentication
 * exists, and would make `/me` a lie in the meantime. The global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so a client that tries is
 * told rather than having the field silently ignored.
 *
 * **There is no `status` field either**, and for a sharper reason: an employee
 * does not decide whether their own leave is approved. The status is derived
 * from the leave type — `requiresApproval` decides between `PENDING` and
 * `APPROVED` — and is written by the service, never accepted from a body.
 *
 * **Nor is there a `requestedWorkingDays`.** It is computed from the span, the
 * work schedule and the public holidays on every read; a client stating it would
 * be stating a conclusion the server draws.
 *
 * What this class checks is the shape of what arrived. Everything that needs the
 * database — that the leave type is there and still active, that each
 * replacement exists and is free, that the requester has no overlapping leave
 * and enough balance — belongs to the service, which is the only place that can
 * ask.
 */
export class CreateLeaveRequestDto {
  @IsRelationId()
  readonly leaveTypeId!: string;

  /**
   * First day of the absence, inclusive.
   *
   * An ISO-8601 string, kept as a string and parsed once in the service — see
   * `@IsIsoDateString()` for why converting here would accept `01/13/2020`, a
   * format whose meaning depends on which side of the Atlantic reads it.
   */
  @IsIsoDateString()
  readonly startDate!: string;

  /**
   * Last day of the absence, **inclusive**.
   *
   * A one-day absence sends the same date twice rather than omitting this field.
   * That is the convention the columns store and the one `PublicHoliday` already
   * uses; making the end optional would give a one-day request two spellings and
   * force every reader to handle both.
   *
   * That it must not precede `startDate`, and that the span has a maximum
   * length, are rules about two fields at once — checked in the service, beside
   * the other statements about what a valid request is.
   */
  @IsIsoDateString()
  readonly endDate!: string;

  /**
   * Why the person is asking.
   *
   * Optional, and `null` (or `""`) means "no reason given" — a real answer
   * rather than a missing one. Leave of a type that requires no approval is
   * notified rather than requested, and demanding an explanation for a medical
   * absence would put a diagnosis into a column every screen listing requests
   * reads.
   */
  @IsOptional()
  @IsLeaveRequestReason()
  readonly reason?: string | null;

  /**
   * Who covers the work. **At least one is required** — the rule the feature
   * states, and the reason this is not `@IsOptional()`.
   *
   * The list is the complete set, not an addition to one: on `PATCH` it replaces
   * whatever was nominated before. See `UpdateLeaveRequestDto`.
   */
  @IsLeaveReplacementIds()
  readonly replacementEmployeeIds!: string[];
}
