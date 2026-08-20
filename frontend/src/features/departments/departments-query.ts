import { queryOptions } from '@tanstack/react-query';

import type { DataTableState } from '@/components/data-table/data-table.types';

import { fetchDepartments, toDepartmentsQuery } from './departments-api';

/**
 * Departments as server state.
 *
 * The arrangement `leave-types-query.ts` established, unchanged — which is the
 * point of this feature. The `DataTable` is server-side, so page, page size,
 * sort column, direction and search term are query parameters; putting the
 * resolved query in the key means page 2 is a **different entry** from page 1
 * rather than an overwrite of it, so paging back and forth is instant, a sort is
 * a fetch of the sorted page rather than a re-order of twenty visible rows, and
 * nothing has to be invalidated to make a control take effect.
 *
 * It is keyed on the *resolved* query rather than on the raw state so two states
 * that mean the same request — a search of `''` and a search of `'  '` — share
 * one entry instead of fetching twice for one answer.
 */

/** The prefix every entry shares, and therefore what a write invalidates. */
export const DEPARTMENTS_QUERY_KEY = ['departments'] as const;

/**
 * Thirty seconds, for the reason leave types use thirty seconds.
 *
 * Departments are configuration several administrators share: somebody else
 * adding one is a change this screen should notice without a reload. Long enough
 * that paging back to a page just visited is a cache read, short enough that a
 * colleague's edit surfaces on the next interaction rather than the next session.
 */
const DEPARTMENTS_STALE_TIME_MS = 30_000;

export const departmentsQueryOptions = (state: DataTableState) => {
  const query = toDepartmentsQuery(state);

  return queryOptions({
    queryKey: [...DEPARTMENTS_QUERY_KEY, 'list', query],
    queryFn: ({ signal }) => fetchDepartments(query, signal),
    staleTime: DEPARTMENTS_STALE_TIME_MS,
  });
};
