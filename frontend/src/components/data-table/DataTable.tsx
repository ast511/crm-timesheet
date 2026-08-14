import {
  FlexRender,
  useTable,
  type ReactTable,
  type RowData,
} from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { PaginationMeta } from '@/api/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { DataTableCards } from './DataTableCards';
import { DataTablePagination } from './DataTablePagination';
import { DataTableToolbar } from './DataTableToolbar';
import {
  dataTableFeatures,
  type DataTableActions,
  type DataTableColumnDef,
  type DataTableFeatures,
  type DataTableState,
} from './data-table.types';

/** The table instance the sub-components receive. */
export type DataTableInstance<TData extends RowData> = ReactTable<DataTableFeatures, TData>;

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumnDef<TData>[];
  /** The current page of rows, exactly as the API returned it. */
  data: TData[];
  /** The backend's `meta`; every pagination control is rendered from it. */
  meta: PaginationMeta;
  state: DataTableState;
  actions: DataTableActions;
  /** Stable row identity. Without it TanStack falls back to the row index. */
  getRowId?: (row: TData) => string;
  /** `true` while a background refetch is in flight — shows a small spinner. */
  isFetching?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /**
   * Endpoint-specific column filters, rendered into the toolbar.
   *
   * A slot rather than a configuration object, because every list endpoint
   * accepts a different set: a status `Select` here, a date range there. The
   * screen renders its own controls and writes through `actions.setFilter`,
   * which keeps the filter *values* in one place (`state.filters`, and
   * therefore in the query key) without this component having to know what any
   * of them mean.
   */
  filters?: ReactNode;
}

/**
 * The one table in this application.
 *
 * ## Server-side, always
 *
 * Search, filters, sorting and pagination are query parameters, not array
 * operations. `data` is one page, `meta` describes the whole result set, and
 * every control writes into `state` — which the screen puts in its TanStack
 * Query key, so changing a page fetches that page and caches it. This is what
 * makes the employee list and the timesheet report behave the same way at fifty
 * rows and at fifty thousand.
 *
 * ## One instance, two presentations
 *
 * From `lg` up it renders a table. Below `lg` it renders the same rows as
 * cards — same `table` instance, same cell templates, same server query, chosen
 * by breakpoint rather than by a second code path. Tabular data must never
 * force horizontal scrolling on a phone.
 *
 * The toolbar and the pagination sit outside that switch and are shared, with
 * one deliberate exception: column visibility is desktop-only, because a card
 * list has no columns to hide. Sorting moves from the column headers into a
 * menu instead of disappearing.
 *
 * ```tsx
 * const { state, actions } = useDataTableState({ sortBy: 'name' });
 * const { data } = useSuspenseQuery({
 *   queryKey: ['departments', state],
 *   queryFn: ({ signal }) =>
 *     apiGet('/api/v1/departments', { query: toQueryParams(state), signal }),
 * });
 *
 * <DataTable
 *   columns={columns}
 *   data={data.items}
 *   meta={data.meta}
 *   state={state}
 *   actions={actions}
 *   getRowId={(row) => row.id}
 * />
 * ```
 */
export const DataTable = <TData extends RowData>({
  columns,
  data,
  meta,
  state,
  actions,
  getRowId,
  isFetching,
  searchPlaceholder,
  emptyMessage,
  filters,
}: DataTableProps<TData>) => {
  const { t } = useTranslation();

  const table = useTable<DataTableFeatures, TData>(
    useMemo(
      () => ({
        features: dataTableFeatures,
        columns,
        data,
        ...(getRowId ? { getRowId } : {}),
      }),
      [columns, data, getRowId],
    ),
  );

  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar
        table={table}
        state={state}
        actions={actions}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        isFetching={isFetching}
      />

      {/* Desktop: the real table. */}
      <div className="hidden overflow-hidden rounded-lg border lg:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortKey = header.column.columnDef.meta?.sortKey;
                  const isSorted = sortKey !== undefined && state.sortBy === sortKey;

                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        isSorted
                          ? state.sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : sortKey === undefined ? (
                        <FlexRender header={header} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => actions.toggleSort(sortKey)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                            isSorted ? 'text-foreground' : 'hover:text-foreground',
                          )}
                        >
                          <FlexRender header={header} />
                          {isSorted ? (
                            state.sortOrder === 'asc' ? (
                              <ArrowUpIcon aria-hidden="true" className="size-3.5" />
                            ) : (
                              <ArrowDownIcon aria-hidden="true" className="size-3.5" />
                            )
                          ) : null}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage ?? t('table.noResults')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile and tablet: the same rows as cards. */}
      <div className="lg:hidden">
        <DataTableCards table={table} emptyMessage={emptyMessage} />
      </div>

      <DataTablePagination meta={meta} actions={actions} />
    </div>
  );
};
