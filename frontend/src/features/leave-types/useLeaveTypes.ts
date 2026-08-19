import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { PaginatedResult } from '@/api/client';
import type { DataTableState } from '@/components/data-table/data-table.types';

import {
  createLeaveType,
  deleteLeaveType,
  updateLeaveType,
  type CreateLeaveType,
  type LeaveType,
  type UpdateLeaveType,
} from './leave-types-api';
import { LEAVE_TYPES_QUERY_KEY, leaveTypesQueryOptions } from './leave-types-query';

/**
 * The hooks the leave-types screen is built from.
 *
 * ## Where each kind of failure is reported, and why it differs
 *
 * The two **form** mutations do not toast their errors. A rejected create or
 * update happens with the form still open and the person still looking at the
 * fields — a duplicate code belongs beside those fields, and `CLAUDE.md` is
 * explicit that a validation failure is shown in the form rather than as a
 * toast. `LeaveTypeForm` renders it through `useLeaveTypeErrorMessage`, so the
 * mutation deliberately stays quiet and the failure is reported once.
 *
 * The delete follows the same rule for the same reason: its confirmation
 * dialog stays open and says what went wrong, rather than closing and leaving a
 * toast to explain a row that is still there.
 *
 * Successes *are* toasted here, once, for all three — the screen behind the
 * dialog is what the person sees next, and it needs to say what just happened.
 */

/**
 * One page of leave types, for the current table state.
 *
 * `useSuspenseQuery`, as `CLAUDE.md` asks: the first load suspends into
 * `DataTableSkeleton` rather than branching on a loading flag, and a failure
 * throws to the surrounding `QueryBoundary`. Every subsequent page, sort and
 * search is a *transition* (see `useDataTableTransition`), so the rows already
 * on screen stay there while the next page is fetched.
 */
export const useSuspenseLeaveTypes = (state: DataTableState): PaginatedResult<LeaveType> => {
  const { data } = useSuspenseQuery(leaveTypesQueryOptions(state));

  return data;
};

/**
 * Invalidates **every** cached page of the list.
 *
 * Not just the page the write happened on: a new leave type sorts into
 * whichever page its label falls on, a renamed one moves, and a deleted one
 * shifts every row after it up by one. Anything narrower would leave a
 * neighbouring page holding a list that is quietly one row out of date.
 */
const useInvalidateLeaveTypes = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: LEAVE_TYPES_QUERY_KEY });
};

export const useCreateLeaveType = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateLeaveTypes();

  return useMutation({
    mutationFn: (body: CreateLeaveType) => createLeaveType(body),
    onSuccess: async (leaveType) => {
      await invalidate();
      toast.success(t('leaveTypes.toast.created', { label: leaveType.label }));
    },
  });
};

export interface UpdateLeaveTypeVariables {
  id: string;
  body: UpdateLeaveType;
}

export const useUpdateLeaveType = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateLeaveTypes();

  return useMutation({
    mutationFn: ({ id, body }: UpdateLeaveTypeVariables) => updateLeaveType(id, body),
    onSuccess: async (leaveType) => {
      await invalidate();
      toast.success(t('leaveTypes.toast.updated', { label: leaveType.label }));
    },
  });
};

export interface DeleteLeaveTypeVariables {
  id: string;
  /** Carried so the toast can name the row the response no longer describes. */
  label: string;
}

export const useDeleteLeaveType = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateLeaveTypes();

  return useMutation({
    mutationFn: ({ id }: DeleteLeaveTypeVariables) => deleteLeaveType(id),
    onSuccess: async (_data, { label }) => {
      await invalidate();
      toast.success(t('leaveTypes.toast.deleted', { label }));
    },
  });
};