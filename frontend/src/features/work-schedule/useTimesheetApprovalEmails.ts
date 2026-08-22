import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  createTimesheetApprovalEmail,
  deleteTimesheetApprovalEmail,
  type CreateTimesheetApprovalEmail,
  type TimesheetApprovalEmail,
} from './work-schedule-api';
import {
  timesheetApprovalEmailsQueryOptions,
  WORK_SCHEDULE_QUERY_KEY,
} from './work-schedule-query';

/**
 * The approval addresses: one read and two writes.
 *
 * The same three hooks F10 built for the leave notification addresses, against
 * this module's endpoints — and **two fewer than F10 has**, because this
 * sub-resource offers no `PATCH`. A typo is corrected by removing the address
 * and adding the right one, which is what the API supports; nothing here
 * pretends otherwise by rendering an edit control that would have nowhere to go.
 */

/** Every configured address. Unpaginated — the endpoint returns the whole list. */
export const useSuspenseTimesheetApprovalEmails = (): TimesheetApprovalEmail[] => {
  const { data } = useSuspenseQuery(timesheetApprovalEmailsQueryOptions());

  return data;
};

/**
 * Invalidates the list.
 *
 * The whole `work-schedule` prefix rather than the emails entry alone: the two
 * queries under it are one subject, and a list that only exists once the
 * schedule does should not be refreshed by a key that claims to know better.
 */
const useInvalidateApprovalEmails = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: WORK_SCHEDULE_QUERY_KEY });
};

export const useCreateTimesheetApprovalEmail = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateApprovalEmails();

  return useMutation({
    mutationFn: (body: CreateTimesheetApprovalEmail) => createTimesheetApprovalEmail(body),
    onSuccess: async (approvalEmail) => {
      await invalidate();
      /*
       * The stored address, not the submitted one. The backend trims and
       * lower-cases before it stores, so `HR@firma.ro` comes back as
       * `hr@firma.ro` — and a toast quoting what was typed would name something
       * the list does not contain.
       */
      toast.success(t('workSchedule.emails.toast.created', { email: approvalEmail.email }));
    },
  });
};

export interface DeleteTimesheetApprovalEmailVariables {
  id: string;
  /** Carried so the toast can name the row the response no longer describes. */
  email: string;
}

export const useDeleteTimesheetApprovalEmail = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateApprovalEmails();

  return useMutation({
    mutationFn: ({ id }: DeleteTimesheetApprovalEmailVariables) =>
      deleteTimesheetApprovalEmail(id),
    onSuccess: async (_data, { email }) => {
      await invalidate();
      toast.success(t('workSchedule.emails.toast.deleted', { email }));
    },
  });
};
