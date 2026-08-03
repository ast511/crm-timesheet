import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  ProjectPriority,
  ProjectStatus,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_PROJECT_SORT_FIELD,
  PROJECT_SEARCH_MAX_LENGTH,
  PROJECT_SORT_FIELDS,
  ProjectSortField,
} from '../project.constants';
import { IsProjectPriority, IsProjectStatus } from './project-field.decorators';

/**
 * Query string of `GET /api/v1/projects`:
 * `?page=2&limit=50&search=portal&isArchived=false&sortBy=clientName`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and
 * `sortOrder`, so the shared defaults, the page-size cap and the direction
 * vocabulary apply here without being restated. Only the per-resource
 * parameters are declared locally.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * the other query DTOs use: an absent parameter leaves the initialiser in
 * place, so the service always receives a concrete ordering and never has to
 * apply a fallback of its own. The three filters have no initialiser — for
 * them, absent means "do not filter", which is not a value they could carry. In
 * particular, omitting `isArchived` lists archived and live projects alike;
 * hiding archived rows by default would be a policy the caller cannot see or
 * turn off.
 *
 * There is no `?isActive=` parameter. Feature 012 removed the column it filtered
 * on: whether a project is live is `?projectStatus=ACTIVE` (or `ON_HOLD`), asked
 * of the one column that answers it.
 */
export class ProjectQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `code`, `name` and `clientName`.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(PROJECT_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** `?isArchived=true` / `=false`; anything else is a `400`. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly isArchived?: boolean;

  /**
   * Exact lifecycle state, e.g. `?projectStatus=ON_HOLD`.
   *
   * Validated against the enum, so it reaches Prisma as a value the column can
   * hold rather than as arbitrary text.
   */
  @IsOptional()
  @IsProjectStatus()
  readonly projectStatus?: ProjectStatus;

  /** Exact priority, on the same terms as `projectStatus`. */
  @IsOptional()
  @IsProjectPriority()
  readonly projectPriority?: ProjectPriority;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(PROJECT_SORT_FIELDS)
  readonly sortBy: ProjectSortField = DEFAULT_PROJECT_SORT_FIELD;
}
