import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataTableColumnDef } from '@/components/data-table/data-table.types';

import type { Department, DepartmentSortKey } from '../departments-api';
import { DepartmentActiveBadge } from './DepartmentBadges';
import { DepartmentRowActions } from './DepartmentRowActions';

export interface UseDepartmentColumnsOptions {
  /** Passed to each row's menu so the list can re-page after a removal. */
  onDeleted: () => void;
}

/**
 * Narrows a sort column to the enum the backend publishes.
 *
 * `DataTableColumnMeta.sortKey` is a plain `string` — it has to be, since the
 * shared table serves every resource — so this is where the endpoint's own type
 * is put back on it.
 */
const sortKey = (key: DepartmentSortKey): string => key;

/**
 * The columns of the departments table.
 *
 * ## `sortKey` is the contract, and its absence is a decision
 *
 * A column carrying a `sortKey` gets a clickable header on desktop and an entry
 * in the sort menu on mobile; a column without one is simply not sortable. The
 * two keys used here are typed as {@link DepartmentSortKey}, read off the
 * generated query — so a column can only offer a sort the backend actually
 * accepts, and a column removed from `DEPARTMENT_SORT_FIELDS` stops compiling
 * here rather than answering `400` on the first click.
 *
 * `description` and `isActive` deliberately carry none, and the backend agrees:
 * its `sortBy` enum has three entries rather than five. Ordering a list by a
 * two-valued column groups it rather than sorts it, and ordering it by free
 * prose sorts nothing anybody was looking for.
 *
 * **`createdAt` is the third key the API accepts and is not offered either** —
 * the same deferral, for the same reason, that F06 and F07 made. Rendering an
 * instant needs the company timezone from `GET /api/v1/work-schedule`, which
 * nothing reads yet, and `CLAUDE.md` requires every timestamp in that zone
 * rather than the browser's. A date this application cannot format correctly is
 * worse than one it does not show, and a sort header over a column nobody can
 * see would sort by an invisible value. It lands in *Future Improvements* again.
 *
 * ## `meta.label` is not decoration
 *
 * Below `lg` the same cells are rendered as cards, and the label is the key of
 * each key/value pair — so a column without one would read as its own id on a
 * phone. It is also what the column-visibility menu lists.
 */
export const useDepartmentColumns = ({
  onDeleted,
}: UseDepartmentColumnsOptions): DataTableColumnDef<Department>[] => {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: t('departments.columns.code'),
        meta: { label: t('departments.columns.code'), sortKey: sortKey('code') },
        /*
         * Mono, like the leave-type code beside it: a short natural key that
         * turns up in a URL, a CSV export and a spreadsheet reads as an
         * identifier rather than as a word when its characters line up.
         */
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium">{row.original.code}</span>
        ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('departments.columns.name'),
        meta: { label: t('departments.columns.name'), sortKey: sortKey('name') },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'description',
        accessorKey: 'description',
        header: t('departments.columns.description'),
        meta: { label: t('departments.columns.description') },
        /*
         * Clamped to two lines rather than truncated to a character count: the
         * column is 500 characters wide in the worst case, and a clamp adapts
         * to the actual column width instead of guessing at it. `null` is "no
         * description" and prints as a dash, so an empty cell is never mistaken
         * for a value that failed to load.
         */
        cell: ({ row }) =>
          row.original.description === null ? (
            <span className="text-muted-foreground">{t('departments.columns.noValue')}</span>
          ) : (
            <span className="line-clamp-2 text-sm text-muted-foreground">
              {row.original.description}
            </span>
          ),
      },
      {
        id: 'isActive',
        accessorKey: 'isActive',
        header: t('departments.columns.isActive'),
        meta: { label: t('departments.columns.isActive') },
        cell: ({ row }) => <DepartmentActiveBadge isActive={row.original.isActive} />,
      },
      {
        /*
         * A display column: no accessor, nothing to sort, and `hideOnCard` so
         * the card view renders the menu on its own line at the foot of the
         * card instead of as a key/value pair labelled "Acțiuni".
         *
         * `enableHiding: false` keeps it out of the column-visibility menu —
         * which reads `getCanHide()` — because hiding it would remove the only
         * way to edit or delete a row, from a menu offering to tidy the table.
         * The convention F07 established after a browser found it.
         */
        id: 'actions',
        enableHiding: false,
        header: () => <span className="sr-only">{t('departments.columns.actions')}</span>,
        meta: { label: t('departments.columns.actions'), hideOnCard: true },
        cell: ({ row }) => (
          <DepartmentRowActions department={row.original} onDeleted={onDeleted} />
        ),
      },
    ],
    [t, onDeleted],
  );
};
