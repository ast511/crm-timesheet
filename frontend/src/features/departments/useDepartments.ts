import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { PaginatedResult } from '@/api/client';
import type { DataTableState } from '@/components/data-table/data-table.types';

import {
  createDepartment,
  deleteDepartment,
  updateDepartment,
  type CreateDepartment,
  type Department,
  type UpdateDepartment,
} from './departments-api';
import { DEPARTMENTS_QUERY_KEY, departmentsQueryOptions } from './departments-query';

/**
 * The hooks the departments screen is built from.
 *
 * ## Where each kind of failure is reported, and why it differs
 *
 * The rule `useLeaveTypes.ts` states, applied unchanged: **a failure with an
 * inline home is reported inline; toasts are for successes and for failures with
 * nowhere else to go.**
 *
 * So the two form mutations do not toast their errors. A rejected create or
 * update happens with the form still open and the person still looking at the
 * fields — a duplicate code belongs beside those fields, and `CLAUDE.md` is
 * explicit that a validation failure is shown in the form rather than as a
 * toast. `DepartmentForm` renders it through `useDepartmentErrorMessage`, so the
 * mutation deliberately stays quiet and the failure is reported once.
 *
 * The delete follows the same rule for a sharper reason: its confirmation dialog
 * stays open and says what went wrong, rather than closing and leaving a toast
 * to explain a row that is still in the list.
 *
 * Successes *are* toasted here, once, for all three — the screen behind the
 * dialog is what the person sees next, and it needs to say what just happened.
 */

/**
 * One page of departments, for the current table state.
 *
 * `useSuspenseQuery`, as `CLAUDE.md` asks: the first load suspends into
 * `DataTableSkeleton` rather than branching on a loading flag, and a failure
 * throws to the surrounding `QueryBoundary`. Every subsequent page, sort and
 * search is a *transition* (see `useDataTableTransition`), so the rows already
 * on screen stay there while the next page is fetched.
 */
export const useSuspenseDepartments = (state: DataTableState): PaginatedResult<Department> => {
  const { data } = useSuspenseQuery(departmentsQueryOptions(state));

  return data;
};

/**
 * Invalidates **every** cached page of the list.
 *
 * Not just the page the write happened on: a new department sorts into whichever
 * page its name falls on, a renamed one moves, and a deleted one shifts every
 * row after it up by one. Anything narrower would leave a neighbouring page
 * holding a list that is quietly one row out of date.
 */
const useInvalidateDepartments = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY });
};

export const useCreateDepartment = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateDepartments();

  return useMutation({
    mutationFn: (body: CreateDepartment) => createDepartment(body),
    onSuccess: async (department) => {
      await invalidate();
      toast.success(t('departments.toast.created', { name: department.name }));
    },
  });
};

export interface UpdateDepartmentVariables {
  id: string;
  body: UpdateDepartment;
}

export const useUpdateDepartment = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateDepartments();

  return useMutation({
    mutationFn: ({ id, body }: UpdateDepartmentVariables) => updateDepartment(id, body),
    onSuccess: async (department) => {
      await invalidate();
      toast.success(t('departments.toast.updated', { name: department.name }));
    },
  });
};

export interface DeleteDepartmentVariables {
  id: string;
  /** Carried so the toast can name the row the response no longer describes. */
  name: string;
}

export const useDeleteDepartment = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateDepartments();

  return useMutation({
    mutationFn: ({ id }: DeleteDepartmentVariables) => deleteDepartment(id),
    onSuccess: async (_data, { name }) => {
      await invalidate();
      toast.success(t('departments.toast.deleted', { name }));
    },
  });
};
