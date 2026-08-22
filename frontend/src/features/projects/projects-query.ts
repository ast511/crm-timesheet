import { queryOptions } from '@tanstack/react-query';

import type { DataTableState } from '@/components/data-table/data-table.types';

import { fetchProjects, toProjectsQuery } from './projects-api';

/**
 * Projects as server state.
 *
 * The arrangement `leave-types-query.ts` established and the two lists after it
 * repeated, unchanged. The `DataTable` is server-side, so page, page size, sort
 * column, direction, search term and the three filters are query parameters;
 * putting the resolved query in the key means page 2 is a **different entry**
 * from page 1 rather than an overwrite of it, so paging back and forth is
 * instant, a sort is a fetch of the sorted page rather than a re-order of
 * twenty visible rows, and nothing has to be invalidated to make a control take
 * effect.
 *
 * It is keyed on the *resolved* query rather than on the raw state so two
 * states that mean the same request — a search of `''` and a search of `'  '`,
 * or an unset filter and one cleared back to "all" — share one entry instead of
 * fetching twice for one answer.
 */

/** The prefix every entry shares, and therefore what a write invalidates. */
export const PROJECTS_QUERY_KEY = ['projects'] as const;

/**
 * Thirty seconds, the same as the three settings lists before it.
 *
 * A project list changes more often than a statutory calendar — a status moves,
 * a project is archived — and this is the screen where somebody is editing it,
 * often alongside a colleague working through the same list. Long enough that
 * paging back to a page just visited is a cache read, short enough that a
 * neighbour's row appears without a reload.
 */
const PROJECTS_STALE_TIME_MS = 30_000;

export const projectsQueryOptions = (state: DataTableState) => {
  const query = toProjectsQuery(state);

  return queryOptions({
    queryKey: [...PROJECTS_QUERY_KEY, 'list', query],
    queryFn: ({ signal }) => fetchProjects(query, signal),
    staleTime: PROJECTS_STALE_TIME_MS,
  });
};
