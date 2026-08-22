import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  saveWorkSchedule,
  type UpdateWorkSchedule,
  type WorkSchedule,
} from './work-schedule-api';
import { WORK_SCHEDULE_QUERY_KEY, workScheduleQueryOptions } from './work-schedule-query';

/**
 * The two hooks the configuration form is built from: one read, one write.
 *
 * There is no create/update pair and no delete, which is the whole shape of a
 * singleton: the resource always has the same address, the `PUT` is its entire
 * write API, and the caller never has to know whether it existed a moment ago.
 */

/**
 * The stored configuration, or `null` when nothing has been configured yet.
 *
 * `useSuspenseQuery`, as `CLAUDE.md` asks: the first load suspends into
 * `WorkScheduleSkeleton` — shaped like the form, not like a spinner — and a
 * genuine failure throws to the surrounding `QueryBoundary`. The `null` is not a
 * failure and does not throw; see `work-schedule-query.ts` for why the `404` is
 * caught there.
 */
export const useSuspenseWorkSchedule = (): WorkSchedule | null => {
  const { data } = useSuspenseQuery(workScheduleQueryOptions());

  return data;
};

/**
 * Stores the configuration.
 *
 * ## The response is written into the cache, not just invalidated
 *
 * `setQueryData` with what the `PUT` answered, and only then an invalidation of
 * the shared prefix. The response *is* the new state — the endpoint returns the
 * stored row — so writing it means the form re-initialises from what was
 * actually saved rather than from what was submitted, and the two can differ in
 * a way worth seeing: `workingDays` is sorted into week order before it is
 * stored, so a person who ticks Saturday before Wednesday gets the week back in
 * order rather than in the order they clicked.
 *
 * The invalidation that follows is for everything *else* keyed under
 * `work-schedule` — the approval addresses today, and every future screen that
 * reads `timezone` before rendering a timestamp.
 *
 * ## Errors are not toasted here
 *
 * The rule F07 stated and this feature does not restate: a failure with an
 * inline home is reported inline. The form is still open and the person is
 * still looking at the fields, so a refusal belongs on them — `FormAlert` for
 * the translated `errorCode`, and the shared `useServerFieldErrors` for each
 * field the envelope named. Only the success is toasted.
 */
export const useSaveWorkSchedule = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateWorkSchedule) => saveWorkSchedule(body),
    onSuccess: async (schedule) => {
      queryClient.setQueryData(workScheduleQueryOptions().queryKey, schedule);
      await queryClient.invalidateQueries({ queryKey: WORK_SCHEDULE_QUERY_KEY });
      toast.success(t('workSchedule.toast.saved'));
    },
  });
};
