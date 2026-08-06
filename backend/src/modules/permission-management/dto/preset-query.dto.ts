import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserRole } from '../../../generated/prisma/enums';

/**
 * Query string of `GET /api/v1/permissions/presets`:
 * `?page=1&limit=20&targetRole=HR`.
 *
 * Extends `PaginationQueryDto` rather than `SortQueryDto`, and the missing half
 * is deliberate: **there is no `?sortBy=` and no `?sortOrder=`**. The screen
 * renders six fixed cards in two groups, and the only order that means anything
 * is the one the cards are grouped in — `targetRole` by `UserRole`'s declaration
 * order, so `ADMIN` precedes `HR`, then `name` inside each group. Offering a
 * direction here would be offering to reverse a fixed vocabulary of six, and
 * every client would then have to decide which way it wanted them.
 *
 * The pagination is inherited because every collection in this API has it, not
 * because six rows need paging.
 */
export class PresetQueryDto extends PaginationQueryDto {
  /**
   * The role whose cards to return: `?targetRole=HR`.
   *
   * Grouping rather than a constraint — a preset may be applied to any account
   * that is not a super-admin, so this narrows what is *shown* and not what may
   * be *used*. `?targetRole=SUPERADMIN` is a legal query that returns nothing,
   * which is the honest answer: a super-admin already holds everything, so no
   * preset is written for one.
   */
  @IsOptional()
  @IsEnum(UserRole)
  readonly targetRole?: UserRole;
}
