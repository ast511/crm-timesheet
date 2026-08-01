import { FIRST_PAGE } from '../constants/pagination.constants';
import {
  PaginatedResult,
  PaginationParams,
  PaginationMeta,
} from '../interfaces/pagination.interface';

/**
 * Translates a page request into the arguments Prisma expects.
 *
 * The `(page - 1) * limit` arithmetic is the one place a paginated service can
 * get subtly wrong — an off-by-one silently skips or repeats a record — so it
 * is written once and covered by tests.
 */
export function toSkipTake({ page, limit }: PaginationParams): {
  skip: number;
  take: number;
} {
  return {
    skip: (page - FIRST_PAGE) * limit,
    take: limit,
  };
}

/**
 * Assembles the page of records and its metadata.
 *
 * `total` is the count of *all* matching records, not the length of `items`;
 * services obtain it from the `prisma.$transaction([findMany, count])` pair
 * that reads both under one snapshot.
 */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  { page, limit }: PaginationParams,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);

  const meta: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
    hasPreviousPage: page > FIRST_PAGE,
    hasNextPage: page < totalPages,
  };

  return { items, meta };
}
