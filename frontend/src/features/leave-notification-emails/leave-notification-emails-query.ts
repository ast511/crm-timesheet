import { queryOptions } from '@tanstack/react-query';

import {
  fetchLeaveNotificationEmails,
  toLeaveNotificationEmailsQuery,
} from './leave-notification-emails-api';

/**
 * The notification addresses as server state.
 *
 * The same arrangement as `leave-types-query.ts`, minus the parts this list does
 * not have: the key holds the **resolved query** rather than a table state, so
 * page 2 is a cache entry of its own instead of an overwrite of page 1, and
 * paging back and forth is a cache read rather than a request.
 */

/** The prefix every entry shares, and therefore what a write invalidates. */
export const LEAVE_NOTIFICATION_EMAILS_QUERY_KEY = ['leave-notification-emails'] as const;

/**
 * Thirty seconds, matching the leave types this section sits under — and for
 * the same reason. These addresses are configuration several administrators
 * share, so a colleague adding one should surface on the next interaction
 * rather than on the next session, while paging back to a page just visited
 * stays a cache read.
 */
const LEAVE_NOTIFICATION_EMAILS_STALE_TIME_MS = 30_000;

export const leaveNotificationEmailsQueryOptions = (page: number) => {
  const query = toLeaveNotificationEmailsQuery(page);

  return queryOptions({
    queryKey: [...LEAVE_NOTIFICATION_EMAILS_QUERY_KEY, 'list', query],
    queryFn: ({ signal }) => fetchLeaveNotificationEmails(query, signal),
    staleTime: LEAVE_NOTIFICATION_EMAILS_STALE_TIME_MS,
  });
};
