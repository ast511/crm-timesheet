import type { RowData } from '@tanstack/react-table';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import type { DataTableInstance } from './DataTable';
import { DataTableColumnVisibility } from './DataTableColumnVisibility';
import { DataTableSortMenu } from './DataTableSortMenu';
import { SEARCH_DEBOUNCE_MS, type DataTableActions, type DataTableState } from './data-table.types';

export interface DataTableToolbarProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  state: DataTableState;
  actions: DataTableActions;
  searchPlaceholder?: string;
  /** Endpoint-specific column filters. See the note on `DataTable`. */
  filters?: ReactNode;
  isFetching?: boolean;
}

/**
 * Search, filters, sort and column visibility — the controls that sit above the
 * rows in both presentations.
 *
 * The search box keeps its own immediate state and pushes the **debounced**
 * value up, so typing stays responsive while the server sees one request per
 * pause rather than one per keystroke.
 */
export const DataTableToolbar = <TData extends RowData>({
  table,
  state,
  actions,
  searchPlaceholder,
  filters,
  isFetching,
}: DataTableToolbarProps<TData>) => {
  const { t } = useTranslation();
  const [term, setTerm] = useState(state.search);
  const debouncedTerm = useDebouncedValue(term, SEARCH_DEBOUNCE_MS);
  const { setSearch } = actions;

  useEffect(() => {
    setSearch(debouncedTerm);
  }, [debouncedTerm, setSearch]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={searchPlaceholder ?? t('table.search')}
          aria-label={searchPlaceholder ?? t('table.search')}
          className="pl-8"
        />
        {isFetching ? (
          <Spinner size="sm" className="absolute top-1/2 right-2.5 -translate-y-1/2" />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters}
        {/* Sorting lives in the column headers from `lg` up, and in this menu below it. */}
        <div className="lg:hidden">
          <DataTableSortMenu table={table} state={state} actions={actions} />
        </div>
        {/* No columns in card view, so no column-visibility control below `lg`. */}
        <div className="hidden lg:block">
          <DataTableColumnVisibility table={table} />
        </div>
      </div>
    </div>
  );
};
