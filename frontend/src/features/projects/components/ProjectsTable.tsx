import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/data-table/DataTable';
import { useDataTableState } from '@/components/data-table/useDataTableState';
import { useDataTableTransition } from '@/components/data-table/useDataTableTransition';
import { Card, CardContent } from '@/components/ui/card';

import {
  DEFAULT_PROJECT_SORT,
  IS_ARCHIVED_FILTER,
  PROJECT_PRIORITY_FILTER,
  PROJECT_STATUS_FILTER,
  type Project,
} from '../projects-api';
import { useSuspenseProjects } from '../useProjects';
import { ProjectsArchivedFilter } from './ProjectsArchivedFilter';
import { ProjectsEmptyState } from './ProjectsEmptyState';
import { ProjectsPriorityFilter } from './ProjectsPriorityFilter';
import { ProjectsStatusFilter } from './ProjectsStatusFilter';
import { useProjectColumns } from './useProjectColumns';

const rowId = (row: Project): string => row.id;

/**
 * The list itself — the **fourth** consumer of the shared `DataTable`, and the
 * first with three filters.
 *
 * It is `PublicHolidaysTable` with the names changed and one more control in
 * the filter slot. That is the result the three features before it were for: no
 * sorting, no pagination, no responsiveness and no search debouncing are
 * re-implemented here, because none of them live in a feature — they live in
 * `DataTable`, `useDataTableState` and the query key. **The shared table needed
 * no changes at all** to render a colour, two badges and a date range; those
 * are cells, and their decisions belong to `ProjectSwatch`, `ProjectBadges` and
 * `ProjectPeriod`.
 *
 * ## Everything the table does happens on the server
 *
 * `useDataTableState` holds the page, the page size, the sort column and
 * direction, the search term and the filters as one object; that object is
 * turned into this endpoint's query and put in the TanStack Query key. So
 * sorting a column is a request for the sorted page rather than a re-ordering
 * of the twenty rows on screen, searching is a `?search=` — matched by the
 * backend against `code`, `name` **and** `clientName` — rather than an
 * `Array.filter`, filtering by status is a `?projectStatus=`, and page 3 is a
 * cache entry of its own.
 *
 * `useDataTableTransition` is what makes the pairing with `useSuspenseQuery`
 * behave: without it every page change would blank the table back to its
 * skeleton. With it, the current rows stay while the next page loads and the
 * toolbar shows a small spinner.
 *
 * ## Three filters, because the endpoint accepts exactly three
 *
 * `ProjectQueryDto` takes `search`, `projectStatus`, `projectPriority` and
 * `isArchived` — and nothing else, which the generated `ProjectsQuery`
 * confirms. Inventing a fourth would not quietly do nothing, it would be a
 * `400`, because the global `ValidationPipe` runs with `forbidNonWhitelisted`.
 * See `toProjectsQuery`.
 *
 * That is also why `isFiltered` below tests all four ways of narrowing the list
 * rather than only the search term: any of them can produce an empty page that
 * must not be mistaken for a company with no projects.
 *
 * ## Two kinds of "nothing here"
 *
 * An unconfigured list gets `ProjectsEmptyState` in place of the table. A
 * search or filter that matches nothing keeps the table and says so inside it,
 * because the controls that produced the empty result are the way out of it.
 * They are distinguished by whether anything was asked for, not by the count.
 */
export const ProjectsTable = () => {
  const { t } = useTranslation();
  const { state, actions: baseActions } = useDataTableState({ sortBy: DEFAULT_PROJECT_SORT });
  const { actions, isPending } = useDataTableTransition(baseActions);
  const { items, meta } = useSuspenseProjects(state);

  /*
   * Deleting the last row of a page leaves the table standing on a page the
   * result set no longer has. The backend answers that with an empty page
   * rather than an error — an empty screen that reads as "no projects" and is
   * not — so the list steps back one page instead. `useDataTableState` handles
   * the same hazard for every other control; this is the one case it cannot
   * see, because it does not know a row was removed.
   */
  const onDeleted = useCallback(() => {
    if (items.length === 1 && state.page > 1) actions.setPage(state.page - 1);
  }, [items.length, state.page, actions]);

  const columns = useProjectColumns({ onDeleted });

  const isFiltered =
    state.search.trim() !== '' ||
    state.filters[PROJECT_STATUS_FILTER] !== undefined ||
    state.filters[PROJECT_PRIORITY_FILTER] !== undefined ||
    state.filters[IS_ARCHIVED_FILTER] !== undefined;

  if (meta.total === 0 && !isFiltered) return <ProjectsEmptyState />;

  return (
    <Card>
      <CardContent>
        <DataTable
          columns={columns}
          data={items}
          meta={meta}
          state={state}
          actions={actions}
          getRowId={rowId}
          isFetching={isPending}
          searchPlaceholder={t('projects.searchPlaceholder')}
          emptyMessage={t('projects.noResults')}
          filters={
            <>
              <ProjectsStatusFilter
                value={state.filters[PROJECT_STATUS_FILTER]}
                onChange={(value) => actions.setFilter(PROJECT_STATUS_FILTER, value)}
              />
              <ProjectsPriorityFilter
                value={state.filters[PROJECT_PRIORITY_FILTER]}
                onChange={(value) => actions.setFilter(PROJECT_PRIORITY_FILTER, value)}
              />
              <ProjectsArchivedFilter
                value={state.filters[IS_ARCHIVED_FILTER]}
                onChange={(value) => actions.setFilter(IS_ARCHIVED_FILTER, value)}
              />
            </>
          }
        />
      </CardContent>
    </Card>
  );
};
