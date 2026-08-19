import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormField } from '@/components/form/FormField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { rejectedFields } from '@/lib/form-errors';

import { PHONE_MAX_LENGTH, type ProfilePhoneInput, type ProfilePhoneValues } from '../profile-schemas';
import { useUpdatePhone } from '../useProfile';
import { useProfileSchemas } from '../useProfileSchemas';

const FIELDS = ['phone'] as const;

export interface ProfilePhoneFormProps {
  /** The stored number, or `null` when there is none. */
  phone: string | null;
}

/**
 * The only editable thing on this screen: a phone number.
 *
 * One field is not an oversimplified first version — it is the complete list.
 * `PATCH /api/v1/profile/me` accepts `phone`, `colorScheme` and `cornerRadius`,
 * the last two are the theme pickers, and the body is whitelisted with
 * `forbidNonWhitelisted`, so anything else in the payload is a `400` naming the
 * offending property rather than a value quietly dropped.
 *
 * ## Clearing it is a request, not an omission
 *
 * Emptying the input and saving sends `phone: null`, which erases the stored
 * number — a different request from leaving the field alone, and one that has to
 * stay possible for somebody who no longer wants a number on file. The schema
 * does the `'' → null` conversion, so this component never decides it twice; see
 * `profile-schemas.ts`.
 *
 * ## The button is disabled until something changes
 *
 * A `PATCH` that names nothing writes nothing and answers the profile unchanged
 * — the backend is explicit that this is not an error — so an untouched submit
 * would be a request, a success toast, and no change to report. `isDirty` turns
 * that into a button that says there is nothing to save.
 *
 * `reset` on success re-baselines the form against what was actually stored, so
 * the field stops being dirty and shows the server's trimmed value rather than
 * what was typed.
 */
export const ProfilePhoneForm = ({ phone }: ProfilePhoneFormProps) => {
  const { t } = useTranslation();
  const { profilePhoneSchema } = useProfileSchemas();
  const updatePhone = useUpdatePhone();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfilePhoneInput, unknown, ProfilePhoneValues>({
    resolver: zodResolver(profilePhoneSchema),
    defaultValues: { phone: phone ?? '' },
  });

  const onSubmit = handleSubmit((values) => {
    updatePhone.mutate(
      { phone: values.phone },
      {
        onSuccess: (profile) => {
          reset({ phone: profile.employee?.phone ?? '' });
        },
        onError: (error) => {
          for (const field of rejectedFields(error, FIELDS)) {
            setError(field, { type: 'server' });
          }
        },
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:max-w-sm">
      <FormField
        label={t('profile.phone.label')}
        error={errors.phone?.message}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={PHONE_MAX_LENGTH}
        placeholder={t('profile.phone.placeholder')}
        {...register('phone')}
      />

      <p className="text-sm text-muted-foreground">{t('profile.phone.hint')}</p>

      <SubmitButton
        pending={updatePhone.isPending}
        disabled={!isDirty || updatePhone.isPending}
        className="justify-self-start"
      >
        {t('actions.save')}
      </SubmitButton>
    </form>
  );
};
