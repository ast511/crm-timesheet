import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormField } from '@/components/form/FormField';
import { SubmitButton } from '@/components/form/SubmitButton';

import type { SetPasswordValues } from '../auth-schemas';
import { useAuthSchemas } from '../useAuthSchemas';

export interface SetPasswordFormProps {
  submitLabel: string;
  pending: boolean;
  /** Already translated by the page, which may override it for a coded case. */
  errorMessage?: string;
  onSubmit: (password: string) => void;
}

/**
 * "Choose a password", twice, with the confirmation.
 *
 * **One component for resetting and for activating**, because from where a
 * person is standing the two are the same screen: they followed a link from an
 * email and have to invent a password. The differences are all outside the form
 * — the heading, the button's words, what to do when the link is dead — and
 * they arrive as props or stay in the page.
 *
 * It does not know the token, does not call the API, and does not know which of
 * the two endpoints it is feeding. It hands up a string; the page turns that
 * into a request, which is also where the field's name on the wire
 * (`newPassword` or `password`) is decided.
 *
 * `autoComplete="new-password"` on both inputs is what tells a password manager
 * to offer to generate one rather than to fill the old one in.
 */
export const SetPasswordForm = ({
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
}: SetPasswordFormProps) => {
  const { t } = useTranslation();
  const { setPasswordSchema } = useAuthSchemas();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const submit = handleSubmit((values) => {
    onSubmit(values.password);
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FormAlert message={errorMessage} />

      <FormField
        label={t('auth.fields.newPassword')}
        error={errors.password?.message}
        type="password"
        autoComplete="new-password"
        autoFocus
        {...register('password')}
      />

      <FormField
        label={t('auth.fields.confirmPassword')}
        error={errors.confirmPassword?.message}
        type="password"
        autoComplete="new-password"
        {...register('confirmPassword')}
      />

      <SubmitButton pending={pending} className="mt-2 w-full">
        {submitLabel}
      </SubmitButton>
    </form>
  );
};
