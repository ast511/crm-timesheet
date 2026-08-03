/**
 * Bounds that apply to a foreign key however it arrives, in one place.
 *
 * Separate from `pagination.constants.ts` because it answers a different
 * question — that file bounds a *page*, this one bounds an *id* — and because a
 * DTO that accepts a relation rarely also paginates.
 */

/**
 * Bound on a foreign key accepted from a client.
 *
 * Ids are cuids — 25 characters today — so this is headroom rather than a
 * format check: its job is to keep a megabyte of text out of an indexed lookup,
 * not to decide what a valid id looks like. An id of the right length that
 * matches no row is reported as a missing relation, which is the honest answer.
 */
export const RELATION_ID_MAX_LENGTH = 50;
