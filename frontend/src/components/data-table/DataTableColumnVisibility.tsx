import type { RowData } from '@tanstack/react-table';
import { SlidersHorizontalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { DataTableInstance } from './DataTable';

export interface DataTableColumnVisibilityProps<TData extends RowData> {
  table: DataTableInstance<TData>;
}

/**
 * Show/hide columns.
 *
 * Rendered only from `lg` upwards, because below that the data is a list of
 * cards and there are no columns to hide — see the responsive note on
 * `DataTable`.
 */
export const DataTableColumnVisibility = <TData extends RowData>({
  table,
}: DataTableColumnVisibilityProps<TData>) => {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <SlidersHorizontalIcon aria-hidden="true" />
            {t('table.columns')}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('table.columns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => column.toggleVisibility(checked)}
            >
              {column.columnDef.meta?.label ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
