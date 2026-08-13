/**
 * The vocabulary every paginated endpoint shares.
 *
 * Nothing here is instantiated or validated: `PaginationQueryDto` supplies the
 * input side and `buildPaginatedResult` produces the output side, so these are
 * shapes rather than objects with behaviour.
 *
 * {@link PaginationMeta} is nevertheless a **class**, and it is the only one.
 * Feature 038 documents every paginated endpoint's response, and a schema can
 * only be generated from a runtime value — an interface is erased and there
 * would be nothing for `$ref` to point at. Declaring it as a class costs
 * nothing (it is still only ever produced as an object literal, which satisfies
 * it structurally) and it means the documented page metadata is generated from
 * this declaration rather than hand-copied beside it.
 */

/** A validated page request. `PaginationQueryDto` satisfies this shape. */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Everything a client needs to render pagination controls.
 *
 * `implements PaginationParams` rather than `extends`, because a class cannot
 * extend an interface — the pair of fields is still declared in one place and
 * checked against it by the compiler.
 */
export class PaginationMeta implements PaginationParams {
  /** 1-based index of the page returned. */
  page!: number;
  /** Records per page that were asked for. */
  limit!: number;
  /** Total number of records matching the query, across all pages. */
  total!: number;
  /** Number of pages at the current `limit`; `0` when nothing matched. */
  totalPages!: number;
  /** Whether a page exists before this one. */
  hasPreviousPage!: boolean;
  /** Whether a page exists after this one. */
  hasNextPage!: boolean;
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
