import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormDateField } from '@/components/form/FormDateField';
import { FormField } from '@/components/form/FormField';
import { FormSelectField, type FormSelectOption } from '@/components/form/FormSelectField';
import { FormSwitchField } from '@/components/form/FormSwitchField';
import { FormTextareaField } from '@/components/form/FormTextareaField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Button } from '@/components/ui/button';
import { toCalendarDateInput } from '@/lib/datetime';
import { rejectedFields } from '@/lib/form-errors';

import { usePublicHolidayErrorMessage } from '../public-holiday-errors';
import {
  HOLIDAY_TYPE_OPTIONS,
  PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH,
  PUBLIC_HOLIDAY_MAX_YEAR,
  PUBLIC_HOLIDAY_MIN_YEAR,
  PUBLIC_HOLIDAY_NAME_MAX_LENGTH,
  type PublicHolidayFormInput,
  type PublicHolidayFormValues,
} from '../public-holiday-schemas';
import type { HolidayType, PublicHoliday } from '../public-holidays-api';
import { useCreatePublicHoliday, useUpdatePublicHoliday } from '../usePublicHolidays';
import { usePublicHolidaySchemas } from '../usePublicHolidaySchemas';

/**
 * The fields a `VALIDATION_ERROR` can be mapped back onto.
 *
 * Six rather than four, because three of this endpoint's rules are *service*
 * checks that answer in the `ValidationPipe`'s own shape — `endDate must not be
 * before startDate`, `validToYear must not be before validFromYear`, and
 * `validFromYear and validToYear apply to FIXED holidays only` — and every one
 * of those lines begins with the property it is about, which is exactly what
 * `rejectedFields` reads.
 */
const FIELDS = [
  'name',
  'description',
  'startDate',
  'endDate',
  'validFromYear',
  'validToYear',
] as const;

/**
 * What a brand-new holiday starts as.
 *
 * `FIXED` because a statutory calendar is mostly recurring days, and
 * `isNational: true` because it is the schema default the backend applies when
 * a `POST` omits it — `CreatePublicHolidayDto` deliberately does not repeat it,
 * so that "a new holiday is national" stays one decision made in one place.
 * Stating both here rather than leaving the controls blank means the form shows
 * what will actually be stored.
 *
 * The dates start empty rather than at today: a holiday is a specific day
 * somebody has in mind, and a pre-filled date is the one nobody meant that
 * still saves cleanly.
 */
const emptyValues: PublicHolidayFormInput = {
  name: '',
  description: '',
  type: 'FIXED',
  isNational: true,
  startDate: '',
  endDate: '',
  validFromYear: '',
  validToYear: '',
};

const toFormValues = (holiday: PublicHoliday): PublicHolidayFormInput => ({
  name: holiday.name,
  description: holiday.description ?? '',
  type: holiday.type,
  isNational: holiday.isNational,
  /*
   * The stored instants become the `yyyy-MM-dd` the date inputs read, in UTC —
   * the zone they were written in — so the day that comes back is the day that
   * was saved rather than the day it happens to be in the reader's zone.
   */
  startDate: toCalendarDateInput(holiday.startDate),
  endDate: toCalendarDateInput(holiday.endDate),
  /*
   * `null` is an *open* end of the range, not a missing number, and an empty
   * input is how the form spells that. The schema converts it straight back.
   */
  validFromYear: holiday.validFromYear === null ? '' : String(holiday.validFromYear),
  validToYear: holiday.validToYear === null ? '' : String(holiday.validToYear),
});

