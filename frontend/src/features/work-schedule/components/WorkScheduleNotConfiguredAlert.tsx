import { InfoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface WorkScheduleNotConfiguredAlertProps {
  /** True for somebody holding `WORK_SCHEDULE.EDIT`, who can act on this. */
  canSave: boolean;
}

/**
 * Says that nothing has been configured yet — the fresh-deployment state, not a
 * failure.
 *
 * `GET /api/v1/work-schedule` answers `404` until a first `PUT`, and the backend
 * documents that as *"a legitimate state on a fresh deployment"*. It is caught
 * in `work-schedule-query.ts` and turned into `null`, so the screen renders the
 * form pre-filled with the documented defaults rather than an error state — a
 * retry button here would be a control that could never help, because there is
 * nothing to retry and nothing wrong.
 *
 * It matters that this is said out loud rather than left implicit. A form full
 * of plausible numbers looks exactly like a configuration somebody entered, and
 * the difference — that none of it is stored, and every other module that reads
 * the schedule is currently getting a `404` — is not visible from the values.
 *
 * The sentence changes with the permission, because the useful thing to say
 * differs: somebody with `WORK_SCHEDULE.EDIT` is told to check the values and
 * save; somebody without it is told the configuration is missing and who can
 * add it, since pointing them at a Save button they do not have would be
 * pointing at nothing.
 *
 * `role="status"` rather than `role="alert"`: it is present on first render
 * rather than appearing in response to something, so it should be read in turn
 * rather than interrupt.
 */
export const WorkScheduleNotConfiguredAlert = ({
  canSave,
}: WorkScheduleNotConfiguredAlertProps) => {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm"
    >
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t('workSchedule.notConfigured.title')}</p>
        <p className="text-muted-foreground">
          {canSave
            ? t('workSchedule.notConfigured.description')
            : t('workSchedule.notConfigured.readOnlyDescription')}
        </p>
      </div>
    </div>
  );
};
