/**
 * The vocabulary every paginated endpoint shares.
 *
 * Declared as interfaces rather than classes because nothing here is
 * instantiated or validated: `PaginationQueryDto` supplies the input side, and
 * `buildPaginatedResult` produces the output side.
 */

/** A validated page request. `PaginationQueryDto` satisfies this shape. */
export interface PaginationParams {
  page: number;
  limit: number;
}

/** Everything a client needs to render pagination controls. */
export interface PaginationMeta extends PaginationParams {
  /** Total number of records matching the query, across all pages. */
  total: number;
  /** Number of pages at the current `limit`; `0` when nothing matched. */
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/**
 * A page of records plus its metadata.
 *
 * Kept separate from the `ApiSuccessResponse` envelope: a service returns a
 * `PaginatedResult`, and the global interceptor wraps it, so the two concerns
 * never have to know about each other.
 */
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}
