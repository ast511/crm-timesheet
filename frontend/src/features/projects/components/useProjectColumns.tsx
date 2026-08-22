import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataTableColumnDef } from '@/components/data-table/data-table.types';

import type { Project, ProjectSortKey } from '../projects-api';
import { ProjectArchivedBadge, ProjectPriorityBadge, ProjectStatusBadge } from './ProjectBadges';
import { ProjectEstimate } from './ProjectEstimate';
import { ProjectPeriod } from './ProjectPeriod';
import { ProjectRowActions } from './ProjectRowActions';
import { ProjectSwatch } from './ProjectSwatch';

export interface UseProjectColumnsOptions {
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
const sortKey = (key: ProjectSortKey): string => key;

/**
 * The columns of the projects table — the widest list in the application so
 * far, and the first with two enum badges, a colour and a date range in one
 * row.
 *
 * ## `sortKey` is the contract, and its absence is a decision
 *
 * A column carrying a `sortKey` gets a clickable header on desktop and an entry
 * in the sort menu on mobile; a column without one is simply not sortable. The
 * five keys used here are typed as {@link ProjectSortKey}, read off the
 * generated query — so a column can only offer a sort the backend actually
 * accepts, and a column removed from `PROJECT_SORT_FIELDS` stops compiling here
 * rather than answering `400` on the first click.
 *
 * **`projectStatus` and `projectPriority` deliberately carry none, and the
 * backend agrees** — `PROJECT_SORT_FIELDS` has six entries and neither is among
 * them. The constants file even says the two *could* be ordered, since a
 * PostgreSQL enum sorts by declaration order, and that the feature chose not
 * to. This screen has the better reason to agree: ordering a list by a
 * four-valued column groups it rather than sorts it, and both of those columns
 * have a **filter** instead, which is the control somebody actually wants when
 * they ask "show me what is on hold".
 *
 * **`createdAt` is the sixth key the API accepts and is still not offered** —
 * the same deferral F06 through F09 made, for the same reason. Rendering an
 * instant needs the company timezone from `GET /api/v1/work-schedule`, which
 * nothing reads yet, and `CLAUDE.md` requires every timestamp in that zone
 * rather than the browser's. A date this application cannot format correctly is
 * worse than one it does not show, and a sort header over a column nobody can
 * see would sort by an invisible value. It lands in *Future Improvements*
 * again.
 *
 * That deferral does **not** touch *Perioadă*: `startDate` and `endDate` are
 * calendar dates rather than instants, so they need no zone at all, which is
 * why this page can sort by `startDate` while `createdAt` waits. The
 * distinction is argued in `lib/datetime.ts` and applied in `ProjectPeriod`.
 *
 * ## Two facts share the *Cod* and *Denumire* cells
 *
 * The colour swatch rides in the *Cod* cell and the archived badge in
 * *Denumire*, rather than each taking a column of its own. Both are properties
 * of the project's identity rather than separate values to compare down a
 * column: a swatch column would be a strip of colour with an empty header, and
 * an *Arhivat* column would print a badge on the few archived rows and nothing
 * on the rest — for which there is already a filter. It also keeps the table at
 * seven columns, which is what fits before the horizontal scroll the
 * responsive rules forbid.
 *
 * ## `meta.label` is not decoration
 *
 * Below `lg` the same cells are rendered as cards, and the label is the key of
 * each key/value pair — so a column without one would read as its own id on a
 * phone. It is also what the column-visibility menu lists.
 */
export const useProjectColumns = ({
  onDeleted,
}: UseProjectColumnsOptions): DataTableColumnDef<Project>[] => {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: t('projects.columns.code'),
        meta: { label: t('projects.columns.code'), sortKey: sortKey('code') },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <ProjectSwatch color={row.original.color} />
            <span className="font-mono text-xs font-medium">{row.original.code}</span>
          </span>
        ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('projects.columns.name'),
        meta: { label: t('projects.columns.name'), sortKey: sortKey('name') },
        cell: ({ row }) => (
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.original.name}</span>
              <ProjectArchivedBadge isArchived={row.original.isArchived} />
            </span>
            {row.original.description !== null && (
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {row.original.description}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'clientName',
        accessorKey: 'clientName',
        header: t('projects.columns.clientName'),
        meta: { label: t('projects.columns.clientName'), sortKey: sortKey('clientName') },
        cell: ({ row }) => row.original.clientName,
      },
      {
        id: 'projectStatus',
        accessorKey: 'projectStatus',
        header: t('projects.columns.status'),
        meta: { label: t('projects.columns.status') },
        cell: ({ row }) => <ProjectStatusBadge status={row.original.projectStatus} />,
      },
      {
        id: 'projectPriority',
        accessorKey: 'projectPriority',
        header: t('projects.columns.priority'),
        meta: { label: t('projects.columns.priority') },
        cell: ({ row }) => <ProjectPriorityBadge priority={row.original.projectPriority} />,
      },
      {
        id: 'estimatedHours',
        accessorKey: 'estimatedHours',
        header: t('projects.columns.estimatedHours'),
        meta: {
          label: t('projects.columns.estimatedHours'),
          sortKey: sortKey('estimatedHours'),
        },
        cell: ({ row }) => <ProjectEstimate estimatedHours={row.original.estimatedHours} />,
      },
      {
        /*
         * `startDate` is the accessor and the sort key, but the cell renders
         * the whole span — the two ends are one fact, and an `endDate` column
         * of its own would be a second, mostly empty date beside the first.
         * Sorting by the start of a span is what a schedule means by date
         * order, and it is the key the backend offers.
         */
        id: 'startDate',
        accessorKey: 'startDate',
        header: t('projects.columns.period'),
        meta: { label: t('projects.columns.period'), sortKey: sortKey('startDate') },
        cell: ({ row }) => (
          <ProjectPeriod startDate={row.original.startDate} endDate={row.original.endDate} />
        ),
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
        header: () => <span className="sr-only">{t('projects.columns.actions')}</span>,
        meta: { label: t('projects.columns.actions'), hideOnCard: true },
        cell: ({ row }) => <ProjectRowActions project={row.original} onDeleted={onDeleted} />,
      },
    ],
    [t, onDeleted],
  );
};
