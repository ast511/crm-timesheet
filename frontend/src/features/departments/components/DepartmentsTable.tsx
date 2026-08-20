import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/data-table/DataTable';
import { useDataTableState } from '@/components/data-table/useDataTableState';
import { useDataTableTransition } from '@/components/data-table/useDataTableTransition';
import { Card, CardContent } from '@/components/ui/card';

import { DEFAULT_DEPARTMENT_SORT, type Department } from '../departments-api';
import { useSuspenseDepartments } from '../useDepartments';
import { DepartmentsEmptyState } from './DepartmentsEmptyState';
import { useDepartmentColumns } from './useDepartmentColumns';

const rowId = (row: Department): string => row.id;

/**
 * The list itself — **the second consumer of the shared `DataTable`**, and the
 * check that F07's wiring is copyable rather than merely written down.
 *
 * It is `LeaveTypesTable` with the names changed and one control removed. That
 * is the result this feature was for: no sorting, no pagination, no
 * responsiveness and no search debouncing are re-implemented here, because none
 * of them live in a feature — they live in `DataTable`, `useDataTableState` and
 * the query key.
 *
 * ## Everything the table does happens on the server
 *
 * `useDataTableState` holds the page, the page size, the sort column and
 * direction and the search term as one object; that object is turned into this
 * endpoint's query and put in the TanStack Query key. So sorting a column is a
 * request for the sorted page rather than a re-ordering of the twenty rows on
 * screen, searching is a `?search=` rather than an `Array.filter`, and page 3 is
 * a cache entry of its own.
 *
 * `useDataTableTransition` is what makes the pairing with `useSuspenseQuery`
 * behave: without it every page change would blank the table back to its
 * skeleton. With it, the current rows stay while the next page loads and the
 * toolbar shows a small spinner.
 *
 * ## No filter slot, because the endpoint has no filters
 *
 * `LeaveTypesTable` passes a `filters` node holding an `?isActive=` select.
 * `DepartmentQueryDto` accepts `search`, `sortBy`, `sortOrder`, `page` and
 * `limit` and **nothing else**, so there is no control to render — and inventing
 * one would not quietly do nothing, it would be a `400`, because the global
 * `ValidationPipe` runs with `forbidNonWhitelisted`. See `toDepartmentsQuery`.
 *
 * That is also why `isFiltered` below tests the search term alone rather than
 * the search term *or* a filter: there is only one way to narrow this list.
 *
 * ## Two kinds of "nothing here"
 *
 * An unconfigured list gets `DepartmentsEmptyState` in place of the table. A
 * search that matches nothing keeps the table and says so inside it, because the
 * term still in the box is the way out of it. They are distinguished by whether
 * anything was asked for, not by the count.
 */
export const DepartmentsTable = () => {
  const { t } = useTranslation();
  const { state, actions: baseActions } = useDataTableState({
    sortBy: DEFAULT_DEPARTMENT_SORT,
  });
  const { actions, isPending } = useDataTableTransition(baseActions);
  const { items, meta } = useSuspenseDepartments(state);

  /*
   * Deleting the last row of a page leaves the table standing on a page the
   * result set no longer has. The backend answers that with an empty page
   * rather than an error — an empty screen that reads as "no departments" and
   * is not — so the list steps back one page instead. `useDataTableState`
   * handles the same hazard for every other control; this is the one case it
   * cannot see, because it does not know a row was removed.
   */
  const onDeleted = useCallback(() => {
    if (items.length === 1 && state.page > 1) actions.setPage(state.page - 1);
  }, [items.length, state.page, actions]);

  const columns = useDepartmentColumns({ onDeleted });

  const isFiltered = state.search.trim() !== '';

  if (meta.total === 0 && !isFiltered) return <DepartmentsEmptyState />;

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
          searchPlaceholder={t('departments.searchPlaceholder')}
          emptyMessage={t('departments.noResults')}
        />
      </CardContent>
    </Card>
  );
};
