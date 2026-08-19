import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/data-table/DataTable';
import { useDataTableState } from '@/components/data-table/useDataTableState';
import { useDataTableTransition } from '@/components/data-table/useDataTableTransition';
import { Card, CardContent } from '@/components/ui/card';

import { DEFAULT_LEAVE_TYPE_SORT, IS_ACTIVE_FILTER, type LeaveType } from '../leave-types-api';
import { useSuspenseLeaveTypes } from '../useLeaveTypes';
import { LeaveTypesActiveFilter } from './LeaveTypesActiveFilter';
import { LeaveTypesEmptyState } from './LeaveTypesEmptyState';
import { useLeaveTypeColumns } from './useLeaveTypeColumns';

const rowId = (row: LeaveType): string => row.id;

/**
 * The list itself — **the first real consumer of the shared `DataTable`**, and
 * therefore the shape every later list page should take.
 *
 * ## Everything the table does happens on the server
 *
 * `useDataTableState` holds the page, the page size, the sort column and
 * direction, the search term and the filters as one object; that object is
 * turned into this endpoint's query and put in the TanStack Query key. So
 * sorting a column is a request for the sorted page rather than a re-ordering
 * of the twenty rows on screen, searching is a `?search=` rather than an
 * `Array.filter`, and page 3 is a cache entry of its own. None of that is
 * re-implemented here — it is what wiring the state into the key *is*.
 *
 * `useDataTableTransition` is the piece that makes the pairing with
 * `useSuspenseQuery` behave: without it every page change would blank the table
 * back to its skeleton. With it, the current rows stay while the next page
 * loads and the toolbar shows a small spinner.
 *
 * ## Two kinds of "nothing here"
 *
 * An unconfigured list gets `LeaveTypesEmptyState` in place of the table. A
 * search or filter that matches nothing keeps the table and says so inside it,
 * because the controls that produced the empty result are the way out of it.
 * They are distinguished by whether anything was asked for, not by the count.
 */
export const LeaveTypesTable = () => {
  const { t } = useTranslation();
  const { state, actions: baseActions } = useDataTableState({
    sortBy: DEFAULT_LEAVE_TYPE_SORT,
  });
  const { actions, isPending } = useDataTableTransition(baseActions);
  const { items, meta } = useSuspenseLeaveTypes(state);

  /*
   * Deleting the last row of a page leaves the table standing on a page the
   * result set no longer has. The backend answers that with an empty page
   * rather than an error — an empty screen that reads as "no leave types" and
   * is not — so the list steps back one page instead.
   */
  const onDeleted = useCallback(() => {
    if (items.length === 1 && state.page > 1) actions.setPage(state.page - 1);
  }, [items.length, state.page, actions]);

  const columns = useLeaveTypeColumns({ onDeleted });

  const isFiltered = state.search.trim() !== '' || state.filters[IS_ACTIVE_FILTER] !== undefined;

  if (meta.total === 0 && !isFiltered) return <LeaveTypesEmptyState />;

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
          searchPlaceholder={t('leaveTypes.searchPlaceholder')}
          emptyMessage={t('leaveTypes.noResults')}
          filters={
            <LeaveTypesActiveFilter
              value={state.filters[IS_ACTIVE_FILTER]}
              onChange={(value) => actions.setFilter(IS_ACTIVE_FILTER, value)}
            />
          }
        />
      </CardContent>
    </Card>
  );
};