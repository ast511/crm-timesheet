import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormField } from '@/components/form/FormField';
import { FormSwitchField } from '@/components/form/FormSwitchField';
import { FormTextareaField } from '@/components/form/FormTextareaField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Button } from '@/components/ui/button';
import { useServerFieldErrors } from '@/hooks/useServerFieldErrors';

import { useDepartmentErrorMessage } from '../department-errors';
import {
  DEPARTMENT_CODE_MAX_LENGTH,
  DEPARTMENT_DESCRIPTION_MAX_LENGTH,
  DEPARTMENT_NAME_MAX_LENGTH,
  type DepartmentFormInput,
  type DepartmentFormValues,
} from '../department-schemas';
import type { Department } from '../departments-api';
import { useCreateDepartment, useUpdateDepartment } from '../useDepartments';
import { useDepartmentSchemas } from '../useDepartmentSchemas';

/** The fields a `VALIDATION_ERROR` can be mapped back onto. */
const FIELDS = ['code', 'name', 'description'] as const;

/**
 * What a brand-new department starts as.
 *
 * `isActive: true` is the schema default the backend applies when a `POST`
 * omits it — `CreateDepartmentDto` deliberately does not repeat it, so that "a
 * new department is active" stays one decision made in one place. Stating it
 * here rather than leaving the switch blank means the form shows what will
 * actually be stored.
 */
const emptyValues: DepartmentFormInput = {
  code: '',
  name: '',
  description: '',
  isActive: true,
};

const toFormValues = (department: Department): DepartmentFormInput => ({
  code: department.code,
  name: department.name,
  description: department.description ?? '',
  isActive: department.isActive,
});

export interface DepartmentFormProps {
  /** The row being edited, or `undefined` to create a new one. */
  department?: Department;
  /** Called once the write has succeeded — the dialog closes on it. */
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * One form for both writes.
 *
 * `POST` and `PATCH` take the same fields — `UpdateDepartmentDto` is
 * `CreateDepartmentDto` with everything optional — so a second component would
 * be the same four inputs kept in step by hand. Which mutation runs is the only
 * difference, and it follows from whether a row was passed in.
 *
 * The update sends **every** field rather than only the changed ones. A `PATCH`
 * that names a field with its current value is a no-op on the server, and
 * diffing would buy nothing while introducing the classic bug where clearing a
 * field looks identical to not touching it — which on this endpoint is a real
 * distinction, since `description: null` clears the column and `undefined`
 * leaves it alone.
 *
 * ## Where a failure is shown
 *
 * A rejected save happens with the form still open, so it is reported here
 * rather than as a toast — the rule `CLAUDE.md` states for validation. Two
 * shapes reach this point: a `VALIDATION_ERROR`, whose `details` name the fields
 * the backend refused, which are marked invalid; and a `409`, which on this
 * endpoint can only be a `code` or a `name` that is already taken.
 * `useDepartmentErrorMessage` turns the second into a sentence that says so,
 * because the backend sends no `errorCode` for it and the generic "conflicts
 * with existing data" would tell nobody what to change. Why it names both fields
 * instead of marking one is argued in `department-errors.ts`.
 */
export const DepartmentForm = ({ department, onSaved, onCancel }: DepartmentFormProps) => {
  const { t } = useTranslation();
  const { departmentSchema } = useDepartmentSchemas();
  const describeError = useDepartmentErrorMessage('duplicate');
  const markRejectedFields = useServerFieldErrors<DepartmentFormInput>();

  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const mutation = department === undefined ? create : update;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DepartmentFormInput, unknown, DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: department === undefined ? emptyValues : toFormValues(department),
  });

  const onSubmit = handleSubmit((values: DepartmentFormValues) => {
    const onError = (error: unknown) => {
      markRejectedFields(error, FIELDS, setError);
    };

    if (department === undefined) {
      create.mutate(values, { onSuccess: onSaved, onError });

      return;
    }

    update.mutate({ id: department.id, body: values }, { onSuccess: onSaved, onError });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert message={mutation.error === null ? undefined : describeError(mutation.error)} />

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
         * `className="uppercase"` shows what the schema and the DTO both do to
         * the value anyway, so the field does not appear to accept a lowercase
         * code and then store something else.
         */}
        <FormField
          label={t('departments.fields.code')}
          error={errors.code?.message}
          maxLength={DEPARTMENT_CODE_MAX_LENGTH}
          placeholder={t('departments.fields.codePlaceholder')}
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase"
          {...register('code')}
        />

        <FormField
          label={t('departments.fields.name')}
          error={errors.name?.message}
          maxLength={DEPARTMENT_NAME_MAX_LENGTH}
          placeholder={t('departments.fields.namePlaceholder')}
          {...register('name')}
        />
      </div>

      <FormTextareaField
        label={t('departments.fields.description')}
        error={errors.description?.message}
        maxLength={DEPARTMENT_DESCRIPTION_MAX_LENGTH}
        placeholder={t('departments.fields.descriptionPlaceholder')}
        rows={3}
        {...register('description')}
      />

      <div className="grid gap-4 rounded-lg border p-4">
        <Controller
          name="isActive"
          control={control}
          render={({ field }) => (
            <FormSwitchField
              label={t('departments.fields.isActive')}
              description={t('departments.fields.isActiveHint')}
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
