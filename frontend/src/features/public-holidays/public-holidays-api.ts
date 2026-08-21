import { apiDelete, apiGet, apiPatch, apiPost, type PaginatedResult } from '@/api/client';
import type { components, operations } from '@/api/generated/openapi';
import { toQueryParams } from '@/components/data-table/useDataTableState';
import type { DataTableState } from '@/components/data-table/data-table.types';

/**
 * `/api/v1/public-holidays` — the days the company is legally closed.
 *
 * The same shape as `leave-types-api.ts` and `departments-api.ts`: every type
 * comes from the generated contract, and the list query is read off the
 * operation itself so the set of sortable columns and the set of accepted
 * parameters are the backend's rather than a copy of them that can drift.
 *
 * **The `calendar/{year}` and `calendar/{year}/{month}` endpoints are not used
 * here**, deliberately. They answer with `PublicHolidayOccurrenceEntity` — a
 * holiday *resolved onto a particular year*, which is what a calendar screen
 * needs and the opposite of what this one does. This is the settings screen for
 * the stored rows: it edits the rule, not an occurrence of it, so it reads the
 * rows themselves.
 */

/** One public holiday, exactly as the API returns it. */
export type PublicHoliday = components['schemas']['PublicHolidayEntity'];

/** The body of `POST /public-holidays`. */
export type CreatePublicHoliday = components['schemas']['CreatePublicHolidayDto'];

/** The body of `PATCH /public-holidays/{id}`. Every field optional. */
export type UpdatePublicHoliday = components['schemas']['UpdatePublicHolidayDto'];

/**
 * `FIXED` | `VARIABLE` — read off the entity rather than written out, so the
 * enum this screen switches on is the enum the API publishes.
 */
export type HolidayType = PublicHoliday['type'];

/** Everything `GET /public-holidays` accepts, from the operation itself. */
export type PublicHolidaysQuery =
  operations['PublicHolidayController_findAll_v1']['parameters']['query'];

/**
 * The columns the backend will order by — **the only ones a column may declare
 * as its `sortKey`**.
 *
 * `'name' | 'startDate' | 'createdAt'`, taken from the query type rather than
 * listed by hand, so a column removed from `PUBLIC_HOLIDAY_SORT_FIELDS` becomes
 * a compile error in `usePublicHolidayColumns` instead of a `400` the first
 * time somebody clicks that header.
 */
export type PublicHolidaySortKey = PublicHolidaysQuery['sortBy'];

/**
 * `name` — the backend's own default (`DEFAULT_PUBLIC_HOLIDAY_SORT_FIELD`), and
 * the surprising one, since a list of dates would seem to want date order.
 *
 * The backend's reasoning, which this screen inherits rather than second-
 * guesses: a `FIXED` holiday's stored year is disregarded by the recurrence
 * rule, so it is whatever year the row happened to be entered for. New Year
 * saved as `2025-01-01` and Christmas saved as `2026-12-25` would sort a year
 * apart while describing the same twelve months. `name` is the only key that
 * means the same thing for both types — and calendar order is still one click
 * away on the *Dată* header, where anybody who wants it knows what they are
 * looking at.
 */
export const DEFAULT_PUBLIC_HOLIDAY_SORT: PublicHolidaySortKey = 'name';

const PUBLIC_HOLIDAY_SORT_KEYS: readonly string[] = [
  'name',
  'startDate',
  'createdAt',
] satisfies readonly PublicHolidaySortKey[];

/**
 * The two filters this screen surfaces, named by their query parameter.
 *
 * `DataTableState.filters` is `Record<string, string | undefined>`, because
 * every list endpoint accepts a different set and the shared table cannot know
 * any of them. Here is where that becomes typed again: each filter is held as
 * the string a `<Select>` produces and converted once, on the way out.
 *
 * These two and no others — `PublicHolidayQueryDto` accepts `search`, `type`,
 * `isNational`, `sortBy`, `sortOrder`, `page` and `limit`, and the global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so an invented parameter
 * would be answered with a `400` rather than ignored.
 */
export const TYPE_FILTER = 'type';
export const IS_NATIONAL_FILTER = 'isNational';

const HOLIDAY_TYPES: readonly string[] = ['FIXED', 'VARIABLE'] satisfies readonly HolidayType[];

const parseTypeFilter = (value: string | undefined): HolidayType | undefined =>
  value !== undefined && HOLIDAY_TYPES.includes(value) ? (value as HolidayType) : undefined;

const parseBooleanFilter = (value: string | undefined): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined;

const toSortKey = (value: string): PublicHolidaySortKey =>
  PUBLIC_HOLIDAY_SORT_KEYS.includes(value)
    ? (value as PublicHolidaySortKey)
    : DEFAULT_PUBLIC_HOLIDAY_SORT;

/**
 * Flattens the table's state into this endpoint's query.
 *
 * `toQueryParams` supplies the half every list shares — and, importantly, its
 * rule that an empty search term is *absent* rather than `search=`, so two
 * spellings of "no term" cannot become two cache entries for one result. The
 * rest is re-stated with the generated types, which is where
 * `data-table.types.ts` says the typed half belongs: `sortBy` narrows to the
 * enum the backend accepts, `type` narrows to the holiday enum, and
 * `isNational` becomes a boolean rather than the string a form control
 * produced.
 *
 * An unset filter is **omitted** rather than sent as an empty value, for the
 * same reason the search term is: `?type=` is not "any type" to a validated
 * enum, it is a `400`.
 */
export const toPublicHolidaysQuery = (state: DataTableState): PublicHolidaysQuery => {
  const { search } = toQueryParams(state);
  const type = parseTypeFilter(state.filters[TYPE_FILTER]);
  const isNational = parseBooleanFilter(state.filters[IS_NATIONAL_FILTER]);

  return {
    page: state.page,
    limit: state.limit,
    sortBy: toSortKey(state.sortBy),
    sortOrder: state.sortOrder,
    ...(typeof search === 'string' ? { search } : {}),
    ...(type === undefined ? {} : { type }),
    ...(isNational === undefined ? {} : { isNational }),
  };
};

/** One page of public holidays. */
export const fetchPublicHolidays = (
  query: PublicHolidaysQuery,
  signal?: AbortSignal,
): Promise<PaginatedResult<PublicHoliday>> =>
  apiGet('/api/v1/public-holidays', { query, signal });

/** Answers `201` with the stored row — `isRecurring` derived from `type`. */
export const createPublicHoliday = (body: CreatePublicHoliday): Promise<PublicHoliday> =>
  apiPost('/api/v1/public-holidays', { body });

/** A partial update; the response is the whole row as it now stands. */
export const updatePublicHoliday = (
  id: string,
  body: UpdatePublicHoliday,
): Promise<PublicHoliday> => apiPatch('/api/v1/public-holidays/{id}', { path: { id }, body });

/**
 * Deletes a holiday outright.
 *
 * **No `409` here**, unlike leave types and departments: nothing refers to a
 * public holiday — the table has no relations — so there is no history the
 * delete could orphan and no count guarding it. The only refusal is a `404` for
 * an id that is already gone.
 *
 * The endpoint answers `200` with `data: null` rather than `204`, so the client
 * reads the same envelope it reads everywhere else (backend Feature 006). The
 * contract types that `data` as `unknown` rather than as `null`, so the result
 * is left inferred instead of narrowed by hand — nothing reads it, and the
 * mutation names the deleted row from its own variables.
 */
export const deletePublicHoliday = (id: string) =>
  apiDelete('/api/v1/public-holidays/{id}', { path: { id } });
