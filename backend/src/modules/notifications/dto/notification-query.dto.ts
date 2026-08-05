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
import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_NOTIFICATION_SORT_FIELD,
  NOTIFICATION_SEARCH_MAX_LENGTH,
  NOTIFICATION_SORT_FIELDS,
  NotificationSortField,
} from '../notification.constants';

/**
 * Query string of both notification lists:
 * `?page=2&limit=50&search=leave&category=LEAVE&type=ERROR&priority=HIGH&isRead=false&sortBy=createdAt&sortOrder=desc`.
 *
 * **One class for both endpoints**, unlike the leave-requests module's pair. The
 * two lists there accept different parameters — only HR's can sort by employee
 * — so they had to be two classes. Here the personal list and the administrative
 * list accept exactly the same things: the *rows* differ, the question a client
 * asks of them does not. Splitting this into two identical classes would create
 * the drift it was meant to prevent.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and `sortOrder`,
 * so the shared defaults and the page-size cap apply here without being
 * restated.
 *
 * **There is no `workspace` parameter**, although the workspace is a column and
 * a filter would be trivial to add. The workspace is the *scope*, and the scope
 * is the URL: `GET /notifications` is the personal one and
 * `GET /administrative/notifications` is the other. Offering `?workspace=` as
 * well would be two ways to ask one question, where one of the two answers is
 * always an empty page — `GET /notifications?workspace=ADMINISTRATIVE` can match
 * nothing, by construction. That is the rule Feature 015 recorded, applied here.
 */
export class NotificationQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `title` **and** `message`.
   *
   * Both, because a notification's title is a summary somebody wrote and the
   * detail a person half-remembers — a project code, a colleague's name, a date
   * — is usually in the body. Searching the title alone would fail on exactly
   * the query people actually type.
   *
   * Nothing else is searched. `category`, `type` and `priority` are closed
   * vocabularies with exact filters of their own, where a substring would guess.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTIFICATION_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** Exact category: `?category=LEAVE`. */
  @IsOptional()
  @IsEnum(NotificationCategory)
  readonly category?: NotificationCategory;

  /** Exact severity: `?type=ERROR`. */
  @IsOptional()
  @IsEnum(NotificationType)
  readonly type?: NotificationType;

  /** Exact priority: `?priority=HIGH`. */
  @IsOptional()
  @IsEnum(NotificationPriority)
  readonly priority?: NotificationPriority;

  /**
   * Read state: `?isRead=false` is the unread inbox, which is what this
   * parameter is really for.
   *
   * `@ToBoolean()` before `@IsBoolean()` because a query string is text, so
   * `"false"` would otherwise be rejected — the boolean counterpart of the
   * `@Type(() => Number)` that `PaginationQueryDto` puts on `page`. Only the two
   * exact spellings convert; `?isRead=yes` is a `400` naming the field rather
   * than a filter nobody asked for.
   *
   * No initialiser: absent means "both", which is not a value a boolean could
   * carry.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly isRead?: boolean;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(NOTIFICATION_SORT_FIELDS)
  readonly sortBy: NotificationSortField = DEFAULT_NOTIFICATION_SORT_FIELD;

  /**
   * Newest first unless asked otherwise — the one list in this project that
   * defaults to `desc`.
   *
   * Redeclared for the initialiser alone; the `@IsOptional()` and `@IsEnum()`
   * are inherited, because class-validator applies a parent's constraints to a
   * property a subclass overrides. Restating them here would register the same
   * rules twice and report a bad direction twice — the same call
   * `LeaveRequestQueryDto` makes when it redeclares `year`.
   *
   * The reason for the departure is what the resource is. Every other collection
   * in this API is a register read in a stable order somebody chose; an inbox is
   * a feed, where the row that matters is the one that arrived last. Opening
   * every notification list on its oldest message would be a default nobody
   * wants and everybody overrides.
   */
  override readonly sortOrder: SortOrder = SortOrder.DESC;
}
