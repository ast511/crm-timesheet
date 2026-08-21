import { queryOptions } from '@tanstack/react-query';

import type { DataTableState } from '@/components/data-table/data-table.types';

import { fetchPublicHolidays, toPublicHolidaysQuery } from './public-holidays-api';

/**
 * Public holidays as server state.
 *
 * The arrangement `leave-types-query.ts` established and `departments-query.ts`
 * repeated, unchanged. The `DataTable` is server-side, so page, page size, sort
 * column, direction, search term and the two filters are query parameters;
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
export const PUBLIC_HOLIDAYS_QUERY_KEY = ['public-holidays'] as const;

/**
 * Thirty seconds, the same as the two settings lists before it.
 *
 * A statutory calendar changes a few times a year, so a longer window would be
 * defensible — but this is the screen where somebody is *editing* it, often
 * alongside a colleague working through the same list, and the value of a
 * neighbour's row appearing without a reload is worth more than the requests
 * saved. Long enough that paging back to a page just visited is a cache read.
 */
const PUBLIC_HOLIDAYS_STALE_TIME_MS = 30_000;

export const publicHolidaysQueryOptions = (state: DataTableState) => {
  const query = toPublicHolidaysQuery(state);

  return queryOptions({
    queryKey: [...PUBLIC_HOLIDAYS_QUERY_KEY, 'list', query],
    queryFn: ({ signal }) => fetchPublicHolidays(query, signal),
    staleTime: PUBLIC_HOLIDAYS_STALE_TIME_MS,
  });
};
