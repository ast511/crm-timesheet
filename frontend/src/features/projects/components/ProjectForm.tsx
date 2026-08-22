import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormColorField } from '@/components/form/FormColorField';
import { FormDateField } from '@/components/form/FormDateField';
import { FormField } from '@/components/form/FormField';
import { FormSelectField, type FormSelectOption } from '@/components/form/FormSelectField';
import { FormSwitchField } from '@/components/form/FormSwitchField';
import { FormTextareaField } from '@/components/form/FormTextareaField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Button } from '@/components/ui/button';
import type { CommonKey } from '@/i18n/keys';
import { useServerFieldErrors } from '@/hooks/useServerFieldErrors';
import { toCalendarDateInput } from '@/lib/datetime';

import { isProjectConflict, useProjectErrorMessage } from '../project-errors';
import {
  PROJECT_CLIENT_NAME_MAX_LENGTH,
  PROJECT_CODE_MAX_LENGTH,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_MAX_ESTIMATED_HOURS,
  PROJECT_MIN_ESTIMATED_HOURS,
  PROJECT_NAME_MAX_LENGTH,
  type ProjectFormInput,
  type ProjectFormValues,
} from '../project-schemas';
import {
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
} from '../projects-api';
import { useCreateProject, useUpdateProject } from '../useProjects';
import { useProjectSchemas } from '../useProjectSchemas';

/**
 * The fields a `VALIDATION_ERROR` can be mapped back onto.
 *
 * Eight rather than six, because two of this endpoint's rules are checked in
 * the *service* and answer in the `ValidationPipe`'s own shape — the date
 * ordering (`endDate must not be before startDate`) and the estimate's bounds —
 * and every one of those lines begins with the property it is about, which is
 * exactly what `rejectedFields` reads.
 */
const FIELDS = [
  'code',
  'name',
  'clientName',
  'description',
  'estimatedHours',
  'color',
  'startDate',
  'endDate',
] as const;

const STATUS_LABEL_KEYS = {
  ACTIVE: 'projects.status.active',
  ON_HOLD: 'projects.status.onHold',
  COMPLETED: 'projects.status.completed',
  CANCELLED: 'projects.status.cancelled',
} as const satisfies Record<ProjectStatus, CommonKey>;

const PRIORITY_LABEL_KEYS = {
  LOW: 'projects.priority.low',
  MEDIUM: 'projects.priority.medium',
  HIGH: 'projects.priority.high',
} as const satisfies Record<ProjectPriority, CommonKey>;

/**
 * What a brand-new project starts as.
 *
 * `projectStatus: 'ACTIVE'`, `projectPriority: 'MEDIUM'` and
 * `isArchived: false` are the schema defaults the backend applies when a `POST`
 * omits them — `CreateProjectDto` deliberately does not repeat them, so that
 * "a new project is active, medium priority and not archived" stays one
 * decision made in one place. Stating them here rather than leaving the
 * controls blank means the form shows what will actually be stored.
 *
 * `estimatedHours` starts **empty rather than at `0`**, which is the one place
 * this form departs from that pattern, and deliberately: `0` is not a neutral
 * starting value on this column, it is the contract's way of saying "not
 * estimated yet". Pre-filling it would record that claim on every project
 * nobody thought about the estimate for. The field is required, its placeholder
 * is `0` and its hint says what `0` means, so choosing it is one keystroke and
 * an act rather than a default.
 *
 * The dates start empty for a related reason: a project may be planned before
 * its dates are known, and a pre-filled today is the date nobody meant that
 * still saves cleanly.
 */
const emptyValues: ProjectFormInput = {
  code: '',
  name: '',
  clientName: '',
  description: '',
  estimatedHours: '',
  color: '',
  projectStatus: 'ACTIVE',
  projectPriority: 'MEDIUM',
  isArchived: false,
  startDate: '',
  endDate: '',
};

const toFormValues = (project: Project): ProjectFormInput => ({
  code: project.code,
  name: project.name,
  clientName: project.clientName,
  description: project.description ?? '',
  estimatedHours: String(project.estimatedHours),
  color: project.color ?? '',
  projectStatus: project.projectStatus,
  projectPriority: project.projectPriority,
  isArchived: project.isArchived,
  /*
   * The stored instants become the `yyyy-MM-dd` the date inputs read, in UTC —
   * the zone they were written in — so the day that comes back is the day that
   * was saved rather than the day it happens to be in the reader's zone. A
   * `null` is an *open* end of the range, not a missing value, and an empty
   * input is how the form spells that; the schema converts it straight back.
   */
  startDate: project.startDate === null ? '' : toCalendarDateInput(project.startDate),
  endDate: project.endDate === null ? '' : toCalendarDateInput(project.endDate),
});