export interface PublicHolidayFormProps {
  /** The row being edited, or `undefined` to create a new one. */
  holiday?: PublicHoliday;
  /** Called once the write has succeeded — the dialog closes on it. */
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * One form for both writes, and the first in this application whose fields
 * depend on one of its own values.
 *
 * `POST` and `PATCH` take the same fields — `UpdatePublicHolidayDto` is
 * `CreatePublicHolidayDto` with everything optional — so a second component
 * would be the same seven inputs kept in step by hand. Which mutation runs is
 * the only difference, and it follows from whether a row was passed in.
 *
 * The update sends **every** field rather than only the changed ones. A `PATCH`
 * naming a field with its current value is a no-op on the server, and diffing
 * would buy nothing while introducing the classic bug where clearing a field
 * looks identical to not touching it — which on this endpoint is a real
 * distinction, since `description: null` clears the column and `undefined`
 * leaves it alone, and the same is true of each end of the validity range.
 *
 * ## The type decides which fields exist
 *
 * `validFromYear` / `validToYear` are shown only for a `FIXED` holiday, because
 * they only *mean* anything for one: a `VARIABLE` row already is one year, so
 * the backend answers `400` to a range on it. Two things make that safe rather
 * than merely tidy:
 *
 * - Choosing `VARIABLE` **clears** both inputs, so a range typed before the
 *   switch is gone rather than hidden and still in the form state — which
 *   matters when the type is switched back.
 * - The schema's output for a `VARIABLE` holiday **has no such keys**, so even
 *   a value that survived could not reach the wire. The rule is enforced by the
 *   type rather than by this component remembering it, which is argued at
 *   length in `public-holiday-schemas.ts`.
 *
 * On a `PATCH` that reclassifies a holiday as `VARIABLE`, omitting the keys is
 * also exactly right: `mergeFacts` clears the stored range when the resolved
 * type is variable, so the row ends up consistent without this form having to
 * ask for it.
 *
 * ## Where a failure is shown
 *
 * A rejected save happens with the form still open, so it is reported here
 * rather than as a toast — the rule `CLAUDE.md` states for validation. Two
 * shapes reach this point: a `VALIDATION_ERROR`, whose `details` name the
 * fields the backend refused, which are marked invalid; and a `409`, which on
 * this endpoint means the day is already taken — by a recurring holiday sharing
 * the month and day in overlapping years, or by a variable holiday of the same
 * name starting the same day. `usePublicHolidayErrorMessage` picks the sentence
 * from the type currently in the form, since that is the rule that applies.
 */
export const PublicHolidayForm = ({ holiday, onSaved, onCancel }: PublicHolidayFormProps) => {
  const { t } = useTranslation();
  const { publicHolidaySchema } = usePublicHolidaySchemas();
  const prefersReducedMotion = useReducedMotion();

  const create = useCreatePublicHoliday();
  const update = useUpdatePublicHoliday();
  const mutation = holiday === undefined ? create : update;

  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<PublicHolidayFormInput, unknown, PublicHolidayFormValues>({
    resolver: zodResolver(publicHolidaySchema),
    defaultValues: holiday === undefined ? emptyValues : toFormValues(holiday),
  });

  /*
   * `useWatch` rather than `watch('type')`: the subscription hook re-renders
   * only this component when the type changes, and — unlike the function
   * `useForm` returns — it is a value the React Compiler can memoise around.
   * The distinction matters here because the type drives which fields exist,
   * so it is read on every render.
   */
  const type = useWatch({ control, name: 'type' });
  const isFixed = type === 'FIXED';
  const describeError = usePublicHolidayErrorMessage(type);

  const typeOptions: FormSelectOption<HolidayType>[] = HOLIDAY_TYPE_OPTIONS.map((option) => ({
    value: option,
    label: option === 'FIXED' ? t('publicHolidays.flags.fixed') : t('publicHolidays.flags.variable'),
  }));

  /*
   * Most holidays are one day, which this API spells as the same date at both
   * ends — both are required, since the pair is the span and an open end would
   * leave every consumer guessing how long the company is shut. So picking a
   * start fills an *empty* end with it: the common case needs one interaction
   * instead of two, and a span that was already entered is never overwritten.
   */
  const startDateField = register('startDate');

  /*
   * Reclassifying as VARIABLE empties the range rather than leaving it hidden
   * in the form state, and drops any error it was carrying — an invalid value
   * in a field nobody can see would block a submit with nothing to point at.
   */
  const onTypeChange = (next: HolidayType) => {
    if (next !== 'VARIABLE') return;

    setValue('validFromYear', '');
    setValue('validToYear', '');
    clearErrors(['validFromYear', 'validToYear']);
  };

  const onSubmit = handleSubmit((values: PublicHolidayFormValues) => {
    const onError = (error: unknown) => {
      for (const field of rejectedFields(error, FIELDS)) {
        setError(field, { type: 'server' });
      }
    };

    if (holiday === undefined) {
      create.mutate(values, { onSuccess: onSaved, onError });

      return;
    }

    update.mutate({ id: holiday.id, body: values }, { onSuccess: onSaved, onError });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert message={mutation.error === null ? undefined : describeError(mutation.error)} />

      <FormField
        label={t('publicHolidays.fields.name')}
        error={errors.name?.message}
        maxLength={PUBLIC_HOLIDAY_NAME_MAX_LENGTH}
        placeholder={t('publicHolidays.fields.namePlaceholder')}
        {...register('name')}
      />

      <Controller
        name="type"
        control={control}
        render={({ field }) => (
          <FormSelectField
            label={t('publicHolidays.fields.type')}
            description={
              isFixed
                ? t('publicHolidays.fields.typeFixedHint')
                : t('publicHolidays.fields.typeVariableHint')
            }
            value={field.value}
            onChange={(next) => {
              field.onChange(next);
              onTypeChange(next);
            }}
            options={typeOptions}
            error={errors.type?.message}
          />
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormDateField
          label={t('publicHolidays.fields.startDate')}
          error={errors.startDate?.message}
          {...startDateField}
          onChange={(event) => {
            void startDateField.onChange(event);

            if (getValues('endDate') === '') {
              setValue('endDate', event.target.value, { shouldValidate: false });
            }
          }}
        />

        <FormDateField
          label={t('publicHolidays.fields.endDate')}
          error={errors.endDate?.message}
          {...register('endDate')}
        />
      </div>

      {/*
       * The hint is attached to the dates rather than to the type, because it
       * is about how *these two fields* are read: on a recurring holiday only
       * the day and the month are used, and the year is stored because a
       * timestamp column has nowhere else to put a date — it is not a claim
       * about which year the holiday applies to. That claim is the validity
       * range immediately below.
       */}
      {isFixed && (
        <p className="-mt-3 text-sm text-muted-foreground">
          {t('publicHolidays.fields.fixedDateHint')}
        </p>
      )}

      {/*
       * `AnimatePresence` rather than a Tailwind transition, for the reason
       * `FormAlert` uses it: the fields are added to and removed from the tree,
       * and an exit animation is the thing CSS alone cannot do. The movement
       * also *says* something — the section belongs to the choice just made
       * above it — which is what `CLAUDE.md` asks motion to be for.
       * `useReducedMotion` collapses it to an instant swap.
       */}
      <AnimatePresence initial={false}>
        {isFixed && (
          <motion.div
            key="validity"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion === true ? 0 : 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <fieldset className="grid gap-4 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">
                {t('publicHolidays.fields.validityLegend')}
              </legend>

              <p className="text-sm text-muted-foreground">
                {t('publicHolidays.fields.validityHint')}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t('publicHolidays.fields.validFromYear')}
                  error={errors.validFromYear?.message}
                  type="number"
                  inputMode="numeric"
                  min={PUBLIC_HOLIDAY_MIN_YEAR}
                  max={PUBLIC_HOLIDAY_MAX_YEAR}
                  placeholder={t('publicHolidays.fields.yearPlaceholder')}
                  {...register('validFromYear')}
                />

                <FormField
                  label={t('publicHolidays.fields.validToYear')}
                  error={errors.validToYear?.message}
                  type="number"
                  inputMode="numeric"
                  min={PUBLIC_HOLIDAY_MIN_YEAR}
                  max={PUBLIC_HOLIDAY_MAX_YEAR}
                  placeholder={t('publicHolidays.fields.yearPlaceholder')}
                  {...register('validToYear')}
                />
              </div>
            </fieldset>
          </motion.div>
        )}
      </AnimatePresence>

      <FormTextareaField
        label={t('publicHolidays.fields.description')}
        error={errors.description?.message}
        maxLength={PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH}
        placeholder={t('publicHolidays.fields.descriptionPlaceholder')}
        rows={3}
        {...register('description')}
      />

      <div className="grid gap-4 rounded-lg border p-4">
        <Controller
          name="isNational"
          control={control}
          render={({ field }) => (
            <FormSwitchField
              label={t('publicHolidays.fields.isNational')}
              description={t('publicHolidays.fields.isNationalHint')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <SubmitButton pending={mutation.isPending}>{t('actions.save')}</SubmitButton>
      </div>
    </form>
  );
};
