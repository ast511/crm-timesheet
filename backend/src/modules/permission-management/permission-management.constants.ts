import { SortOrder } from '../../common/enums/sort-order.enum';

/**
 * The permission-management module's bounds, literals and sortable columns, in
 * one place.
 *
 * Almost everything this module reads is *seeded vocabulary* rather than text
 * somebody typed, which is why there are fewer length bounds here than in any
 * other module's constants file: there is no `POST /permissions` and no
 * `POST /permissions/presets`, so `label`, `name` and `description` are never
 * accepted from a client and need no `@MaxLength`. What a client does send is a
 * *key* — `TIMESHEET.CREATE`, `HR_FULL_ACCESS` — and those are bounded here.
 */

/**
 * Bound on a permission or preset key arriving in a body or a query.
 *
 * Shape only, and generous: the longest key the seed writes is
 * `NOTIFICATION_CONFIG.PAGE_ACCESS` at 31 characters. Its job is to keep a
 * megabyte of text out of an indexed lookup, not to decide what a valid key
 * looks like — the same call `RELATION_ID_MAX_LENGTH` makes for a foreign key.
 * A well-formed key matching no row is reported as an unknown key, which is the
 * honest answer.
 */
export const PERMISSION_KEY_MAX_LENGTH = 100;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const PERMISSION_SEARCH_MAX_LENGTH = 100;

/**
 * How many permission keys one `PUT /users/:id/permissions` body may carry.
 *
 * The catalog holds fifty-five rows and a body states the *full* intended set,
 * so the largest legitimate request is fifty-five keys. The cap is 200 rather
 * than 55 deliberately: it is a bound on the work one request can ask for, not a
 * restatement of the catalog's size, and pinning it to the exact count would
 * turn the first migration that adds a permission into a request the API
 * suddenly refuses. A body that exceeds this is not a matrix — it is a mistake.
 *
 * There is no minimum. **An empty array is a legitimate body**: it is the
 * intended set "nothing", which normalises to a `REVOKE` of everything the role
 * grants. `DELETE` is what resets a user to their role; an empty `PUT` is the
 * opposite of that, and the two must stay distinguishable.
 */
export const MAX_PERMISSION_KEYS_PER_REQUEST = 200;

/**
 * Columns `?sortBy=` accepts on `/permissions`.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * `resource` and `action` sort by their enums' *declaration* order, which is why
 * both are declared in `schema.prisma` in the order the matrix renders —
 * resources down the page, actions across it. `?sortBy=resource` therefore
 * returns the catalog in exactly the order the screen draws it, which is what
 * makes it the default.
 *
 * `label` is deliberately absent. It is not unique, not stable across resources
 * — five rows say "Create" — and ordering a catalog by it would interleave the
 * twelve resources into an alphabet nobody is looking for. `key` sorts
 * alphabetically and is the searchable field, so it is the one that earns a
 * place.
 */
export const PERMISSION_SORT_FIELDS = ['resource', 'action', 'key'] as const;

export type PermissionSortField = (typeof PERMISSION_SORT_FIELDS)[number];

/**
 * Default ordering column for the catalog.
 *
 * `resource`, so an unqualified `GET /permissions` returns the matrix already
 * blocked by resource and, within each block, in action order — see
 * {@link PERMISSION_SECONDARY_SORT_FIELD}. Every other list in this project
 * defaults to `createdAt`, and this one does not for a reason that is about what
 * the rows are: those are registers of things people made, where "in the order
 * they were set up" reads without explanation, while this is a *matrix* whose
 * only meaningful order is the one it is drawn in. Sorting a permission catalog
 * by creation time would order it by the order somebody happened to write the
 * seed.
 */
export const DEFAULT_PERMISSION_SORT_FIELD: PermissionSortField = 'resource';

/**
 * The column applied after `?sortBy=resource`, before the `id` tie-break.
 *
 * Two rows of one resource are otherwise ordered arbitrarily, and a matrix whose
 * actions came back in a different order per request would be redrawn with its
 * columns shuffled. It is applied only when it is not already the requested
 * column, so `?sortBy=action` does not order by action twice.
 */
export const PERMISSION_SECONDARY_SORT_FIELD: PermissionSortField = 'action';

/**
 * Columns `?sortBy=` accepts on `/users/:id/permissions/history`.
 *
 * Exactly one, and that is the honest size of the list rather than an omission.
 * The history is a feed of moments; `action` and `permissionId` are filters
 * rather than orders — grouping a chronology by the kind of change would answer
 * "what happened to this person" with a list nobody can read down. It is a list
 * of one because `@IsIn()` takes a list, and because the day a second column
 * earns a place this is the line that changes.
 */
export const PERMISSION_HISTORY_SORT_FIELDS = ['createdAt'] as const;

export type PermissionHistorySortField =
  (typeof PERMISSION_HISTORY_SORT_FIELDS)[number];

export const DEFAULT_PERMISSION_HISTORY_SORT_FIELD: PermissionHistorySortField =
  'createdAt';

/**
 * Newest first, the second list in this project to depart from the shared
 * ascending default after the notification centre's.
 *
 * The departure is the same one and rests on the same distinction: the
 * administrative registers of Features 021 and 027 are read in a stable order
 * somebody chose, while a history is a feed whose row that matters is the one
 * that arrived last. Opening the History tab on the oldest change somebody ever
 * made to an account would be a default every client overrides.
 */
export const DEFAULT_PERMISSION_HISTORY_SORT_ORDER = SortOrder.DESC;

/**
 * Default ordering of the preset list: by the role the cards are grouped under,
 * then by name.
 *
 * Not a `?sortBy=`, because there is nothing to choose. The screen renders six
 * cards in two groups, and `targetRole` orders by `UserRole`'s declaration order
 * — `ADMIN` before `HR` — which is the order a person ranks them in. A client
 * that wanted them any other way would be re-grouping a fixed vocabulary of six.
 */
export const PRESET_ORDER_FIELDS = ['targetRole', 'name'] as const;
