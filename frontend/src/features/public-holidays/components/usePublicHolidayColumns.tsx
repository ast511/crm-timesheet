import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataTableColumnDef } from '@/components/data-table/data-table.types';

import type { PublicHoliday, PublicHolidaySortKey } from '../public-holidays-api';
import {
  PublicHolidayScopeBadge,
  PublicHolidayTypeBadge,
  PublicHolidayValidity,
} from './PublicHolidayBadges';
import { PublicHolidayRowActions } from './PublicHolidayRowActions';
import { PublicHolidaySpan } from './PublicHolidaySpan';

export interface UsePublicHolidayColumnsOptions {
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
const sortKey = (key: PublicHolidaySortKey): string => key;

/**
 * The columns of the public-holidays table.
 *
 * ## `sortKey` is the contract, and its absence is a decision
 *
 * A column carrying a `sortKey` gets a clickable header on desktop and an entry
 * in the sort menu on mobile; a column without one is simply not sortable. The
 * two keys used here are typed as {@link PublicHolidaySortKey}, read off the
 * generated query — so a column can only offer a sort the backend actually
 * accepts, and a column removed from `PUBLIC_HOLIDAY_SORT_FIELDS` stops
 * compiling here rather than answering `400` on the first click.
 *
 * `type`, `validity` and `isNational` deliberately carry none, and the backend
 * agrees: its `sortBy` enum has three entries rather than five. Ordering a list
 * by a two-valued column groups it rather than sorts it — and both of those
 * columns have a *filter* instead, which is the control somebody actually wants
 * when they ask "show me only the national ones".
 *
 * **`createdAt` is the third key the API accepts and is not offered** — the
 * same deferral, for the same reason, that F06, F07 and F08 made. Rendering an
 * instant needs the company timezone from `GET /api/v1/work-schedule`, which
 * nothing reads yet, and `CLAUDE.md` requires every timestamp in that zone
 * rather than the browser's. A date this application cannot format correctly is
 * worse than one it does not show, and a sort header over a column nobody can
 * see would sort by an invisible value. It lands in *Future Improvements*
 * again.
 *
 * Note that this deferral does **not** touch *Dată*: `startDate` and `endDate`
 * are calendar dates rather than instants, so they need no zone at all — which
 * is exactly why this page can show a date column at all while the three before
 * it could not. The distinction is argued in `lib/datetime.ts` and applied in
 * `PublicHolidaySpan`.
 *
 * ## `meta.label` is not decoration
 *
 * Below `lg` the same cells are rendered as cards, and the label is the key of
 * each key/value pair — so a column without one would read as its own id on a
 * phone. It is also what the column-visibility menu lists.
 */
export const usePublicHolidayColumns = ({
  onDeleted,
}: UsePublicHolidayColumnsOptions): DataTableColumnDef<PublicHoliday>[] => {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: t('publicHolidays.columns.name'),
        meta: { label: t('publicHolidays.columns.name'), sortKey: sortKey('name') },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'type',
        accessorKey: 'type',
        header: t('publicHolidays.columns.type'),
        meta: { label: t('publicHolidays.columns.type') },
        cell: ({ row }) => <PublicHolidayTypeBadge type={row.original.type} />,
      },
      {
        /*
         * `startDate` is the accessor and the sort key, but the cell renders
         * the whole span — the two ends are one fact, and a `endDate` column of
         * its own would be a second, mostly identical date beside the first.
         * Sorting by the start of a span is what a calendar means by date
         * order.
         */
        id: 'startDate',
        accessorKey: 'startDate',
        header: t('publicHolidays.columns.date'),
        meta: { label: t('publicHolidays.columns.date'), sortKey: sortKey('startDate') },
        cell: ({ row }) => (
          <PublicHolidaySpan
            type={row.original.type}
            startDate={row.original.startDate}
            endDate={row.original.endDate}
          />
        ),
      },
      {
        /*
         * A display column over two fields, so no `accessorKey`: the validity
         * range is `validFromYear` and `validToYear` read together, and either
         * on its own means nothing.
         */
        id: 'validity',
        header: t('publicHolidays.columns.validity'),
        meta: { label: t('publicHolidays.columns.validity') },
        cell: ({ row }) => (
          <PublicHolidayValidity
            type={row.original.type}
            validFromYear={row.original.validFromYear}
            validToYear={row.original.validToYear}
          />
        ),
      },
      {
        id: 'isNational',
        accessorKey: 'isNational',
        header: t('publicHolidays.columns.isNational'),
        meta: { label: t('publicHolidays.columns.isNational') },
        cell: ({ row }) => <PublicHolidayScopeBadge isNational={row.original.isNational} />,
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
        header: () => <span className="sr-only">{t('publicHolidays.columns.actions')}</span>,
        meta: { label: t('publicHolidays.columns.actions'), hideOnCard: true },
        cell: ({ row }) => (
          <PublicHolidayRowActions holiday={row.original} onDeleted={onDeleted} />
        ),
      },
    ],
    [t, onDeleted],
  );
};