export interface ProjectFormProps {
  /** The row being edited, or `undefined` to create a new one. */
  project?: Project;
  /** Called once the write has succeeded — the dialog closes on it. */
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * One form for both writes, over the richest entity in the application.
 *
 * `POST` and `PATCH` take the same fields — `UpdateProjectDto` is
 * `CreateProjectDto` with everything optional — so a second component would be
 * the same eleven inputs kept in step by hand. Which mutation runs is the only
 * difference, and it follows from whether a row was passed in.
 *
 * The update sends **every** field rather than only the changed ones. A `PATCH`
 * naming a field with its current value is a no-op on the server, and diffing
 * would buy nothing while introducing the classic bug where clearing a field
 * looks identical to not touching it — which on this endpoint is a real
 * distinction three times over: `description: null` clears the column,
 * `color: null` clears the accent, and each date's `null` clears that end of
 * the schedule, while `undefined` would leave all of them alone.
 *
 * Sending both dates on every `PATCH` also settles the ordering rule the
 * cleanest way. The service resolves the range against what is *stored* when
 * the body omits an end — deliberately, so patching only `endDate` is judged
 * against the existing `startDate` — and a body that always names both is one
 * the resolution has nothing to do to.
 *
 * ## Members are not here, and that is the whole of it
 *
 * Neither DTO carries a member and neither does this form. Who is on a project,
 * who manages it and when they joined are the `/projects/{id}/members`
 * resource, with its own endpoints and its own feature; putting a roster in
 * this dialog would be a second way to write data this screen does not own.
 *
 * ## Where a failure is shown
 *
 * A rejected save happens with the form still open, so it is reported here
 * rather than as a toast — the rule `CLAUDE.md` states for validation. Two
 * shapes reach this point:
 *
 * - a `VALIDATION_ERROR`, whose `details` name the fields the backend refused,
 *   which are marked invalid;
 * - a `409`, which on this endpoint can only be a `code` that is already taken
 *   — `Project.code` is the single unique column, and `assertCodeIsFree` is the
 *   only place a conflict is raised on either verb. So unlike the sibling
 *   screens, this one **marks the offending field** as well as explaining it.
 *   The inference is argued in `project-errors.ts`.
 */
export const ProjectForm = ({ project, onSaved, onCancel }: ProjectFormProps) => {
  const { t } = useTranslation();
  const { projectSchema } = useProjectSchemas();
  const describeError = useProjectErrorMessage('duplicateCode');
  const markRejectedFields = useServerFieldErrors<ProjectFormInput>();

  const create = useCreateProject();
  const update = useUpdateProject();
  const mutation = project === undefined ? create : update;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProjectFormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: project === undefined ? emptyValues : toFormValues(project),
  });

  const statusOptions: FormSelectOption<ProjectStatus>[] = PROJECT_STATUS_OPTIONS.map(
    (status) => ({ value: status, label: t(STATUS_LABEL_KEYS[status]) }),
  );

  const priorityOptions: FormSelectOption<ProjectPriority>[] = PROJECT_PRIORITY_OPTIONS.map(
    (priority) => ({ value: priority, label: t(PRIORITY_LABEL_KEYS[priority]) }),
  );

  const onSubmit = handleSubmit((values: ProjectFormValues) => {
    const onError = (error: unknown) => {
      /*
       * A `409` carries no `details`, so `rejectedFields` cannot see it — it
       * gates on `VALIDATION_ERROR` by design. The field is named here instead,
       * from what the contract guarantees rather than from the message: `code`
       * is the only unique column on this table.
       *
       * The sentence goes **on the field** rather than in the form-level alert,
       * and the alert suppresses conflicts for exactly that reason — printing
       * the same sentence twice would be noise, and this one belongs beside the
       * input somebody has to change. Passing the `message` is also what marks
       * the input: `FormField` derives `aria-invalid` from whether there is one,
       * so a `setError` with only a `type` would style and announce the field as
       * valid while refusing to submit it. `useServerFieldErrors` is that same
       * rule applied to the `VALIDATION_ERROR` path, for every form.
       */
      if (isProjectConflict(error)) {
        setError('code', { type: 'server', message: describeError(error) });

        return;
      }

      markRejectedFields(error, FIELDS, setError);
    };

    if (project === undefined) {
      create.mutate(values, { onSuccess: onSaved, onError });

      return;
    }

    update.mutate({ id: project.id, body: values }, { onSuccess: onSaved, onError });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {/*
       * Everything except the duplicate code, which `onSubmit` puts on the
       * `Cod` field instead — see there. A `VALIDATION_ERROR`, a `403` or a
       * dead network has no field of its own to sit beside, so it is reported
       * here at the top of the form, where it is visible without scrolling.
       */}
      <FormAlert
        message={
          mutation.error === null || isProjectConflict(mutation.error)
            ? undefined
            : describeError(mutation.error)
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
         * `className="uppercase"` shows what the schema and the DTO both do to
         * the value anyway, so the field does not appear to accept a lowercase
         * code and then store something else.
         */}
        <FormField
          label={t('projects.fields.code')}
          error={errors.code?.message}
          maxLength={PROJECT_CODE_MAX_LENGTH}
          placeholder={t('projects.fields.codePlaceholder')}
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase"
          {...register('code')}
        />

        <FormField
          label={t('projects.fields.name')}
          error={errors.name?.message}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          placeholder={t('projects.fields.namePlaceholder')}
          {...register('name')}
        />
      </div>

      <FormField
        label={t('projects.fields.clientName')}
        error={errors.clientName?.message}
        maxLength={PROJECT_CLIENT_NAME_MAX_LENGTH}
        placeholder={t('projects.fields.clientNamePlaceholder')}
        {...register('clientName')}
      />

      {/*
       * The hint sits under `clientName` because the field looks optional and
       * is not: an internal project names the company itself rather than
       * leaving this empty, which is why the column is not nullable.
       */}
      <p className="-mt-3 text-sm text-muted-foreground">
        {t('projects.fields.clientNameHint')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          name="projectStatus"
          control={control}
          render={({ field }) => (
            <FormSelectField
              label={t('projects.fields.status')}
              value={field.value}
              onChange={field.onChange}
              options={statusOptions}
              error={errors.projectStatus?.message}
            />
          )}
        />

        <Controller
          name="projectPriority"
          control={control}
          render={({ field }) => (
            <FormSelectField
              label={t('projects.fields.priority')}
              value={field.value}
              onChange={field.onChange}
              options={priorityOptions}
              error={errors.projectPriority?.message}
            />
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t('projects.fields.estimatedHours')}
          error={errors.estimatedHours?.message}
          type="number"
          inputMode="numeric"
          min={PROJECT_MIN_ESTIMATED_HOURS}
          max={PROJECT_MAX_ESTIMATED_HOURS}
          step={1}
          placeholder={t('projects.fields.estimatedHoursPlaceholder')}
          {...register('estimatedHours')}
        />

        <Controller
          name="color"
          control={control}
          render={({ field }) => (
            <FormColorField
              label={t('projects.fields.color')}
              value={field.value}
              onChange={field.onChange}
              hint={t('projects.fields.colorHint')}
              pickerLabel={t('projects.fields.colorPicker')}
              clearLabel={t('projects.fields.colorClear')}
              error={errors.color?.message}
            />
          )}
        />
      </div>

      <p className="-mt-3 text-sm text-muted-foreground">
        {t('projects.fields.estimatedHoursHint')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormDateField
          label={t('projects.fields.startDate')}
          error={errors.startDate?.message}
          {...register('startDate')}
        />

        <FormDateField
          label={t('projects.fields.endDate')}
          error={errors.endDate?.message}
          {...register('endDate')}
        />
      </div>

      {/*
       * Attached to the dates rather than to either field, because it is about
       * the pair: both ends are optional, and leaving one empty is a statement
       * that this end is not settled rather than a field somebody forgot.
       */}
      <p className="-mt-3 text-sm text-muted-foreground">{t('projects.fields.datesHint')}</p>

      <FormTextareaField
        label={t('projects.fields.description')}
        error={errors.description?.message}
        maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
        placeholder={t('projects.fields.descriptionPlaceholder')}
        rows={3}
        {...register('description')}
      />

      <div className="grid gap-4 rounded-lg border p-4">
        <Controller
          name="isArchived"
          control={control}
          render={({ field }) => (
            <FormSwitchField
              label={t('projects.fields.isArchived')}
              description={t('projects.fields.isArchivedHint')}
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
