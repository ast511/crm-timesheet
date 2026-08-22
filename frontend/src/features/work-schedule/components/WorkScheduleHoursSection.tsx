import { ClockIcon, RotateCcwIcon } from 'lucide-react';
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormComboboxField } from '@/components/form/FormComboboxField';
import { FormField } from '@/components/form/FormField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import type { WorkScheduleAdvisory } from '../work-schedule-advisories';
import { MAX_HOURS_PER_WEEK } from '../work-schedule-api';
import type {
  WorkScheduleFormInput,
  WorkScheduleFormValues,
} from '../work-schedule-schemas';
import { SUPPORTED_TIMEZONES } from '../work-schedule-timezones';
import { HoursField } from './HoursField';

export interface WorkScheduleHoursSectionProps {
  register: UseFormRegister<WorkScheduleFormInput>;
  /** For `timezone`, which is a combobox and cannot take a `register` spread. */
  control: Control<WorkScheduleFormInput, unknown, WorkScheduleFormValues>;
  errors: FieldErrors<WorkScheduleFormInput>;
  /** Coherence notes that apply to the values as they stand. Never blocking. */
  advisories: WorkScheduleAdvisory[];
  /** The translated `errorCode` of a refused save, or `undefined`. */
  alertMessage?: string;
  isSaving: boolean;
  /** False for somebody without `WORK_SCHEDULE.EDIT`: the form is read-only. */
  canSave: boolean;
  onReset: () => void;
}

/**
 * "Configurare program de lucru" — the hours and limits, and the page's only
 * Save button.
 *
 * ## The Save button saves the whole page, not this card
 *
 * It sits here because the mock puts it here, and because this is the card with
 * the most fields — but the `<form>` wrapping it starts above, around the
 * working days, so one press sends the complete configuration. That is not a
 * convenience: the endpoint is a `PUT` on a singleton, so a partial body is a
 * rejected request and there is no such thing as saving half of this screen.
 *
 * ## "Ore standard pe săptămână", where the mock said "maxime"
 *
 * The mock's store had a `maxHoursPerWeek`. **This backend has no such field.**
 * The only weekly figure on `WorkSchedule` is `standardHoursPerWeek` — "what a
 * full week is expected to add up to", a target rather than a ceiling — and it
 * is what this input binds to. Keeping the mock's label would have put the word
 * *maximum* on a value nothing enforces as one, which is a worse
 * infidelity to the design than a corrected noun: the layout, the position in
 * the grid and the visual treatment are the mock's; only the word is not.
 *
 * The daily figures keep their meanings exactly: `maxHoursPerDay` really is a
 * ceiling, `standardHoursPerDay` really is a target.
 *
 * ## "Fus orar", which the mock also did not draw
 *
 * F12 shipped without it on the grounds that the mock showed none. That was the
 * wrong reading of an incomplete drawing: `timezone` is not decoration, it is
 * the single IANA zone the backend interprets **every** calendar day and
 * day/week boundary in, and this application is deployed in more than one
 * country. A company that cannot state its zone has its hours, days and weeks
 * computed against somebody else's — silently, and wrongly.
 *
 * So the field is here, at the top of this card, and the round-trip note the
 * original feature left behind is answered by its existence: the value is a
 * visible, always-sent field rather than one carried invisibly beside the form,
 * so no future edit to the submit path can drop it.
 */
