import { queryOptions } from '@tanstack/react-query';

import type { DataTableState } from '@/components/data-table/data-table.types';

import { fetchLeaveTypes, toLeaveTypesQuery } from './leave-types-api';

/**
 * Leave types as server state.
 *
 * ## The query key is the table's state, and that is the whole design
 *
 * The `DataTable` is server-side: page, page size, sort column, direction,
 * search term and filters are query parameters. Putting the resolved query in
 * the key means page 2 is a **different entry** from page 1 rather than an
 * overwrite of it — so paging back and forth is instant, a sort is a fetch of
 * the sorted page rather than a re-order of twenty visible rows, and nothing
 * has to be invalidated to make a control take effect.
 *
 * It is keyed on the *resolved* query rather than on the raw state so two
 * states that mean the same request — a search of `''` and a search of `'  '`
 * — share one entry instead of fetching twice for one answer.
 */

/** The prefix every entry shares, and therefore what a write invalidates. */
export const LEAVE_TYPES_QUERY_KEY = ['leave-types'] as const;

/**
 * Short, and for a different reason than the profile's five minutes.
 *
 * Leave types are configuration several administrators share: somebody else
 * adding one is a change this screen should notice without a reload. Thirty
 * seconds is long enough that paging back to a page just visited is a cache
 * read, and short enough that a colleague's edit surfaces on the next
 * interaction rather than on the next session.
 */
const LEAVE_TYPES_STALE_TIME_MS = 30_000;

export const leaveTypesQueryOptions = (state: DataTableState) => {
  const query = toLeaveTypesQuery(state);

  return queryOptions({
    queryKey: [...LEAVE_TYPES_QUERY_KEY, 'list', query],
    queryFn: ({ signal }) => fetchLeaveTypes(query, signal),
    staleTime: LEAVE_TYPES_STALE_TIME_MS,
  });
};