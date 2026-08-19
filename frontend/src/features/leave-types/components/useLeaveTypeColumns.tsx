import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataTableColumnDef } from '@/components/data-table/data-table.types';

import type { LeaveType, LeaveTypeSortKey } from '../leave-types-api';
import {
  LeaveTypeActiveBadge,
  LeaveTypeApprovalBadge,
  LeaveTypeCarryOver,
  LeaveTypePaidBadge,
} from './LeaveTypeBadges';
import { LeaveTypeGlyph } from './LeaveTypeGlyph';
import { LeaveTypeRowActions } from './LeaveTypeRowActions';

export interface UseLeaveTypeColumnsOptions {
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
const sortKey = (key: LeaveTypeSortKey): string => key;

/**
 * The columns of the leave-types table.
 *
 * ## `sortKey` is the contract, and its absence is a decision
 *
 * A column carrying a `sortKey` gets a clickable header on desktop and an entry
 * in the sort menu on mobile; a column without one is simply not sortable. The
 * three keys used here are typed as {@link LeaveTypeSortKey}, which is read off
 * the generated query — so a column can only offer a sort the backend actually
 * accepts, and a column removed from the backend's enum stops compiling here
 * rather than answering `400` on the first click.
 *
 * The five boolean and derived columns deliberately have none. Ordering a list
 * by a two-valued column groups it rather than sorts it, which the `?isActive=`
 * filter already does and does better. `createdAt` is sortable on the API and
 * is not offered either: rendering an instant requires the company timezone
 * (`GET /work-schedule`), which no feature reads yet, and a date column this
 * application cannot format correctly is worse than one it does not show.
 *
 * ## `meta.label` is not decoration
 *
 * Below `lg` the same cells are rendered as cards, and the label is the key of
 * each key/value pair — so a column without one would read as its own id on a
 * phone. It is also what the column-visibility menu lists.
 */
export const useLeaveTypeColumns = ({
  onDeleted,
}: UseLeaveTypeColumnsOptions): DataTableColumnDef<LeaveType>[] => {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: t('leaveTypes.columns.code'),
        meta: { label: t('leaveTypes.columns.code'), sortKey: sortKey('code') },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <LeaveTypeGlyph icon={row.original.icon} color={row.original.color} />
            <span className="font-mono text-xs font-medium">{row.original.code}</span>
          </span>
        ),
      },
      {
        id: 'label',
        accessorKey: 'label',
        header: t('leaveTypes.columns.label'),
        meta: { label: t('leaveTypes.columns.label'), sortKey: sortKey('label') },
        cell: ({ row }) => (
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{row.original.label}</span>
            {row.original.description !== null && (
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {row.original.description}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'reportMarker',
        accessorKey: 'reportMarker',
        header: t('leaveTypes.columns.reportMarker'),
        meta: { label: t('leaveTypes.columns.reportMarker') },
        cell: ({ row }) => (
          <span className="inline-flex min-w-7 justify-center rounded-md border px-1.5 py-0.5 font-mono text-xs">
            {row.original.reportMarker}
          </span>
        ),
      },
      {
        id: 'defaultAllocatedDays',
        accessorKey: 'defaultAllocatedDays',
        header: t('leaveTypes.columns.defaultAllocatedDays'),
        meta: {
          label: t('leaveTypes.columns.defaultAllocatedDays'),
          sortKey: sortKey('defaultAllocatedDays'),
        },
        /*
         * `null` is "this type suggests nothing" — medical leave granted
         * against a certificate — which is a different statement from a
         * suggestion of zero days, so it prints as a dash rather than as `0`.
         */
        cell: ({ row }) =>
          row.original.defaultAllocatedDays === null ? (
            <span className="text-muted-foreground">{t('leaveTypes.columns.noValue')}</span>
          ) : (
            t('leaveTypes.columns.days', { days: row.original.defaultAllocatedDays })
          ),
      },
      {
        id: 'allowsCarryOver',
        accessorKey: 'allowsCarryOver',
        header: t('leaveTypes.columns.carryOver'),
        meta: { label: t('leaveTypes.columns.carryOver') },
        cell: ({ row }) => (
          <LeaveTypeCarryOver
            allowsCarryOver={row.original.allowsCarryOver}
            maxCarryOverDays={row.original.maxCarryOverDays}
          />
        ),
      },
      {
        id: 'isPaid',
        accessorKey: 'isPaid',
        header: t('leaveTypes.columns.isPaid'),
        meta: { label: t('leaveTypes.columns.isPaid') },
        cell: ({ row }) => <LeaveTypePaidBadge isPaid={row.original.isPaid} />,
      },
      {
        id: 'requiresApproval',
        accessorKey: 'requiresApproval',
        header: t('leaveTypes.columns.requiresApproval'),
        meta: { label: t('leaveTypes.columns.requiresApproval') },
        cell: ({ row }) => (
          <LeaveTypeApprovalBadge requiresApproval={row.original.requiresApproval} />
        ),
      },
      {
        id: 'isActive',
        accessorKey: 'isActive',
        header: t('leaveTypes.columns.isActive'),
        meta: { label: t('leaveTypes.columns.isActive') },
        cell: ({ row }) => <LeaveTypeActiveBadge isActive={row.original.isActive} />,
      },
      {
        /*
         * A display column: no accessor, nothing to sort, and `hideOnCard` so
         * the card view renders the menu on its own line at the foot of the
         * card instead of as a key/value pair labelled "Actions".
         *
         * `enableHiding: false` keeps it out of the column-visibility menu —
         * which reads `getCanHide()` — because hiding it would remove the only
         * way to edit or delete a row, from a menu offering to tidy the table.
         */
        id: 'actions',
        enableHiding: false,
        header: () => <span className="sr-only">{t('leaveTypes.columns.actions')}</span>,
        meta: { label: t('leaveTypes.columns.actions'), hideOnCard: true },
        cell: ({ row }) => <LeaveTypeRowActions leaveType={row.original} onDeleted={onDeleted} />,
      },
    ],
    [t, onDeleted],
  );
};