export const WorkScheduleHoursSection = ({
  register,
  control,
  errors,
  advisories,
  alertMessage,
  isSaving,
  canSave,
  onReset,
}: WorkScheduleHoursSectionProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockIcon className="size-5 shrink-0" aria-hidden="true" />
          {t('workSchedule.hours.title')}
        </CardTitle>
        <CardDescription>{t('workSchedule.hours.description')}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/*
         * One column on a phone, two from `md`. The pairs are meaningful —
         * start/end, min/max per entry — so they sit side by side where there is
         * room and stack in the same order where there is not.
         */}
        <div className="grid gap-5 md:grid-cols-2">
          {/*
           * First in the card, and across both columns.
           *
           * First because everything under it is read *in* this zone: the two
           * times below are wall-clock times, and which calendar day an entry
           * lands on is decided by this value. A control that decides how its
           * neighbours are interpreted belongs above them, not filed between
           * two hour fields.
           *
           * Across both columns because IANA names are long
           * (`America/Argentina/Buenos_Aires`) and so is the sentence saying
           * what the value does — a half-width field would truncate one and
           * wrap the other to three lines.
           */}
          <Controller
            control={control}
            name="timezone"
            render={({ field, fieldState }) => (
              <FormComboboxField
                label={t('workSchedule.fields.timezone')}
                description={t('workSchedule.fields.timezoneHint')}
                value={field.value}
                onChange={field.onChange}
                options={SUPPORTED_TIMEZONES}
                placeholder={t('workSchedule.fields.timezonePlaceholder')}
                searchLabel={t('workSchedule.fields.timezoneSearchLabel')}
                searchPlaceholder={t('workSchedule.fields.timezoneSearchPlaceholder')}
                emptyMessage={t('workSchedule.fields.timezoneEmpty')}
                error={fieldState.error?.message}
                disabled={!canSave}
                className="md:col-span-2"
              />
            )}
          />

          <FormField
            type="time"
            label={t('workSchedule.fields.workStartTime')}
            description={t('workSchedule.fields.workStartTimeHint')}
            error={errors.workStartTime?.message}
            disabled={!canSave}
            {...register('workStartTime')}
          />

          <FormField
            type="time"
            label={t('workSchedule.fields.workEndTime')}
            description={t('workSchedule.fields.workEndTimeHint')}
            error={errors.workEndTime?.message}
            disabled={!canSave}
            {...register('workEndTime')}
          />

          <HoursField
            label={t('workSchedule.fields.minHoursPerEntry')}
            description={t('workSchedule.fields.minHoursPerEntryHint')}
            error={errors.minHoursPerEntry?.message}
            disabled={!canSave}
            {...register('minHoursPerEntry')}
          />

          <HoursField
            label={t('workSchedule.fields.maxHoursPerEntry')}
            description={t('workSchedule.fields.maxHoursPerEntryHint')}
            error={errors.maxHoursPerEntry?.message}
            disabled={!canSave}
            {...register('maxHoursPerEntry')}
          />

          <HoursField
            label={t('workSchedule.fields.maxHoursPerDay')}
            description={t('workSchedule.fields.maxHoursPerDayHint')}
            error={errors.maxHoursPerDay?.message}
            disabled={!canSave}
            {...register('maxHoursPerDay')}
          />

          <HoursField
            maxHours={MAX_HOURS_PER_WEEK}
            label={t('workSchedule.fields.standardHoursPerWeek')}
            description={t('workSchedule.fields.standardHoursPerWeekHint')}
            error={errors.standardHoursPerWeek?.message}
            disabled={!canSave}
            {...register('standardHoursPerWeek')}
          />

          <HoursField
            label={t('workSchedule.fields.standardHoursPerDay')}
            description={t('workSchedule.fields.standardHoursPerDayHint')}
            error={errors.standardHoursPerDay?.message}
            disabled={!canSave}
            {...register('standardHoursPerDay')}
          />

          <HoursField
            allowZero
            label={t('workSchedule.fields.lunchBreakHours')}
            description={t('workSchedule.fields.lunchBreakHoursHint')}
            error={errors.lunchBreakHours?.message}
            disabled={!canSave}
            {...register('lunchBreakHours')}
          />
        </div>

        {/*
         * The two live regions and the buttons share a container with a tighter
         * gap than the card's. Both regions are present even when they have
         * nothing to say — a live region has to exist *before* its text does for
         * the change to be announced — and a flex gap applies to a zero-height
         * item just as it does to a tall one. Grouping them here means an empty
         * pair costs one tight gap rather than two of the card's wide ones.
         */}
        <div className="flex flex-col gap-4">
          {/*
           * The coherence notes. `aria-live="polite"` because they appear and
           * disappear while somebody types, and a note nobody is told about is a
           * note for sighted readers only. Polite, so it waits for a pause
           * rather than interrupting mid-field.
           *
           * Deliberately *not* `role="alert"` and not styled as an error:
           * nothing here blocks the save, and dressing a suggestion as a refusal
           * is how a form stops being believed. See
           * `work-schedule-advisories.ts`.
           */}
          <div aria-live="polite">
            {advisories.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                {advisories.map((advisory) => (
                  <li key={advisory}>{t(`workSchedule.advisories.${advisory}`)}</li>
                ))}
              </ul>
            )}
          </div>

          <FormAlert message={alertMessage} />

          {canSave && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <SubmitButton pending={isSaving}>{t('workSchedule.actions.save')}</SubmitButton>

              {/*
               * Resetting fills the inputs and stores nothing — there is no
               * defaults endpoint and this does not pretend there is one. The
               * person still has to press Save, which is what makes a mis-click
               * recoverable by navigating away.
               */}
              <Button type="button" variant="outline" disabled={isSaving} onClick={onReset}>
                <RotateCcwIcon aria-hidden="true" />
                {t('workSchedule.actions.reset')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
