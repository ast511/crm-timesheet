import { IsEnum, IsIn, IsOptional } from 'class-validator';

import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { PermissionAuditAction } from '../../../generated/prisma/enums';
import {
  DEFAULT_PERMISSION_HISTORY_SORT_FIELD,
  DEFAULT_PERMISSION_HISTORY_SORT_ORDER,
  PERMISSION_HISTORY_SORT_FIELDS,
  PermissionHistorySortField,
} from '../permission-management.constants';

/**
 * Query string of `GET /api/v1/users/:id/permissions/history`:
 * `?page=2&limit=50&action=PRESET_APPLIED`.
 *
 * **There is no `?search=`**, and that is a decision rather than an omission. A
 * history row holds no free text — every field on it is an enum, a foreign key
 * or a timestamp — so a substring search would have to match against the joined
 * permission's key or label, which is `?action=` and the permission filter said
 * less precisely. The list is already scoped to one user by the URL, which is
 * the narrowing that matters.
 *
 * There is no `?changedByUserId=` either. "Everything this administrator did" is
 * a genuine question and a genuinely different one — it spans users, so it
 * belongs on a route that is not scoped to a single account. Answering it here
 * would mean a filter that only ever returns the intersection of two scopes.
 */
export class PermissionHistoryQueryDto extends SortQueryDto {
  /**
   * One kind of change: `?action=PRESET_APPLIED` is the list of times somebody
   * was put on a preset, without the per-permission lines underneath.
   *
   * Filtering to a summary action is the useful case and the reason this exists:
   * a busy account's history is mostly per-permission rows, and "when was this
   * person's access last reset" is otherwise a scroll.
   */
  @IsOptional()
  @IsEnum(PermissionAuditAction)
  readonly action?: PermissionAuditAction;

  /**
   * Column to order by. Exactly one is offered — see
   * `PERMISSION_HISTORY_SORT_FIELDS` for why a chronology has no second
   * meaningful order.
   */
  @IsOptional()
  @IsIn(PERMISSION_HISTORY_SORT_FIELDS)
  readonly sortBy: PermissionHistorySortField =
    DEFAULT_PERMISSION_HISTORY_SORT_FIELD;

  /**
   * Newest first unless asked otherwise.
   *
   * Redeclared for the initialiser alone; the `@IsOptional()` and `@IsEnum()`
   * are inherited, because class-validator applies a parent's constraints to a
   * property a subclass overrides. Restating them here would register the same
   * rules twice and report a bad direction twice — the call
   * `NotificationQueryDto` already makes.
   *
   * The second list in this project to depart from the shared ascending default,
   * and for the same reason as the first: a history is a feed, and the row that
   * matters is the one that arrived last.
   */
  override readonly sortOrder: SortOrder =
    DEFAULT_PERMISSION_HISTORY_SORT_ORDER;
}
