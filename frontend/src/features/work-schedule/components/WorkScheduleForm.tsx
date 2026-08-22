import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCan } from '@/features/permissions/usePermissions';
import { useServerFieldErrors } from '@/hooks/useServerFieldErrors';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

import { useSaveWorkSchedule } from '../useWorkSchedule';
import { useWorkScheduleSchemas } from '../useWorkScheduleSchemas';
import { workScheduleAdvisories } from '../work-schedule-advisories';
import { WORK_SCHEDULE_DEFAULTS, type WorkSchedule } from '../work-schedule-api';
import {
  toWorkScheduleFormInput,
  WORK_SCHEDULE_FIELDS,
  type WorkScheduleFormInput,
  type WorkScheduleFormValues,
} from '../work-schedule-schemas';
import { WorkScheduleHoursSection } from './WorkScheduleHoursSection';
import { WorkScheduleNotConfiguredAlert } from './WorkScheduleNotConfiguredAlert';
import { WorkingDaysSection } from './WorkingDaysSection';

export interface WorkScheduleFormProps {
  /** The stored configuration, or `null` when none has been stored yet. */
  schedule: WorkSchedule | null;
}

/**
 * The configuration form: **two cards, one `<form>`, one `PUT`.**
 *
 * ## Why the two cards are not two forms
 *
 * `PUT /api/v1/work-schedule` replaces the configuration. Every field on the DTO
 * is required, the service writes every column from the body, and a partial body
 * is a `400` — so there is no request that saves the working week without also
 * saving the hour rules. Two forms would therefore be two ways of sending the
 * same complete body, with two chances for one of them to send a stale half.
 *
 * The mock's layout survives this intact: the days are still their own card with
 * their own heading, the hours are still theirs, and the Save button is still at
 * the bottom of the second. What changed is only that pressing it saves both,
 * which is the only thing the API can do.
 *
 * ## `timezone` is an editable field, and always in the body
 *
 * F12 shipped it round-tripped and invisible, matching a mock that simply had
 * not drawn it. **That was a mistake.** The zone is not cosmetic: it is the one
 * IANA name the backend interprets every calendar day and every day/week
 * boundary in, for every timesheet calculation, and this application is
 * deployed in more than one country. A company abroad that cannot set it has
 * every hour, day and week computed against Bucharest's midnight.
 *
 * So it is a control on the hours card, bound like the rest, validated against
 * the same `Intl` tz database the backend validates against, and present in
 * every `PUT`. That also settles the original round-trip worry more firmly than
 * round-tripping did: the value is on screen and in `values`, rather than
 * spliced onto the body at submit time by a line a later edit could drop.
 *
 * **Reset is the one place it is treated differently** — see `onReset` below.
 * Restoring "the defaults" must not re-interpret which calendar day every
 * recorded instant falls on, so the zone resets to the *stored* one rather than
 * to `WORK_SCHEDULE_DEFAULTS`'.
 *
 * ## Gating
 *
 * `WORK_SCHEDULE.EDIT` — the key backend Feature 041 put on this `PUT`, and the
 * catalog's words for it are "change the working days, hours and entry limits",
 * which is this form exactly. Without it every control is disabled and the two
 * buttons are gone: the configuration stays readable, because it is worth
 * reading, and nothing on screen offers an action the API would refuse.
 *
 * The approval addresses below take a **different** key — `WORK_SCHEDULE.CONFIGURE`
 * — and the split is deliberate on the backend's side, not an accident this
 * screen should smooth over. `Admin - Standard` holds `EDIT` and not `CONFIGURE`,
 * so an ordinary administrator may change the working week and may not reroute
 * where the approval mail goes.
 */
export const WorkScheduleForm = ({ schedule }: WorkScheduleFormProps) => {
  const { t } = useTranslation();
  const { workScheduleSchema } = useWorkScheduleSchemas();
  const describeError = useApiErrorMessage();
  const markRejectedFields = useServerFieldErrors<WorkScheduleFormInput>();
  const canSave = useCan({ permission: 'WORK_SCHEDULE.EDIT' });

  const save = useSaveWorkSchedule();

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<WorkScheduleFormInput, unknown, WorkScheduleFormValues>({
    resolver: zodResolver(workScheduleSchema),
    defaultValues: toWorkScheduleFormInput(schedule ?? WORK_SCHEDULE_DEFAULTS),
  });

  const onSubmit = handleSubmit((values: WorkScheduleFormValues) => {
    /*
     * `values` is the complete body — `timezone` included, because it is now a
     * field of this form like any other. Nothing is spliced in at submit time
     * any more, which is what removes the class of bug the original round-trip
     * note worried about: there is no longer a value travelling beside the form
     * that an edit here could forget to attach.
     */
    save.mutate(values, {
      onSuccess: (saved) => {
        /*
         * Re-initialised from what was *stored*, not from what was submitted.
         * The backend sorts `workingDays` into week order, so somebody who
         * ticks Saturday before Wednesday gets the week back in order — and
         * the form is clean again, so `isDirty` means what it says.
         */
        reset(toWorkScheduleFormInput(saved));
      },
      onError: (error) => markRejectedFields(error, WORK_SCHEDULE_FIELDS, setError),
    });
  });

  /*
   * Watched rather than read from `getValues`, so the coherence notes track the
   * numbers as they are typed — guidance that waits for a failed submit has
   * already let the mistake happen.
   *
   * `useWatch` over **three named fields** rather than `watch()` over all ten,
   * for two reasons. It subscribes to only what the notes are about, so typing
   * in the lunch break does not re-render the section; and `watch()` is a
   * function `useForm` returns fresh each render, which React Compiler cannot
   * memoize around — it bails out of the whole component rather than risk stale
   * output.
   */
  const [maxHoursPerDay, standardHoursPerDay, maxHoursPerEntry] = useWatch({
    control,
    name: ['maxHoursPerDay', 'standardHoursPerDay', 'maxHoursPerEntry'],
  });

  const advisories = workScheduleAdvisories({
    maxHoursPerDay,
    standardHoursPerDay,
    maxHoursPerEntry,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {schedule === null && <WorkScheduleNotConfiguredAlert canSave={canSave} />}

      <WorkingDaysSection
        control={control}
        error={errors.workingDays?.message}
        readOnly={!canSave}
      />

      <WorkScheduleHoursSection
        register={register}
        control={control}
        errors={errors}
        advisories={advisories}
        alertMessage={save.error === null ? undefined : describeError(save.error)}
        isSaving={save.isPending}
        canSave={canSave}
        onReset={() => {
          /*
           * The form only — nothing is stored. `reset` with `keepDefaultValues`
           * would make the defaults the new baseline and the form instantly
           * clean, which would be a lie: these values are not what the server
           * holds until Save is pressed.
           *
           * **`timezone` is exempt, and deliberately so.** Every other field
           * goes back to `WORK_SCHEDULE_DEFAULTS`; the zone goes back to the
           * one *this company* has stored. Restoring "the defaults" must not
           * re-interpret which calendar day every recorded instant falls on,
           * which is exactly what handing a New York company Bucharest would
           * do. F12 got this property for free by keeping the value out of the
           * form; now that it is in, it has to be stated.
           */
          reset(
            toWorkScheduleFormInput({
              ...WORK_SCHEDULE_DEFAULTS,
              timezone: schedule?.timezone ?? WORK_SCHEDULE_DEFAULTS.timezone,
            }),
            { keepDefaultValues: true },
          );
        }}
      />

      <p className="sr-only" aria-live="polite">
        {save.isPending ? t('workSchedule.actions.saving') : ''}
      </p>
    </form>
  );
};
