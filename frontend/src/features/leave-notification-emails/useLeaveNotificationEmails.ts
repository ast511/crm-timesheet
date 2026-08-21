import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { PaginatedResult } from '@/api/client';

import {
  createLeaveNotificationEmail,
  deleteLeaveNotificationEmail,
  updateLeaveNotificationEmail,
  type CreateLeaveNotificationEmail,
  type LeaveNotificationEmail,
  type UpdateLeaveNotificationEmail,
} from './leave-notification-emails-api';
import {
  LEAVE_NOTIFICATION_EMAILS_QUERY_KEY,
  leaveNotificationEmailsQueryOptions,
} from './leave-notification-emails-query';

/**
 * The hooks the notification-addresses section is built from.
 *
 * Where each kind of failure is reported follows the rule F07 stated once and
 * this feature does not restate: **a failure with an inline home is reported
 * inline; toasts are for successes and for failures with nowhere else to go.**
 * So the two write mutations stay quiet on error — the form is still open and
 * the person is still looking at the field a duplicate belongs on — and the
 * delete says what went wrong inside its confirmation. Successes are toasted
 * here, once, for all three.
 */

/**
 * One page of addresses.
 *
 * `useSuspenseQuery`, as `CLAUDE.md` asks: the first load suspends into
 * `LeaveNotificationEmailsSkeleton` rather than branching on a loading flag, and
 * a failure throws to the surrounding `QueryBoundary`. Paging is done inside a
 * `useTransition`, so the rows already on screen stay while the next page loads
 * instead of the section blinking back to its skeleton.
 */
export const useSuspenseLeaveNotificationEmails = (
  page: number,
): PaginatedResult<LeaveNotificationEmail> => {
  const { data } = useSuspenseQuery(leaveNotificationEmailsQueryOptions(page));

  return data;
};

/**
 * Invalidates **every** cached page of the list.
 *
 * Not just the page the write happened on: the list is ordered by `email`, so a
 * new address sorts into whichever page it falls on, a corrected one moves, and
 * a removed one shifts every row after it up by one.
 */
const useInvalidateLeaveNotificationEmails = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: LEAVE_NOTIFICATION_EMAILS_QUERY_KEY });
};

export const useCreateLeaveNotificationEmail = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateLeaveNotificationEmails();

  return useMutation({
    mutationFn: (body: CreateLeaveNotificationEmail) => createLeaveNotificationEmail(body),
    onSuccess: async (notificationEmail) => {
      await invalidate();
      /*
       * The stored address, not the submitted one. The backend lower-cases
       * before it stores, so `HR@firma.ro` comes back as `hr@firma.ro` — and a
       * toast quoting what was typed would name something the list does not
       * contain.
       */
      toast.success(
        t('leaveNotificationEmails.toast.created', { email: notificationEmail.email }),
      );
    },
  });
};

export interface UpdateLeaveNotificationEmailVariables {
  id: string;
  body: UpdateLeaveNotificationEmail;
}

export const useUpdateLeaveNotificationEmail = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateLeaveNotificationEmails();

  return useMutation({
    mutationFn: ({ id, body }: UpdateLeaveNotificationEmailVariables) =>
      updateLeaveNotificationEmail(id, body),
    onSuccess: async (notificationEmail) => {
      await invalidate();
      toast.success(
        t('leaveNotificationEmails.toast.updated', { email: notificationEmail.email }),
      );
    },
  });
};

export interface DeleteLeaveNotificationEmailVariables {
  id: string;
  /** Carried so the toast can name the row the response no longer describes. */
  email: string;
}

export const useDeleteLeaveNotificationEmail = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateLeaveNotificationEmails();

  return useMutation({
    mutationFn: ({ id }: DeleteLeaveNotificationEmailVariables) =>
      deleteLeaveNotificationEmail(id),
    onSuccess: async (_data, { email }) => {
      await invalidate();
      toast.success(t('leaveNotificationEmails.toast.deleted', { email }));
    },
  });
};
