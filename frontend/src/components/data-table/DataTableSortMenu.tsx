import type { RowData } from '@tanstack/react-table';
import { ArrowDownAZIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { DataTableInstance } from './DataTable';
import type { DataTableActions, DataTableState } from './data-table.types';

export interface DataTableSortMenuProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  state: DataTableState;
  actions: DataTableActions;
}

/**
 * Sorting for the card view.
 *
 * On a table the sort control is the column header, which is exactly the thing
 * the card view does not have. Dropping sorting below `lg` would leave a phone
 * able to search and page through a list but not order it, so the same
 * `toggleSort` gets a menu of its own — choosing the current column again flips
 * the direction, matching what clicking a header twice does.
 *
 * Only columns that declare a `sortKey` appear: the backend accepts a fixed set
 * of sort columns and offering one it will reject is worse than offering none.
 */
export const DataTableSortMenu = <TData extends RowData>({
  table,
  state,
  actions,
}: DataTableSortMenuProps<TData>) => {
  const { t } = useTranslation();

  const sortableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.columnDef.meta?.sortKey !== undefined);

  if (sortableColumns.length === 0) return null;

  const direction = state.sortOrder === 'asc' ? t('table.sortAscending') : t('table.sortDescending');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <ArrowDownAZIcon aria-hidden="true" />
            {t('table.sort')}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {t('table.sort')} — {direction}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={state.sortBy}
          onValueChange={(value) => actions.toggleSort(String(value))}
        >
          {sortableColumns.map((column) => (
            <DropdownMenuRadioItem key={column.id} value={column.columnDef.meta?.sortKey ?? ''}>
              {column.columnDef.meta?.label ?? column.id}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
