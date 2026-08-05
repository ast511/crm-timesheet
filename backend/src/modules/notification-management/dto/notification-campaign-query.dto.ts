import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  NotificationCampaignStatus,
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  CAMPAIGN_SORT_FIELDS,
  CampaignSortField,
  DEFAULT_CAMPAIGN_SORT_FIELD,
  NOTIFICATION_MANAGEMENT_SEARCH_MAX_LENGTH,
} from '../notification-management.constants';

/**
 * Query string of `GET /api/v1/notification-campaigns`:
 * `?page=2&limit=50&search=maintenance&status=SCHEDULED&severity=WARNING&priority=HIGH&sendEmail=true&sortBy=scheduledAt`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and `sortOrder`,
 * so Feature 006's shared defaults and page-size cap apply here without being
 * restated.
 *
 * The filters are independent and combine with `AND`: `?status=SCHEDULED`
 * narrows whatever `?search=` matched rather than replacing it.
 *
 * **There is no `?recipientType=` and no `?createdByEmployeeId=`.** The first
 * would be a filter over another table's rows dressed as a property of this one;
 * the second is the author, and nothing in this feature scopes campaigns to
 * whoever wrote them — every administrator maintains the same list, which is why
 * there is no `/me` variant of this route either. Both are additive the day a
 * screen needs them.
 */
export class NotificationCampaignQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `subject` **and** `message`.
   *
   * Both, because a campaign's subject is a summary somebody wrote and the
   * detail a person half-remembers — a date, a building, a system name — is
   * usually in the body. This is the notification centre's call rather than the
   * reminder list's, and for the reason the two differ: a reminder's body is
   * boilerplate that would match half the table, while every campaign says
   * something different.
   *
   * Absent and empty are the same thing.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTIFICATION_MANAGEMENT_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /**
   * Exact lifecycle state: `?status=DRAFT` is the queue of things somebody
   * started and has not scheduled.
   *
   * The whole enum is filterable, `SENT` included: a client may not *write* that
   * status, but reading what has already gone out is the point of keeping the
   * record.
   */
  @IsOptional()
  @IsEnum(NotificationCampaignStatus)
  readonly status?: NotificationCampaignStatus;

  /** Exact severity: `?severity=ERROR`. */
  @IsOptional()
  @IsEnum(NotificationType)
  readonly severity?: NotificationType;

  /** Exact priority: `?priority=HIGH`. */
  @IsOptional()
  @IsEnum(NotificationPriority)
  readonly priority?: NotificationPriority;

  /**
   * The two delivery switches, filterable independently — "which announcements
   * will leave the system as email" is a question an administrator asks before
   * anything is sent.
   *
   * `@ToBoolean()` before `@IsBoolean()` because a query string is text, so
   * `"false"` would otherwise be rejected. Only the two exact spellings convert.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly sendEmail?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly sendNotification?: boolean;

  /**
   * Column to order by; only the enumerated ones reach Prisma's `orderBy`.
   *
   * `scheduledAt` is nullable, so a `DRAFT` campaign sorts last ascending and
   * first descending — PostgreSQL's own null ordering, left as it is rather than
   * overridden with an opinion this API would then have to defend.
   */
  @IsOptional()
  @IsIn(CAMPAIGN_SORT_FIELDS)
  readonly sortBy: CampaignSortField = DEFAULT_CAMPAIGN_SORT_FIELD;
}
