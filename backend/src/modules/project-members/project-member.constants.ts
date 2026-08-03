/**
 * The project-member module's literals, in one place.
 *
 * Shorter than its siblings on purpose: a membership has no text columns of its
 * own. It is two foreign keys, a flag and two dates, so the bounds that would
 * live here — how long an id may be — are the shared `RELATION_ID_MAX_LENGTH`
 * instead, and the only decisions left are about ordering.
 */

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * Only the two dates are offered, which is what the feature asked for and also
 * what is useful: `isProjectManager` has two values and would order rows into
 * two undifferentiated blocks, and the two ids are opaque keys nobody reads in
 * sequence.
 */
export const PROJECT_MEMBER_SORT_FIELDS = ['joinedAt', 'leftAt'] as const;

export type ProjectMemberSortField =
  (typeof PROJECT_MEMBER_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `joinedAt` rather than `leftAt`: every membership has one, so the ordering is
 * defined for every row in the table. `leftAt` is null for exactly the rows a
 * caller usually cares about most — the active ones — which makes it a poor
 * default however its nulls are placed.
 */
export const DEFAULT_PROJECT_MEMBER_SORT_FIELD: ProjectMemberSortField =
  'joinedAt';
