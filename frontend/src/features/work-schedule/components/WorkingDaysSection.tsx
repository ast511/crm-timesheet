import { CalendarDaysIcon } from 'lucide-react';
import { useId } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormSelectField } from '@/components/form/FormSelectField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { useWeekdayOptions } from '../useWeekdayOptions';
import { WEEKDAYS, type Weekday } from '../work-schedule-api';
import type {
  WorkScheduleFormInput,
  WorkScheduleFormValues,
} from '../work-schedule-schemas';
import { WeekdayToggle } from './WeekdayToggle';

/** Monday to Friday, and the whole week — the two presets the mock offers. */
const WEEKDAY_PRESET: readonly Weekday[] = WEEKDAYS.slice(0, 5);
const FULL_WEEK_PRESET: readonly Weekday[] = WEEKDAYS;

export interface WorkingDaysSectionProps {
  control: Control<WorkScheduleFormInput, unknown, WorkScheduleFormValues>;
  /** The message for `workingDays`, already translated. Absent means valid. */
  error?: string;
  /** True for somebody who may read the configuration but not change it. */
  readOnly: boolean;
}

/** Whether two day sets hold the same days, so a preset can show as active. */
const sameDays = (left: readonly Weekday[], right: readonly Weekday[]): boolean =>
  left.length === right.length && right.every((day) => left.includes(day));

/**
 * "Săptămână lucrătoare" — the first of the page's three cards.
 *
 * ## It is part of the form, not a control that saves itself
 *
 * The mock wrote each toggle straight into a store, which is the right shape for
 * a store and the wrong one for this API: the working week is a field of the
 * singleton, and the only way to store it is a `PUT` carrying the *whole*
 * configuration. A toggle that saved on click would therefore send every hour
 * rule along with it, including any the person was halfway through editing in
 * the card below.
 *
 * So the days are a field like any other — `Controller`-bound, dirtying the
 * form, saved by the one Save button underneath. Visually nothing changes; what
 * changes is that a mis-click is undone by not saving.
 *
 * ## `weekStartsOn` is here rather than beside the hours
 *
 * The mock has no control for it, but the column exists, the `PUT` writes it,
 * and it is the one thing on this screen that says where one week ends and the
 * next begins — which is what the weekly hour ceiling in the card below is
 * measured against. It belongs with the week, not with the hours.
 *
 * It is deliberately **not** restricted to the days ticked above, matching
 * `@IsWeekStartsOn()`: a company working Monday to Friday whose payroll week
 * begins on Sunday is an ordinary arrangement, and the day a week turns over on
 * need not itself be worked.
 */
export const WorkingDaysSection = ({ control, error, readOnly }: WorkingDaysSectionProps) => {
  const { t } = useTranslation();
  const weekdays = useWeekdayOptions();
  const errorId = useId();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarDaysIcon className="size-5 shrink-0" aria-hidden="true" />
            {t('workSchedule.workingDays.title')}
          </CardTitle>

          <Controller
            control={control}
            name="workingDays"
            render={({ field }) => (
              <Badge variant="secondary">
                {t('workSchedule.workingDays.count', { count: field.value.length })}
              </Badge>
            )}
          />
        </div>
        <CardDescription>{t('workSchedule.workingDays.description')}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <Controller
          control={control}
          name="workingDays"
          render={({ field }) => {
            /*
             * Re-sorted into week order on every change rather than appended,
             * so the value this form holds is the value the backend would store
             * — `compareWeekdays` sorts the array server-side, and a client that
             * did not would show the week re-ordering itself on the first save.
             */
            const toggle = (day: Weekday) => {
              const next = field.value.includes(day)
                ? field.value.filter((selected) => selected !== day)
                : WEEKDAYS.filter(
                    (candidate) => candidate === day || field.value.includes(candidate),
                  );

              field.onChange(next);
            };

            return (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={sameDays(field.value, WEEKDAY_PRESET) ? 'default' : 'outline'}
                    disabled={readOnly}
                    onClick={() => field.onChange([...WEEKDAY_PRESET])}
                  >
                    {t('workSchedule.workingDays.presets.weekdays')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sameDays(field.value, FULL_WEEK_PRESET) ? 'default' : 'outline'}
                    disabled={readOnly}
                    onClick={() => field.onChange([...FULL_WEEK_PRESET])}
                  >
                    {t('workSchedule.workingDays.presets.fullWeek')}
                  </Button>
                </div>

                {/*
                 * `role="group"` with a name, so the seven buttons are announced
                 * as one control rather than as seven unrelated ones — and
                 * `aria-describedby` ties the "at least one day" message to the
                 * group, since the message is about the set and not about any
                 * single day.
                 */}
                <div
                  role="group"
                  aria-label={t('workSchedule.workingDays.groupLabel')}
                  aria-describedby={error === undefined ? undefined : errorId}
                  className="grid grid-cols-7 gap-1.5 sm:gap-2"
                >
                  {weekdays.map((weekday) => (
                    <WeekdayToggle
                      key={weekday.value}
                      label={weekday.label}
                      short={weekday.short}
                      pressed={field.value.includes(weekday.value)}
                      disabled={readOnly}
                      onToggle={() => toggle(weekday.value)}
                    />
                  ))}
                </div>

                {error !== undefined && (
                  <p id={errorId} role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </>
            );
          }}
        />

        <Controller
          control={control}
          name="weekStartsOn"
          render={({ field, fieldState }) => (
            <FormSelectField
              label={t('workSchedule.fields.weekStartsOn')}
              description={t('workSchedule.fields.weekStartsOnHint')}
              value={field.value}
              onChange={field.onChange}
              options={weekdays}
              error={fieldState.error?.message}
              disabled={readOnly}
              className="sm:max-w-xs"
            />
          )}
        />

        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          {t('workSchedule.workingDays.note')}
        </p>
      </CardContent>
    </Card>
  );
};
