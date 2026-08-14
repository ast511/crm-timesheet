import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { PaginationMeta } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { PAGE_SIZE_OPTIONS, type DataTableActions } from './data-table.types';

export interface DataTablePaginationProps {
  meta: PaginationMeta;
  actions: DataTableActions;
}

/**
 * Page-based controls, not infinite scroll.
 *
 * A person reconciling a month of timesheets needs to be able to say "page 4"
 * and get back to it, to know how many records there are, and to reach the end
 * of the list — none of which infinite scroll offers. Everything rendered here
 * comes from the backend's `meta`, so the controls describe the real result set
 * rather than what happens to be loaded.
 */
export const DataTablePagination = ({ meta, actions }: DataTablePaginationProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('table.totalRecords', { total: meta.total })} ·{' '}
        {t('table.pageOf', { page: meta.page, totalPages: Math.max(meta.totalPages, 1) })}
      </p>

      <div className="flex items-center gap-2">
        <label className="hidden text-sm text-muted-foreground sm:inline" htmlFor="page-size">
          {t('table.rowsPerPage')}
        </label>
        <Select
          value={String(meta.limit)}
          onValueChange={(value) => actions.setLimit(Number(value))}
        >
          <SelectTrigger id="page-size" size="sm" aria-label={t('table.rowsPerPage')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('table.previousPage')}
          disabled={!meta.hasPreviousPage}
          onClick={() => actions.setPage(meta.page - 1)}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('table.nextPage')}
          disabled={!meta.hasNextPage}
          onClick={() => actions.setPage(meta.page + 1)}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};
