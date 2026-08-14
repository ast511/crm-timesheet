import { FlexRender, type RowData } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';

import type { DataTableInstance } from './DataTable';

export interface DataTableCardsProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  emptyMessage?: string;
}

/**
 * The card presentation of the same rows — one card per row, each cell a
 * labelled key/value pair.
 *
 * This is not a second data source and not a second set of column definitions.
 * It walks the very same `table` instance and renders each cell through
 * `FlexRender` with the same `cell` template the table uses, which is what
 * guarantees that a column formatted one way on desktop is formatted that way
 * on a phone. The label is the column's `meta.label`.
 *
 * Actions come along for free for the same reason: a row-actions column renders
 * its buttons here exactly as it does in a table row. Such a column normally
 * sets `meta.hideOnCard` so it is dropped from the key/value list, and is then
 * rendered on its own line below.
 */
export const DataTableCards = <TData extends RowData>({
  table,
  emptyMessage,
}: DataTableCardsProps<TData>) => {
  const { t } = useTranslation();
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyMessage ?? t('table.noResults')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const cells = row.getVisibleCells();
        const fieldCells = cells.filter((cell) => cell.column.columnDef.meta?.hideOnCard !== true);
        const actionCells = cells.filter((cell) => cell.column.columnDef.meta?.hideOnCard === true);

        return (
          <li key={row.id}>
            <Card>
              <CardContent className="flex flex-col gap-2">
                <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
                  {fieldCells.map((cell) => (
                    <div key={cell.id} className="contents">
                      <dt className="text-muted-foreground">
                        {cell.column.columnDef.meta?.label ?? cell.column.id}
                      </dt>
                      <dd className="min-w-0 break-words">
                        <FlexRender cell={cell} />
                      </dd>
                    </div>
                  ))}
                </dl>
                {actionCells.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2">
                    {actionCells.map((cell) => (
                      <FlexRender key={cell.id} cell={cell} />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
};
