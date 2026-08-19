import { apiDelete, apiGet, apiPatch, apiPost, type PaginatedResult } from '@/api/client';
import type { components, operations } from '@/api/generated/openapi';
import { toQueryParams } from '@/components/data-table/useDataTableState';
import type { DataTableState } from '@/components/data-table/data-table.types';

/**
 * `/api/v1/leave-types` — the kinds of leave the company recognises.
 *
 * Every type here comes from the generated contract. `LeaveTypeEntity` is what
 * a row is, `CreateLeaveTypeDto` and `UpdateLeaveTypeDto` are what the two
 * writes accept, and the list query is read off the operation itself — so the
 * set of sortable columns and the set of filters are the backend's, not a copy
 * of them that can drift.
 */

/** One leave type, exactly as the API returns it. */
export type LeaveType = components['schemas']['LeaveTypeEntity'];

/** The body of `POST /leave-types`. */
export type CreateLeaveType = components['schemas']['CreateLeaveTypeDto'];

/** The body of `PATCH /leave-types/{id}`. Every field optional. */
export type UpdateLeaveType = components['schemas']['UpdateLeaveTypeDto'];

/** Everything `GET /leave-types` accepts, from the operation itself. */
export type LeaveTypesQuery = operations['LeaveTypesController_findAll_v1']['parameters']['query'];

/**
 * The columns the backend will order by — **the only ones a column may declare
 * as its `sortKey`**.
 *
 * Taken from the query type rather than listed by hand, so a column removed
 * from the backend's enum becomes a compile error in `useLeaveTypeColumns`
 * instead of a `400` the first time somebody clicks that header.
 *
 * The three booleans are filterable and deliberately not sortable: ordering a
 * list by a two-valued column groups it rather than sorts it.
 */
export type LeaveTypeSortKey = LeaveTypesQuery['sortBy'];

/**
 * `label` — the backend's own default, and a total order.
 *
 * It is unique, so no record can shift between two pages of one listing the way
 * it can under a column with ties.
 */
export const DEFAULT_LEAVE_TYPE_SORT: LeaveTypeSortKey = 'label';

const LEAVE_TYPE_SORT_KEYS: readonly string[] = [
  'code',
  'label',
  'defaultAllocatedDays',
  'createdAt',
] satisfies readonly LeaveTypeSortKey[];

/**
 * `?isActive=` — the one filter this screen surfaces.
 *
 * `DataTableState.filters` is `Record<string, string | undefined>`, because
 * every list endpoint accepts a different set and the shared table cannot know
 * any of them. Here is where that becomes typed again: the filter is held as
 * the string a `<Select>` produces and converted once, on the way out.
 */
export const IS_ACTIVE_FILTER = 'isActive';

const parseBooleanFilter = (value: string | undefined): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined;

const toSortKey = (value: string): LeaveTypeSortKey =>
  LEAVE_TYPE_SORT_KEYS.includes(value) ? (value as LeaveTypeSortKey) : DEFAULT_LEAVE_TYPE_SORT;

/**
 * Flattens the table's state into this endpoint's query.
 *
 * `toQueryParams` supplies the half every list shares — and, importantly, its
 * rule that an empty search term is *absent* rather than `search=`, so two
 * spellings of "no term" cannot become two cache entries for one result. The
 * rest is re-stated with the generated types, which is where
 * `data-table.types.ts` says the typed half belongs: `sortBy` narrows to the
 * enum the backend accepts, and `isActive` becomes a boolean rather than the
 * string a form control produced.
 */
export const toLeaveTypesQuery = (state: DataTableState): LeaveTypesQuery => {
  const { search } = toQueryParams(state);
  const isActive = parseBooleanFilter(state.filters[IS_ACTIVE_FILTER]);

  return {
    page: state.page,
    limit: state.limit,
    sortBy: toSortKey(state.sortBy),
    sortOrder: state.sortOrder,
    ...(typeof search === 'string' ? { search } : {}),
    ...(isActive === undefined ? {} : { isActive }),
  };
};

/** One page of leave types. */
export const fetchLeaveTypes = (
  query: LeaveTypesQuery,
  signal?: AbortSignal,
): Promise<PaginatedResult<LeaveType>> =>
  apiGet('/api/v1/leave-types', { query, signal });

/** Answers `201` with the stored row — trimmed and upper-cased as the DTO decided. */
export const createLeaveType = (body: CreateLeaveType): Promise<LeaveType> =>
  apiPost('/api/v1/leave-types', { body });

/** A partial update; the response is the whole row as it now stands. */
export const updateLeaveType = (id: string, body: UpdateLeaveType): Promise<LeaveType> =>
  apiPatch('/api/v1/leave-types/{id}', { path: { id }, body });

/**
 * Refused with a `409` while any balance or leave request still names the type.
 *
 * The endpoint answers `200` with `data: null` rather than `204`, so the client
 * reads the same envelope it reads everywhere else (backend Feature 006). The
 * contract types that `data` as `unknown` rather than as `null`, so the result
 * is left inferred instead of narrowed by hand — nothing reads it, and the
 * mutation names the deleted row from its own variables.
 */
export const deleteLeaveType = (id: string) =>
  apiDelete('/api/v1/leave-types/{id}', { path: { id } });