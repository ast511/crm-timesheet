import { queryOptions } from '@tanstack/react-query';

import {
  fetchTimesheetApprovalEmails,
  fetchWorkSchedule,
  type TimesheetApprovalEmail,
  type WorkSchedule,
} from './work-schedule-api';
import { isWorkScheduleMissing } from './work-schedule-errors';

/**
 * The working schedule as server state.
 *
 * Two queries under one prefix, because they are one subject: the addresses
 * hang off the configuration by a required foreign key, and the API refuses to
 * list them before it exists.
 */

/** The prefix both entries share, and therefore what a write invalidates. */
export const WORK_SCHEDULE_QUERY_KEY = ['work-schedule'] as const;

/**
 * Five minutes, longer than the thirty seconds the leave configuration uses.
 *
 * The working week and the hour rules are the most static configuration in the
 * application — a company changes them when it changes how it works, not during
 * a session — and this is also the value every future screen will read before it
 * renders a timestamp, since `timezone` lives on it. A short stale time would
 * make the same unchanged row a request on every navigation.
 *
 * A colleague's change still surfaces: the save invalidates the key for
 * everybody holding this cache entry, and any remount past the window refetches.
 */
const WORK_SCHEDULE_STALE_TIME_MS = 300_000;

/**
 * The configuration, or **`null` when none has been stored yet**.
 *
 * The `404` is caught here rather than thrown at the boundary, because it is not
 * a failure — it is the documented fresh-deployment state, and the screen's
 * answer to it is an empty form rather than an error with a retry. Every other
 * failure is re-thrown untouched and lands in `QueryErrorState` as usual.
 *
 * Catching it in the query function rather than in the component is what keeps
 * `null` a *cached* answer: without this the boundary would catch a throw,
 * TanStack Query would retry it, and the screen would flicker through an error
 * state on the way to a form it was always going to render.
 */
export const workScheduleQueryOptions = () =>
  queryOptions({
    queryKey: [...WORK_SCHEDULE_QUERY_KEY, 'detail'],
    queryFn: async ({ signal }): Promise<WorkSchedule | null> => {
      try {
        return await fetchWorkSchedule(signal);
      } catch (error) {
        if (isWorkScheduleMissing(error)) return null;

        throw error;
      }
    },
    staleTime: WORK_SCHEDULE_STALE_TIME_MS,
  });

/**
 * Every approval address. Unpaginated, so there is no page in the key.
 *
 * Thirty seconds rather than the five minutes above, matching the leave
 * notification addresses and for the same reason: this is a short list several
 * administrators maintain between them, so a colleague's addition should
 * surface on the next interaction rather than on the next session.
 *
 * `enabled` is deliberately not used here. The section only mounts this query
 * once the schedule is known to exist — the component decides that, because a
 * disabled suspense query has no data to suspend for and would need a second
 * branch anyway.
 */
const APPROVAL_EMAILS_STALE_TIME_MS = 30_000;

export const timesheetApprovalEmailsQueryOptions = () =>
  queryOptions({
    queryKey: [...WORK_SCHEDULE_QUERY_KEY, 'emails'],
    queryFn: ({ signal }): Promise<TimesheetApprovalEmail[]> =>
      fetchTimesheetApprovalEmails(signal),
    staleTime: APPROVAL_EMAILS_STALE_TIME_MS,
  });
