import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import {
  CAMPAIGN_MAX_RECIPIENTS,
  CAMPAIGN_MIN_RECIPIENTS,
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  NOTIFICATION_SUBJECT_MAX_LENGTH,
  REMINDER_DESCRIPTION_MAX_LENGTH,
  REMINDER_NAME_MAX_LENGTH,
} from '../notification-management.constants';

/**
 * The per-field rules shared by this module's DTOs.
 *
 * The same split every module since Feature 007 uses: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` is what
 * distinguishes "create" from "patch" and has to be readable on the class it
 * applies to.
 *
 * `subject` and `message` are here rather than in a per-resource file because a
 * reminder and a campaign carry the *same* text under the same rules — that is
 * the whole reason this module holds both. Writing them twice is how the two
 * would end up bounded differently.
 */

/** `subject` — the heading, trimmed first so `"   "` is rejected rather than stored. */
export function IsNotificationSubject() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(NOTIFICATION_SUBJECT_MAX_LENGTH),
  );
}

/** `message` — the body, plain text. */
export function IsNotificationMessage() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(NOTIFICATION_MESSAGE_MAX_LENGTH),
  );
}

/** `name` — what a reminder rule is called. Unique, which the service checks. */
export function IsReminderName() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(REMINDER_NAME_MAX_LENGTH),
  );
}

/**
 * `description` — trimmed, and blank collapses to `null`.
 *
 * A cleared textarea posts `""`, which is not a shorter description but the
 * absence of one; storing it verbatim would give the column two values meaning
 * "empty" and force every reader to check for both. The resulting `null` is
 * skipped by the `@IsOptional()` on the property, so clearing a description is a
 * valid request rather than a failed `@IsString()` — the same treatment
 * `IsLeaveRequestReason()` gives its column.
 */
export function IsReminderDescription() {
  return applyDecorators(
    TrimToNull(),
    IsString(),
    MaxLength(REMINDER_DESCRIPTION_MAX_LENGTH),
  );
}

/**
 * `employeeIds` — the people a campaign names.
 *
 * Four rules, each doing something the others cannot, and the same set
 * `IsLeaveReplacementIds()` applies to its own list of foreign keys:
 *
 * - **at least one**, which is the feature's stated rule for an `EMPLOYEE`
 *   campaign and cannot be a schema constraint: a column cannot require a row in
 *   another table to exist.
 * - **at most `CAMPAIGN_MAX_RECIPIENTS`**, because each name costs a lookup and
 *   a row. A campaign that would exceed it is one that meant `ALL_EMPLOYEES`.
 * - **no duplicates**, checked here rather than left to the unique index on
 *   `(campaign_id, employee_id)`. The index would reject the insert as a driver
 *   error surfacing as a `500`; this rejects the body as a `400` naming the
 *   field. Listing somebody twice does not send them two announcements.
 * - **each a well-formed foreign key**, via `@IsRelationId({ each: true })`.
 *   Whether the person exists is a question for the service.
 *
 * Whether the field may be sent *at all* depends on `recipientType`, which is a
 * rule about two fields at once and therefore the service's.
 */
export function IsCampaignEmployeeIds() {
  return applyDecorators(
    ArrayMinSize(CAMPAIGN_MIN_RECIPIENTS),
    ArrayMaxSize(CAMPAIGN_MAX_RECIPIENTS),
    ArrayUnique(),
    IsRelationId({ each: true }),
  );
}

/** Trims a string and turns what is left of an empty one into `null`. */
function TrimToNull() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? null : trimmed;
  });
}
