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
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_REMINDER_SORT_FIELD,
  NOTIFICATION_MANAGEMENT_SEARCH_MAX_LENGTH,
  REMINDER_SORT_FIELDS,
  ReminderSortField,
} from '../notification-management.constants';

/**
 * Query string of `GET /api/v1/reminders`:
 * `?page=2&limit=50&search=timesheet&enabled=true&severity=WARNING&priority=HIGH&sortBy=createdAt&sortOrder=asc`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and `sortOrder`,
 * so Feature 006's shared defaults and page-size cap apply here without being
 * restated — including the cap that **rejects** rather than clamps.
 */
export class ReminderQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `name` **and** `subject`.
   *
   * Those two rather than the body, because they are what a reminder is
   * identified by: the name is what an administrator called the rule and the
   * subject is what the recipient will see. The `message` is a paragraph of
   * boilerplate that would match half the table on any common word — the
   * opposite of the notification centre's call, where the body is searched
   * precisely because the detail somebody half-remembers is in it.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTIFICATION_MANAGEMENT_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /**
   * Whether the rule is switched on: `?enabled=true` is the set the delivery
   * engine will act on, which is the question this filter exists for.
   *
   * `@ToBoolean()` before `@IsBoolean()` because a query string is text, so
   * `"false"` would otherwise be rejected — the boolean counterpart of the
   * `@Type(() => Number)` that `PaginationQueryDto` puts on `page`. Only the two
   * exact spellings convert; `?enabled=yes` is a `400` naming the field rather
   * than a filter nobody asked for.
   *
   * No initialiser: absent means "both", which is not a value a boolean could
   * carry.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly enabled?: boolean;

  /** Exact severity: `?severity=WARNING`. */
  @IsOptional()
  @IsEnum(NotificationType)
  readonly severity?: NotificationType;

  /** Exact priority: `?priority=HIGH`. */
  @IsOptional()
  @IsEnum(NotificationPriority)
  readonly priority?: NotificationPriority;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(REMINDER_SORT_FIELDS)
  readonly sortBy: ReminderSortField = DEFAULT_REMINDER_SORT_FIELD;
}
