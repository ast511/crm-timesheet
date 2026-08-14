import { useCallback, useMemo, useState } from 'react';

import type { DataTableActions, DataTableState, SortOrder } from './data-table.types';

const FIRST_PAGE = 1;
const DEFAULT_LIMIT = 20;

export interface UseDataTableStateOptions {
  /** Required — there is no sensible default sort column across all resources. */
  sortBy: string;
  sortOrder?: SortOrder;
  limit?: number;
  filters?: Record<string, string | undefined>;
}

export interface UseDataTableStateResult {
  state: DataTableState;
  actions: DataTableActions;
}

/**
 * Holds the query state for one list screen.
 *
 * ```tsx
 * const { state, actions } = useDataTableState({ sortBy: 'name' });
 *
 * const { data } = useSuspenseQuery({
 *   queryKey: ['departments', state],
 *   queryFn: ({ signal }) =>
 *     apiGet('/api/v1/departments', { query: toQueryParams(state), signal }),
 * });
 * ```
 *
 * **Every change except the page itself resets to page 1.** Filtering a list
 * while standing on page 7 otherwise lands on a page that no longer exists, and
 * the backend answers with an empty page rather than an error — an empty screen
 * that looks like "no results" and is not.
 */
export const useDataTableState = (options: UseDataTableStateOptions): UseDataTableStateResult => {
  const [state, setState] = useState<DataTableState>(() => ({
    page: FIRST_PAGE,
    limit: options.limit ?? DEFAULT_LIMIT,
    search: '',
    sortBy: options.sortBy,
    sortOrder: options.sortOrder ?? 'asc',
    filters: options.filters ?? {},
  }));

  const setPage = useCallback((page: number) => {
    setState((current) => ({ ...current, page }));
  }, []);

  const setLimit = useCallback((limit: number) => {
    setState((current) => ({ ...current, limit, page: FIRST_PAGE }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setState((current) => ({ ...current, search, page: FIRST_PAGE }));
  }, []);

  const toggleSort = useCallback((sortBy: string) => {
    setState((current) => ({
      ...current,
      sortBy,
      sortOrder: current.sortBy === sortBy && current.sortOrder === 'asc' ? 'desc' : 'asc',
      page: FIRST_PAGE,
    }));
  }, []);

  const setFilter = useCallback((name: string, value: string | undefined) => {
    setState((current) => ({
      ...current,
      filters: { ...current.filters, [name]: value },
      page: FIRST_PAGE,
    }));
  }, []);

  const actions = useMemo(
    () => ({ setPage, setLimit, setSearch, toggleSort, setFilter }),
    [setPage, setLimit, setSearch, toggleSort, setFilter],
  );

  return { state, actions };
};

/**
 * Flattens the state into query parameters for a list endpoint.
 *
 * An empty search is dropped rather than sent as `search=`: the backend
 * documents absent and empty as the same thing, and sending the empty string
 * would put two different query keys on one identical result.
 */
export const toQueryParams = (
  state: DataTableState,
): Record<string, string | number | undefined> => ({
  page: state.page,
  limit: state.limit,
  sortBy: state.sortBy,
  sortOrder: state.sortOrder,
  search: state.search.trim() === '' ? undefined : state.search.trim(),
  ...state.filters,
});
