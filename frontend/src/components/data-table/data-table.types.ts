import {
  columnVisibilityFeature,
  metaHelper,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';

/**
 * Shared vocabulary for every list screen in this application.
 *
 * ## Server-side is the default, and it shapes everything here
 *
 * Search, filtering, sorting and pagination all happen on the server, using the
 * shared pagination of backend Feature 006. The `DataTable` sends `page`,
 * `limit`, `sortBy`, `sortOrder`, a search term and whatever filters an
 * endpoint accepts, and renders the page it gets back. It never receives every
 * employee, or every timesheet line, in order to show twenty of them.
 *
 * That is why TanStack Table is registered with **one** feature — column
 * visibility. Client-side sorting, filtering and pagination row models would be
 * a second, disagreeing implementation of what the API already does: they can
 * only ever sort the twenty rows currently on screen, which looks like sorting
 * and is not.
 */

/** Per-column configuration this application adds. */
export interface DataTableColumnMeta {
  /**
   * Human label for the column-visibility menu and for the card view's
   * key/value pairs. Falls back to the column id when absent, so it is only
   * genuinely optional for a column whose id is already readable.
   */
  label?: string;
  /**
   * The value sent as `sortBy`. **A column with no `sortKey` is not sortable**,
   * which is the correct default: the backend only accepts the columns it
   * enumerates, and offering a sort it will reject with a `400` is worse than
   * offering none.
   */
  sortKey?: string;
  /** Leave this column out of the card view — a row-actions column, typically. */
  hideOnCard?: boolean;
}

/**
 * `columnMeta` is declared as a type-only slot rather than by global
 * declaration merging, so the meta type belongs to *this* table configuration
 * instead of to every table in every library that imports TanStack Table.
 */
export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

/** Column definitions for the shared `DataTable`. */
export type DataTableColumnDef<TData extends RowData> = ColumnDef<DataTableFeatures, TData>;

export type SortOrder = 'asc' | 'desc';

/**
 * Everything that decides *which* rows are on screen — and therefore everything
 * that belongs in the TanStack Query key.
 *
 * It is one object rather than five `useState` calls so a screen cannot forget
 * one of them when it builds its query key, which is the failure that shows a
 * cached page 1 while the controls say page 3.
 */
export interface DataTableState {
  /** 1-based, like the backend's own `page`. */
  page: number;
  limit: number;
  /** Global search term. Empty means "no term", never `''` on the wire. */
  search: string;
  sortBy: string;
  sortOrder: SortOrder;
  /**
   * Endpoint-specific filters, by query-parameter name.
   *
   * Untyped on purpose: every list endpoint accepts a different set, and the
   * typed half is where it belongs — at the call site, where the generated
   * query type checks what is actually sent.
   */
  filters: Readonly<Record<string, string | undefined>>;
}

/** The setters `useDataTableState` returns. */
export interface DataTableActions {
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSearch: (search: string) => void;
  /** Sets the column, or flips the direction when it is already the sort column. */
  toggleSort: (sortBy: string) => void;
  setFilter: (name: string, value: string | undefined) => void;
}

/** Page sizes offered by the pagination control, within the backend's cap of 100. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/** Milliseconds of quiet typing before the search term reaches the server. */
export const SEARCH_DEBOUNCE_MS = 300;
