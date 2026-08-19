import type { RowData } from '@tanstack/react-table';
import { SlidersHorizontalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
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
 *
 * ## The label must be inside the group
 *
 * `DropdownMenuLabel` is Base UI's `Menu.GroupLabel`, and it **throws** —
 * "MenuGroupContext is missing" — when it is not under a `Menu.Group` or a
 * `Menu.RadioGroup`. Radix allowed a bare label, so a menu copied from shadcn's
 * documentation compiles, renders, and then crashes the first time somebody
 * opens it: the popup is portalled in on open, so nothing evaluates until then.
 * `WorkspaceSwitcher` hit this in F05 and wrote the same note.
 *
 * The grouping is also the correct markup rather than a workaround — the label
 * ends up as the group's `aria-labelledby`, which is what `GroupLabel` is for.
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('table.columns')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/*
           * `getCanHide()` is what keeps a row-actions column — or anything else
           * a screen marks `enableHiding: false` — out of a menu that could
           * otherwise hide the only way to act on a row. The label falls back to
           * the column id, so a column that forgot its `meta.label` is listed
           * under an ugly name rather than as a blank line.
           */}
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
