/**
 * Pagination limits, defined once for the whole API.
 *
 * `PaginationQueryDto` validates against these and the frontend can rely on
 * them, so changing a page size is a single edit here rather than a search for
 * magic numbers across every list endpoint.
 */

/** Page numbering is 1-based — `?page=1` is the first page, not `?page=0`. */
export const FIRST_PAGE = 1;

/** Page size applied when the client does not ask for one. */
export const DEFAULT_PAGE_SIZE = 20;

/** Smallest page size a client may request. */
export const MIN_PAGE_SIZE = 1;

/**
 * Largest page size a client may request.
 *
 * The cap exists so a single request cannot ask the database for an unbounded
 * result set; anything above it is rejected instead of silently clamped, so the
 * client learns its query was not honoured.
 */
export const MAX_PAGE_SIZE = 100;
