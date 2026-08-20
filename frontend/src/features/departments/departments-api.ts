import { apiDelete, apiGet, apiPatch, apiPost, type PaginatedResult } from '@/api/client';
import type { components, operations } from '@/api/generated/openapi';
import { toQueryParams } from '@/components/data-table/useDataTableState';
import type { DataTableState } from '@/components/data-table/data-table.types';

/**
 * `/api/v1/departments` — the organisational units employees belong to.
 *
 * The same shape as `leave-types-api.ts`, on a simpler entity: every type comes
 * from the generated contract, and the list query is read off the operation
 * itself so the set of sortable columns and the set of accepted parameters are
 * the backend's rather than a copy of them that can drift.
 */

/** One department, exactly as the API returns it. */
export type Department = components['schemas']['DepartmentEntity'];

/** The body of `POST /departments`. */
export type CreateDepartment = components['schemas']['CreateDepartmentDto'];

/** The body of `PATCH /departments/{id}`. Every field optional. */
export type UpdateDepartment = components['schemas']['UpdateDepartmentDto'];

/** Everything `GET /departments` accepts, from the operation itself. */
export type DepartmentsQuery = operations['DepartmentController_findAll_v1']['parameters']['query'];

/**
 * The columns the backend will order by — **the only ones a column may declare
 * as its `sortKey`**.
 *
 * `'code' | 'name' | 'createdAt'`, taken from the query type rather than listed
 * by hand, so a column removed from `DEPARTMENT_SORT_FIELDS` becomes a compile
 * error in `useDepartmentColumns` instead of a `400` the first time somebody
 * clicks that header.
 */
export type DepartmentSortKey = DepartmentsQuery['sortBy'];

/**
 * `name` — the backend's own default (`DEFAULT_DEPARTMENT_SORT_FIELD`), and a
 * total order.
 *
 * It is unique, so no record can shift between two pages of one listing the way
 * it can under a column with ties.
 */
export const DEFAULT_DEPARTMENT_SORT: DepartmentSortKey = 'name';

const DEPARTMENT_SORT_KEYS: readonly string[] = [
  'code',
  'name',
  'createdAt',
] satisfies readonly DepartmentSortKey[];

const toSortKey = (value: string): DepartmentSortKey =>
  DEPARTMENT_SORT_KEYS.includes(value) ? (value as DepartmentSortKey) : DEFAULT_DEPARTMENT_SORT;

/**
 * Flattens the table's state into this endpoint's query.
 *
 * ## There is no filter half, and that is the contract rather than an omission
 *
 * `toLeaveTypesQuery` converts an `isActive` filter on the way out.
 * `DepartmentQueryDto` accepts **no filter at all** — only `search`, `sortBy`,
 * `sortOrder`, `page` and `limit`, which the generated `DepartmentsQuery`
 * confirms. So `state.filters` is deliberately not spread into the result: the
 * global `ValidationPipe` runs with `forbidNonWhitelisted`, meaning an
 * `?isActive=` this screen invented would be answered with a `400` rather than
 * ignored. `isActive` is a *field* on a department, readable in its column and
 * editable in the form; it is not a way to query the list.
 *
 * `toQueryParams` supplies the half every list shares — and, importantly, its
 * rule that an empty search term is *absent* rather than `search=`, so two
 * spellings of "no term" cannot become two cache entries for one result.
 */
export const toDepartmentsQuery = (state: DataTableState): DepartmentsQuery => {
  const { search } = toQueryParams(state);

  return {
    page: state.page,
    limit: state.limit,
    sortBy: toSortKey(state.sortBy),
    sortOrder: state.sortOrder,
    ...(typeof search === 'string' ? { search } : {}),
  };
};

/** One page of departments. */
export const fetchDepartments = (
  query: DepartmentsQuery,
  signal?: AbortSignal,
): Promise<PaginatedResult<Department>> => apiGet('/api/v1/departments', { query, signal });

/** Answers `201` with the stored row — trimmed and upper-cased as the DTO decided. */
export const createDepartment = (body: CreateDepartment): Promise<Department> =>
  apiPost('/api/v1/departments', { body });

/** A partial update; the response is the whole row as it now stands. */
export const updateDepartment = (id: string, body: UpdateDepartment): Promise<Department> =>
  apiPatch('/api/v1/departments/{id}', { path: { id }, body });

/**
 * Refused with a `409` while any employee is still assigned to the department.
 *
 * The endpoint answers `200` with `data: null` rather than `204`, so the client
 * reads the same envelope it reads everywhere else (backend Feature 006). The
 * contract types that `data` as `unknown` rather than as `null`, so the result
 * is left inferred instead of narrowed by hand — nothing reads it, and the
 * mutation names the deleted row from its own variables.
 */
export const deleteDepartment = (id: string) =>
  apiDelete('/api/v1/departments/{id}', { path: { id } });
