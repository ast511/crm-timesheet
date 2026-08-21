import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/data-table/DataTable';
import { useDataTableState } from '@/components/data-table/useDataTableState';
import { useDataTableTransition } from '@/components/data-table/useDataTableTransition';
import { Card, CardContent } from '@/components/ui/card';

import {
  DEFAULT_PUBLIC_HOLIDAY_SORT,
  IS_NATIONAL_FILTER,
  TYPE_FILTER,
  type PublicHoliday,
} from '../public-holidays-api';
import { useSuspensePublicHolidays } from '../usePublicHolidays';
import { PublicHolidaysEmptyState } from './PublicHolidaysEmptyState';
import { PublicHolidaysScopeFilter } from './PublicHolidaysScopeFilter';
import { PublicHolidaysTypeFilter } from './PublicHolidaysTypeFilter';
import { usePublicHolidayColumns } from './usePublicHolidayColumns';

const rowId = (row: PublicHoliday): string => row.id;

/**
 * The list itself — the **third** consumer of the shared `DataTable`, and the
 * first with two filters and a date column.
 *
 * It is `DepartmentsTable` with the names changed and the filter slot filled
 * twice. That is the result the two features before it were for: no sorting, no
 * pagination, no responsiveness and no search debouncing are re-implemented
 * here, because none of them live in a feature — they live in `DataTable`,
 * `useDataTableState` and the query key. Nothing in the shared table needed
 * changing to render dates either; a date is a cell like any other, and the
 * formatting decisions belong to `PublicHolidaySpan`.
 *
 * ## Everything the table does happens on the server
 *
 * `useDataTableState` holds the page, the page size, the sort column and
 * direction, the search term and the filters as one object; that object is
 * turned into this endpoint's query and put in the TanStack Query key. So
 * sorting a column is a request for the sorted page rather than a re-ordering
 * of the twenty rows on screen, searching is a `?search=` rather than an
 * `Array.filter`, filtering by type is a `?type=`, and page 3 is a cache entry
 * of its own.
 *
 * `useDataTableTransition` is what makes the pairing with `useSuspenseQuery`
 * behave: without it every page change would blank the table back to its
 * skeleton. With it, the current rows stay while the next page loads and the
 * toolbar shows a small spinner.
 *
 * ## Two filters, because the endpoint accepts exactly two
 *
 * `PublicHolidayQueryDto` takes `search`, `type` and `isNational` — and nothing
 * else, which the generated `PublicHolidaysQuery` confirms. Inventing a third
 * would not quietly do nothing, it would be a `400`, because the global
 * `ValidationPipe` runs with `forbidNonWhitelisted`. See
 * `toPublicHolidaysQuery`.
 *
 * That is also why `isFiltered` below tests all three ways of narrowing the
 * list rather than only the search term: any of them can produce an empty page
 * that must not be mistaken for an unconfigured calendar.
 *
 * ## Two kinds of "nothing here"
 *
 * An unconfigured list gets `PublicHolidaysEmptyState` in place of the table. A
 * search or filter that matches nothing keeps the table and says so inside it,
 * because the controls that produced the empty result are the way out of it.
 * They are distinguished by whether anything was asked for, not by the count.
 */
export const PublicHolidaysTable = () => {
  const { t } = useTranslation();
  const { state, actions: baseActions } = useDataTableState({
    sortBy: DEFAULT_PUBLIC_HOLIDAY_SORT,
  });
  const { actions, isPending } = useDataTableTransition(baseActions);
  const { items, meta } = useSuspensePublicHolidays(state);

  /*
   * Deleting the last row of a page leaves the table standing on a page the
   * result set no longer has. The backend answers that with an empty page
   * rather than an error — an empty screen that reads as "no holidays" and is
   * not — so the list steps back one page instead. `useDataTableState` handles
   * the same hazard for every other control; this is the one case it cannot
   * see, because it does not know a row was removed.
   */
  const onDeleted = useCallback(() => {
    if (items.length === 1 && state.page > 1) actions.setPage(state.page - 1);
  }, [items.length, state.page, actions]);

  const columns = usePublicHolidayColumns({ onDeleted });

  const isFiltered =
    state.search.trim() !== '' ||
    state.filters[TYPE_FILTER] !== undefined ||
    state.filters[IS_NATIONAL_FILTER] !== undefined;

  if (meta.total === 0 && !isFiltered) return <PublicHolidaysEmptyState />;

  return (
    <Card>
      <CardContent>
        <DataTable
          columns={columns}
          data={items}
          meta={meta}
          state={state}
          actions={actions}
          getRowId={rowId}
          isFetching={isPending}
          searchPlaceholder={t('publicHolidays.searchPlaceholder')}
          emptyMessage={t('publicHolidays.noResults')}
          filters={
            <>
              <PublicHolidaysTypeFilter
                value={state.filters[TYPE_FILTER]}
                onChange={(value) => actions.setFilter(TYPE_FILTER, value)}
              />
              <PublicHolidaysScopeFilter
                value={state.filters[IS_NATIONAL_FILTER]}
                onChange={(value) => actions.setFilter(IS_NATIONAL_FILTER, value)}
              />
            </>
          }
        />
      </CardContent>
    </Card>
  );
};
