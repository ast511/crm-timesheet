import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormField } from '@/components/form/FormField';
import { FormSwitchField } from '@/components/form/FormSwitchField';
import { FormTextareaField } from '@/components/form/FormTextareaField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Button } from '@/components/ui/button';
import { rejectedFields } from '@/lib/form-errors';

import { useLeaveTypeErrorMessage } from '../leave-type-errors';
import { DEFAULT_LEAVE_TYPE_ICON } from '../leave-type-icons';
import {
  LEAVE_TYPE_CODE_MAX_LENGTH,
  LEAVE_TYPE_DESCRIPTION_MAX_LENGTH,
  LEAVE_TYPE_LABEL_MAX_LENGTH,
  LEAVE_TYPE_MAX_ALLOCATED_DAYS,
  LEAVE_TYPE_MIN_ALLOCATED_DAYS,
  LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH,
  type LeaveTypeFormInput,
  type LeaveTypeFormValues,
} from '../leave-type-schemas';
import type { LeaveType } from '../leave-types-api';
import { useCreateLeaveType, useUpdateLeaveType } from '../useLeaveTypes';
import { useLeaveTypeSchemas } from '../useLeaveTypeSchemas';
import { LeaveTypeColorField } from './LeaveTypeColorField';
import { LeaveTypeIconField } from './LeaveTypeIconField';

/** The fields a `VALIDATION_ERROR` can be mapped back onto. */
const FIELDS = [
  'code',
  'label',
  'reportMarker',
  'icon',
  'color',
  'description',
  'defaultAllocatedDays',
  'maxCarryOverDays',
] as const;

/** A number the inputs can hold: `null` is the empty field, not a `0`. */
const toInput = (value: number | null): string => (value === null ? '' : String(value));

/**
 * What a brand-new leave type starts as.
 *
 * The three `true`s are the schema defaults the backend applies when a `POST`
 * omits them — a new type is available, paid and approved — and `false` for
 * carry-over is its conservative default: a type carries nothing over until
 * somebody says it does. Stating them here rather than leaving the fields blank
 * means the form shows what will actually be stored.
 */
const emptyValues: LeaveTypeFormInput = {
  code: '',
  label: '',
  reportMarker: '',
  icon: DEFAULT_LEAVE_TYPE_ICON,
  color: '',
  description: '',
  defaultAllocatedDays: '',
  allowsCarryOver: false,
  maxCarryOverDays: '',
  requiresApproval: true,
  isPaid: true,
  isActive: true,
};

const toFormValues = (leaveType: LeaveType): LeaveTypeFormInput => ({
  code: leaveType.code,
  label: leaveType.label,
  reportMarker: leaveType.reportMarker,
  icon: leaveType.icon,
  color: leaveType.color ?? '',
  description: leaveType.description ?? '',
  defaultAllocatedDays: toInput(leaveType.defaultAllocatedDays),
  allowsCarryOver: leaveType.allowsCarryOver,
  maxCarryOverDays: toInput(leaveType.maxCarryOverDays),
  requiresApproval: leaveType.requiresApproval,
  isPaid: leaveType.isPaid,
  isActive: leaveType.isActive,
});

