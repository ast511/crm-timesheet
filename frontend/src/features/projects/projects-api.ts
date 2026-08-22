import { apiDelete, apiGet, apiPatch, apiPost, type PaginatedResult } from '@/api/client';
import type { components, operations } from '@/api/generated/openapi';
import { toQueryParams } from '@/components/data-table/useDataTableState';
import type { DataTableState } from '@/components/data-table/data-table.types';

/**
 * `/api/v1/projects` — the work the company bills, and what a timesheet line
 * points at.
 *
 * The same shape as `departments-api.ts` and `public-holidays-api.ts`: every
 * type comes from the generated contract, and the list query is read off the
 * operation itself so the set of sortable columns and the set of accepted
 * parameters are the backend's rather than a copy of them that can drift.
 *
 * ## What this module is not
 *
 * **Membership is out of scope.** `POST /projects/{id}/members` and the roster
 * endpoints are a separate resource with a separate feature; neither
 * `CreateProjectDto` nor `UpdateProjectDto` carries a member, and the settings
 * screen built on this module edits the project itself. `ProjectRosterEntity`
 * and `ProjectMember*` are deliberately unreferenced here.
 *
 * ## `GET /projects` carries no permission, and must not
 *
 * `ProjectController` has no `@RequirePermission()` on any verb, which is a
 * deliberate property of the list route rather than an oversight to correct
 * from this side: the timesheet's project picker reads it for **every**
 * employee, and the `USER` baseline holds no `PROJECTS.*` key at all. Gating it
 * would empty that picker. The screen this module serves is gated in the router
 * and in the sidebar instead — see `ProjectsPage`.
 */

/** One project, exactly as the API returns it. */
export type Project = components['schemas']['ProjectEntity'];

/** The body of `POST /projects`. */
export type CreateProject = components['schemas']['CreateProjectDto'];

/** The body of `PATCH /projects/{id}`. Every field optional. */
export type UpdateProject = components['schemas']['UpdateProjectDto'];

/**
 * `ACTIVE` | `COMPLETED` | `ON_HOLD` | `CANCELLED` — read off the entity rather
 * than written out, so the enum this screen switches on is the enum the API
 * publishes.
 */
export type ProjectStatus = Project['projectStatus'];

/** `LOW` | `MEDIUM` | `HIGH`, on the same terms. */
export type ProjectPriority = Project['projectPriority'];

/** Everything `GET /projects` accepts, from the operation itself. */
export type ProjectsQuery = operations['ProjectController_findAll_v1']['parameters']['query'];

/**
 * The columns the backend will order by — **the only ones a column may declare
 * as its `sortKey`**.
 *
 * `'code' | 'name' | 'clientName' | 'estimatedHours' | 'startDate' |
 * 'createdAt'`, taken from the query type rather than listed by hand, so a
 * column removed from `PROJECT_SORT_FIELDS` becomes a compile error in
 * `useProjectColumns` instead of a `400` the first time somebody clicks that
 * header.
 */
export type ProjectSortKey = ProjectsQuery['sortBy'];

/**
 * `code` — the backend's own default (`DEFAULT_PROJECT_SORT_FIELD`), and the
 * right one for a reason worth repeating rather than inheriting silently: it is
 * required *and* unique, so the order is total and a row can never shift
 * between two pages of the same listing. Project names are neither — two
 * clients can both have a "Website Redesign" — so ordering by one would leave
 * the tie-break doing the real work, which is how a row appears twice while
 * paging.
 */
export const DEFAULT_PROJECT_SORT: ProjectSortKey = 'code';

const PROJECT_SORT_KEYS: readonly string[] = [
  'code',
  'name',
  'clientName',
  'estimatedHours',
  'startDate',
  'createdAt',
] satisfies readonly ProjectSortKey[];

/**
 * The three filters this screen surfaces, named by their query parameter.
 *
 * `DataTableState.filters` is `Record<string, string | undefined>`, because
 * every list endpoint accepts a different set and the shared table cannot know
 * any of them. Here is where that becomes typed again: each filter is held as
 * the string a `<Select>` produces and converted once, on the way out.
 *
 * These three and no others — `ProjectQueryDto` accepts `search`,
 * `projectStatus`, `projectPriority`, `isArchived`, `sortBy`, `sortOrder`,
 * `page` and `limit`, and the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, so an invented parameter would be answered with a
 * `400` rather than ignored.
 */
export const PROJECT_STATUS_FILTER = 'projectStatus';
export const PROJECT_PRIORITY_FILTER = 'projectPriority';
export const IS_ARCHIVED_FILTER = 'isArchived';

/**
 * The order the four lifecycle states are offered in — lifecycle order, so a
 * select reads the way a project moves rather than the way an enum happens to
 * be declared.
 *
 * It is a `Record<ProjectStatus, …>` rather than an array on purpose: a status
 * added to the contract is then a **compile error here**, in the one place that
 * has to offer it, rather than a value the form silently cannot produce and the
 * filter silently cannot select. The same reasoning that puts `ProjectSortKey`
 * on a column's `sortKey`.
 */
