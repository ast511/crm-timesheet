import { IsEnum, IsOptional } from 'class-validator';

import { SortOrder } from '../enums/sort-order.enum';
import { PaginationQueryDto } from './pagination-query.dto';

/**
 * Query parameters every *sortable* list endpoint accepts:
 * `?page=2&limit=50&sortOrder=desc`.
 *
 * Only the direction lives here. The sortable *columns* differ from one
 * resource to the next and reach Prisma's `orderBy` as keys, so each module
 * declares its own `sortBy` against a closed list of its own; the direction is
 * the half of the ordering that never varies.
 *
 * Feature 007 deliberately left this class unwritten, on the grounds that a base
 * class carrying a single field is an abstraction that should wait until a
 * second list endpoint confirms the shape. Feature 008 is that second endpoint,
 * and the shape held, so the field moves here rather than being declared
 * identically in two query DTOs.
 *
 * The default is a property initialiser, the same technique
 * `PaginationQueryDto` uses: an absent parameter leaves the initialiser in
 * place, so a service always receives a concrete direction and never has to
 * apply a fallback of its own.
 */
export class SortQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SortOrder)
  readonly sortOrder: SortOrder = SortOrder.ASC;
}
