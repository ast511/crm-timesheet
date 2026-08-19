import { useMemo, useTransition } from 'react';

import type { DataTableActions } from './data-table.types';

export interface UseDataTableTransitionResult {
  /** The same actions, each marking its state change as a transition. */
  actions: DataTableActions;
  /** True while a transition is in flight — feed it to `DataTable.isFetching`. */
  isPending: boolean;
}

/**
 * Keeps the current page on screen while the next one is fetched.
 *
 * ## The problem it solves
 *
 * `CLAUDE.md` asks a screen to read its data with `useSuspenseQuery`, and
 * {@link DataTableState} is part of the query key — so clicking "next page",
 * sorting a column or typing in the search box changes the key, the query
 * suspends, and the whole table is replaced by its skeleton for as long as the
 * request takes. The list would flash to a placeholder on every interaction,
 * which is worse than the wait it is meant to cover.
 *
 * React already has the answer: an update marked as a transition does **not**
 * re-show a `<Suspense>` fallback for a boundary that has already rendered. The
 * previous rows stay put, the controls stay usable, and the new page swaps in
 * when it arrives. `isPending` is what makes that visible rather than silent —
 * it is exactly the state `DataTable`'s `isFetching` spinner was built for.
 *
 * ```tsx
 * const { state, actions: baseActions } = useDataTableState({ sortBy: 'label' });
 * const { actions, isPending } = useDataTableTransition(baseActions);
 * const { data } = useSuspenseQuery(listQueryOptions(state));
 *
 * <DataTable state={state} actions={actions} isFetching={isPending} … />
 * ```
 *
 * The **first** load still suspends into the skeleton, which is correct: there
 * is no previous content to keep, and that is the case a skeleton is for.
 */
export const useDataTableTransition = (
  actions: DataTableActions,
): UseDataTableTransitionResult => {
  const [isPending, startTransition] = useTransition();

  const transitionActions = useMemo<DataTableActions>(
    () => ({
      setPage: (page) => startTransition(() => actions.setPage(page)),
      setLimit: (limit) => startTransition(() => actions.setLimit(limit)),
      setSearch: (search) => startTransition(() => actions.setSearch(search)),
      toggleSort: (sortBy) => startTransition(() => actions.toggleSort(sortBy)),
      setFilter: (name, value) => startTransition(() => actions.setFilter(name, value)),
    }),
    [actions],
  );

  return { actions: transitionActions, isPending };
};