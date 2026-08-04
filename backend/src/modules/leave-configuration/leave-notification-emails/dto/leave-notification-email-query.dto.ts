import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { Trim } from '../../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../../common/dto/sort-query.dto';
import {
  DEFAULT_LEAVE_NOTIFICATION_EMAIL_SORT_FIELD,
  LEAVE_NOTIFICATION_EMAIL_SEARCH_MAX_LENGTH,
  LEAVE_NOTIFICATION_EMAIL_SORT_FIELDS,
  LeaveNotificationEmailSortField,
} from '../leave-notification-email.constants';

/**
 * Query string of `GET /api/v1/leave-notification-emails`:
 * `?page=2&limit=50&search=hr&sortBy=createdAt&sortOrder=desc`.
 *
 * Paginated, unlike `GET /work-schedule/emails`, which returns a plain array.
 * The difference is not inconsistency: that collection is a sub-resource of a
 * singleton and holds a handful of addresses, while this one is a top-level
 * resource with its own `PATCH` and no ceiling on how many addresses a company
 * ends up notifying. Feature 006's page envelope is what every top-level list
 * endpoint in this project returns.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and `sortOrder`,
 * so the shared defaults, the page-size cap and the direction vocabulary apply
 * here without being restated.
 *
 * There is no filter parameter. The resource has one field beyond its
 * timestamps, and `?search=` already narrows on it; a second way to ask the same
 * question would be a choice with no consequence.
 */
export class LeaveNotificationEmailQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `email`.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(LEAVE_NOTIFICATION_EMAIL_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(LEAVE_NOTIFICATION_EMAIL_SORT_FIELDS)
  readonly sortBy: LeaveNotificationEmailSortField =
    DEFAULT_LEAVE_NOTIFICATION_EMAIL_SORT_FIELD;
}