const PROJECT_STATUS_ORDER: Record<ProjectStatus, number> = {
  ACTIVE: 0,
  ON_HOLD: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

/** Low to high, which is how a scale is read when it is not urgent-first. */
const PROJECT_PRIORITY_ORDER: Record<ProjectPriority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const byOrder =
  <TValue extends string>(order: Record<TValue, number>) =>
  (a: TValue, b: TValue): number =>
    order[a] - order[b];

/**
 * The statuses a select offers, in display order.
 *
 * `Object.keys` is the one cast in this module, and it is safe by construction:
 * the record's key type *is* `ProjectStatus`, so the runtime keys are exactly
 * that union — TypeScript simply types `Object.keys` as `string[]` for every
 * object.
 */
export const PROJECT_STATUS_OPTIONS: readonly ProjectStatus[] = (
  Object.keys(PROJECT_STATUS_ORDER) as ProjectStatus[]
).sort(byOrder(PROJECT_STATUS_ORDER));

/** The priorities a select offers, in display order. */
export const PROJECT_PRIORITY_OPTIONS: readonly ProjectPriority[] = (
  Object.keys(PROJECT_PRIORITY_ORDER) as ProjectPriority[]
).sort(byOrder(PROJECT_PRIORITY_ORDER));

const parseStatusFilter = (value: string | undefined): ProjectStatus | undefined =>
  value !== undefined && value in PROJECT_STATUS_ORDER ? (value as ProjectStatus) : undefined;

const parsePriorityFilter = (value: string | undefined): ProjectPriority | undefined =>
  value !== undefined && value in PROJECT_PRIORITY_ORDER ? (value as ProjectPriority) : undefined;

const parseBooleanFilter = (value: string | undefined): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined;

const toSortKey = (value: string): ProjectSortKey =>
  PROJECT_SORT_KEYS.includes(value) ? (value as ProjectSortKey) : DEFAULT_PROJECT_SORT;

/**
 * Flattens the table's state into this endpoint's query.
 *
 * `toQueryParams` supplies the half every list shares — and, importantly, its
 * rule that an empty search term is *absent* rather than `search=`, so two
 * spellings of "no term" cannot become two cache entries for one result. The
 * rest is re-stated with the generated types, which is where
 * `data-table.types.ts` says the typed half belongs: `sortBy` narrows to the
 * enum the backend accepts, the two enum filters narrow to their unions, and
 * `isArchived` becomes a boolean rather than the string a form control
 * produced.
 *
 * An unset filter is **omitted** rather than sent as an empty value, for the
 * same reason the search term is: `?projectStatus=` is not "any status" to a
 * validated enum, it is a `400`.
 */
export const toProjectsQuery = (state: DataTableState): ProjectsQuery => {
  const { search } = toQueryParams(state);
  const projectStatus = parseStatusFilter(state.filters[PROJECT_STATUS_FILTER]);
  const projectPriority = parsePriorityFilter(state.filters[PROJECT_PRIORITY_FILTER]);
  const isArchived = parseBooleanFilter(state.filters[IS_ARCHIVED_FILTER]);

  return {
    page: state.page,
    limit: state.limit,
    sortBy: toSortKey(state.sortBy),
    sortOrder: state.sortOrder,
    ...(typeof search === 'string' ? { search } : {}),
    ...(projectStatus === undefined ? {} : { projectStatus }),
    ...(projectPriority === undefined ? {} : { projectPriority }),
    ...(isArchived === undefined ? {} : { isArchived }),
  };
};

/** One page of projects. */
export const fetchProjects = (
  query: ProjectsQuery,
  signal?: AbortSignal,
): Promise<PaginatedResult<Project>> => apiGet('/api/v1/projects', { query, signal });

/**
 * Answers `201` with the stored row — `isArchived`, `projectStatus` and
 * `projectPriority` defaulted by the schema when the body omits them.
 */
export const createProject = (body: CreateProject): Promise<Project> =>
  apiPost('/api/v1/projects', { body });

/** A partial update; the response is the whole row as it now stands. */
export const updateProject = (id: string, body: UpdateProject): Promise<Project> =>
  apiPatch('/api/v1/projects/{id}', { path: { id }, body });

/**
 * Deletes a project nothing depends on.
 *
 * **A `409` is the expected refusal here**, and the strongest of the four
 * settings screens: the service counts memberships *and* timesheet entries
 * before deleting, because either would rewrite history — who worked on this,
 * and the hours booked against it on a month the company has signed off. Both
 * are backed by `ON DELETE RESTRICT`, so the check is a message naming what is
 * in the way rather than a driver error surfacing as a `500`.
 *
 * The way past it is `isArchived`, not a harder delete — which is exactly what
 * `DeleteProjectDialog` says.
 *
 * The endpoint answers `200` with `data: null` rather than `204`, so the client
 * reads the same envelope it reads everywhere else (backend Feature 006). The
 * contract types that `data` as `unknown` rather than as `null`, so the result
 * is left inferred instead of narrowed by hand — nothing reads it, and the
 * mutation names the deleted row from its own variables.
 */
export const deleteProject = (id: string) => apiDelete('/api/v1/projects/{id}', { path: { id } });
