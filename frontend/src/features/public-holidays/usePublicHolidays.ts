import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { PaginatedResult } from '@/api/client';
import type { DataTableState } from '@/components/data-table/data-table.types';

import {
  createPublicHoliday,
  deletePublicHoliday,
  updatePublicHoliday,
  type CreatePublicHoliday,
  type PublicHoliday,
  type UpdatePublicHoliday,
} from './public-holidays-api';
import { PUBLIC_HOLIDAYS_QUERY_KEY, publicHolidaysQueryOptions } from './public-holidays-query';

/**
 * The hooks the public-holidays screen is built from.
 *
 * ## Where each kind of failure is reported, and why it differs
 *
 * The rule `useLeaveTypes.ts` states and `useDepartments.ts` repeats, applied
 * unchanged: **a failure with an inline home is reported inline; toasts are for
 * successes and for failures with nowhere else to go.**
 *
 * So the two form mutations do not toast their errors. A rejected create or
 * update happens with the form still open and the person still looking at the
 * fields — a day that collides with an existing holiday belongs beside those
 * fields, and `CLAUDE.md` is explicit that a validation failure is shown in the
 * form rather than as a toast. `PublicHolidayForm` renders it through
 * `usePublicHolidayErrorMessage`, so the mutation deliberately stays quiet and
 * the failure is reported once.
 *
 * The delete follows the same rule for a sharper reason: its confirmation
 * dialog stays open and says what went wrong, rather than closing and leaving a
 * toast to explain a row that is still in the list.
 *
 * Successes *are* toasted here, once, for all three — the screen behind the
 * dialog is what the person sees next, and it needs to say what just happened.
 */

/**
 * One page of public holidays, for the current table state.
 *
 * `useSuspenseQuery`, as `CLAUDE.md` asks: the first load suspends into
 * `DataTableSkeleton` rather than branching on a loading flag, and a failure
 * throws to the surrounding `QueryBoundary`. Every subsequent page, sort,
 * search and filter is a *transition* (see `useDataTableTransition`), so the
 * rows already on screen stay there while the next page is fetched.
 */
export const useSuspensePublicHolidays = (
  state: DataTableState,
): PaginatedResult<PublicHoliday> => {
  const { data } = useSuspenseQuery(publicHolidaysQueryOptions(state));

  return data;
};

/**
 * Invalidates **every** cached page of the list.
 *
 * Not just the page the write happened on: a new holiday sorts into whichever
 * page its name falls on, a renamed one moves, a retyped one leaves or joins
 * whatever the `?type=` filter is showing, and a deleted one shifts every row
 * after it up by one. Anything narrower would leave a neighbouring page holding
 * a list that is quietly one row out of date.
 */
const useInvalidatePublicHolidays = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: PUBLIC_HOLIDAYS_QUERY_KEY });
};

export const useCreatePublicHoliday = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidatePublicHolidays();

  return useMutation({
    mutationFn: (body: CreatePublicHoliday) => createPublicHoliday(body),
    onSuccess: async (holiday) => {
      await invalidate();
      toast.success(t('publicHolidays.toast.created', { name: holiday.name }));
    },
  });
};

export interface UpdatePublicHolidayVariables {
  id: string;
  body: UpdatePublicHoliday;
}

export const useUpdatePublicHoliday = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidatePublicHolidays();

  return useMutation({
    mutationFn: ({ id, body }: UpdatePublicHolidayVariables) => updatePublicHoliday(id, body),
    onSuccess: async (holiday) => {
      await invalidate();
      toast.success(t('publicHolidays.toast.updated', { name: holiday.name }));
    },
  });
};

export interface DeletePublicHolidayVariables {
  id: string;
  /** Carried so the toast can name the row the response no longer describes. */
  name: string;
}

export const useDeletePublicHoliday = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidatePublicHolidays();

  return useMutation({
    mutationFn: ({ id }: DeletePublicHolidayVariables) => deletePublicHoliday(id),
    onSuccess: async (_data, { name }) => {
      await invalidate();
      toast.success(t('publicHolidays.toast.deleted', { name }));
    },
  });
};