export interface LeaveTypeFormProps {
  /** The row being edited, or `undefined` to create a new one. */
  leaveType?: LeaveType;
  /** Called once the write has succeeded — the dialog closes on it. */
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * One form for both writes.
 *
 * `POST` and `PATCH` take the same fields — `UpdateLeaveTypeDto` is
 * `CreateLeaveTypeDto` with everything optional — so a second component would
 * be the same twelve inputs kept in step by hand. Which mutation runs is the
 * only difference, and it follows from whether a row was passed in.
 *
 * The update sends **every** field rather than only the changed ones. A
 * `PATCH` that names a field with its current value is a no-op on the server,
 * and diffing would buy nothing while introducing the classic bug where
 * clearing a field looks identical to not touching it.
 *
 * ## Where a failure is shown
 *
 * A rejected save happens with the form still open, so it is reported here
 * rather than as a toast — the rule `CLAUDE.md` states for validation. Two
 * shapes reach this point: a `VALIDATION_ERROR`, whose `details` name the
 * fields the backend refused, which are marked invalid; and a `409`, which on
 * this endpoint can only be a `code`, `label` or `reportMarker` that is already
 * taken. `useLeaveTypeErrorMessage` turns the second into a sentence that says
 * so, because the backend sends no `errorCode` for it and the generic
 * "conflicts with existing data" would tell nobody what to change.
 */
export const LeaveTypeForm = ({ leaveType, onSaved, onCancel }: LeaveTypeFormProps) => {
  const { t } = useTranslation();
  const { leaveTypeSchema } = useLeaveTypeSchemas();
  const describeError = useLeaveTypeErrorMessage('duplicate');

  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const mutation = leaveType === undefined ? create : update;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LeaveTypeFormInput, unknown, LeaveTypeFormValues>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: leaveType === undefined ? emptyValues : toFormValues(leaveType),
  });

  /*
   * `useWatch` rather than the form's own `watch`: it subscribes to this one
   * field instead of re-rendering the whole form on every keystroke anywhere in
   * it, and it is the variant React Compiler can reason about.
   */
  const allowsCarryOver = useWatch({ control, name: 'allowsCarryOver' });

  const onSubmit = handleSubmit((values: LeaveTypeFormValues) => {
    const onError = (error: unknown) => {
      for (const field of rejectedFields(error, FIELDS)) {
        setError(field, { type: 'server' });
      }
    };

    if (leaveType === undefined) {
      create.mutate(values, { onSuccess: onSaved, onError });

      return;
    }

    update.mutate({ id: leaveType.id, body: values }, { onSuccess: onSaved, onError });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert
        message={mutation.error === null ? undefined : describeError(mutation.error)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t('leaveTypes.fields.code')}
          error={errors.code?.message}
          maxLength={LEAVE_TYPE_CODE_MAX_LENGTH}
          placeholder={t('leaveTypes.fields.codePlaceholder')}
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase"
          {...register('code')}
        />

        <FormField
          label={t('leaveTypes.fields.reportMarker')}
          error={errors.reportMarker?.message}
          maxLength={LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH}
          placeholder={t('leaveTypes.fields.reportMarkerPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase"
          {...register('reportMarker')}
        />
      </div>

      <FormField
        label={t('leaveTypes.fields.label')}
        error={errors.label?.message}
        maxLength={LEAVE_TYPE_LABEL_MAX_LENGTH}
        placeholder={t('leaveTypes.fields.labelPlaceholder')}
        {...register('label')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          name="icon"
          control={control}
          render={({ field }) => (
            <LeaveTypeIconField
              label={t('leaveTypes.fields.icon')}
              value={field.value}
              onChange={field.onChange}
              error={errors.icon?.message}
            />
          )}
        />

        <Controller
          name="color"
          control={control}
          render={({ field }) => (
            <LeaveTypeColorField
              label={t('leaveTypes.fields.color')}
              value={field.value}
              onChange={field.onChange}
              error={errors.color?.message}
            />
          )}
        />
      </div>

      <FormTextareaField
        label={t('leaveTypes.fields.description')}
        error={errors.description?.message}
        maxLength={LEAVE_TYPE_DESCRIPTION_MAX_LENGTH}
        placeholder={t('leaveTypes.fields.descriptionPlaceholder')}
        rows={3}
        {...register('description')}
      />

      <FormField
        label={t('leaveTypes.fields.defaultAllocatedDays')}
        error={errors.defaultAllocatedDays?.message}
        type="number"
        inputMode="numeric"
        min={LEAVE_TYPE_MIN_ALLOCATED_DAYS}
        max={LEAVE_TYPE_MAX_ALLOCATED_DAYS}
        step={1}
        placeholder={t('leaveTypes.fields.defaultAllocatedDaysPlaceholder')}
        {...register('defaultAllocatedDays')}
      />

      <div className="grid gap-4 rounded-lg border p-4">
        <Controller
          name="isActive"
          control={control}
          render={({ field }) => (
            <FormSwitchField
              label={t('leaveTypes.fields.isActive')}
              description={t('leaveTypes.fields.isActiveHint')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        <Controller
          name="isPaid"
          control={control}
          render={({ field }) => (
            <FormSwitchField
              label={t('leaveTypes.fields.isPaid')}
              description={t('leaveTypes.fields.isPaidHint')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        <Controller
          name="requiresApproval"
          control={control}
          render={({ field }) => (
            <FormSwitchField
              label={t('leaveTypes.fields.requiresApproval')}
              description={t('leaveTypes.fields.requiresApprovalHint')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        <Controller
          name="allowsCarryOver"
          control={control}
          render={({ field }) => (
            <FormSwitchField
              label={t('leaveTypes.fields.allowsCarryOver')}
              description={t('leaveTypes.fields.allowsCarryOverHint')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        {/*
         * Kept visible and disabled rather than removed while carry-over is
         * off. The ceiling belongs to the same policy, so hiding it makes the
         * switch look like it has no consequence — and removing the input
         * would discard a ceiling already stored on the record.
         */}
        <FormField
          label={t('leaveTypes.fields.maxCarryOverDays')}
          error={errors.maxCarryOverDays?.message}
          type="number"
          inputMode="numeric"
          min={LEAVE_TYPE_MIN_ALLOCATED_DAYS}
          max={LEAVE_TYPE_MAX_ALLOCATED_DAYS}
          step={1}
          disabled={!allowsCarryOver}
          placeholder={t('leaveTypes.fields.maxCarryOverDaysPlaceholder')}
          fieldClassName={allowsCarryOver ? undefined : 'opacity-60'}
          {...register('maxCarryOverDays')}
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