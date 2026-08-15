import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormField } from '@/components/form/FormField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';
import { rejectedFields } from '@/lib/form-errors';

import { useLoginMutation } from '../auth-mutations';
import type { LoginValues } from '../auth-schemas';
import { useAuthSchemas } from '../useAuthSchemas';

const FIELDS = ['email', 'password'] as const;

export interface LoginFormProps {
  /** Called once the session is in memory. Where to go next is the page's call. */
  onAuthenticated: () => void;
}

/**
 * Email, password, and one button.
 *
 * ## The error message is deliberately unhelpful
 *
 * `AUTH_INVALID_CREDENTIALS` is what the backend answers for a wrong password,
 * an address that does not exist, and a deactivated account — one code, one
 * sentence, equal timing. The translation says "email or password is wrong" and
 * names neither, because in a company's internal system "no such account" also
 * answers "does this person work here". The frontend's job is not to improve on
 * that, and this form has no branch that could.
 *
 * The codes it does distinguish are the ones about the *request* rather than
 * the credentials: `RATE_LIMIT_EXCEEDED` from the strict tier login sits on,
 * and `VALIDATION_ERROR`, whose rejected fields are marked on the inputs.
 * `useApiErrorMessage` translates all of them by code; none of them renders the
 * envelope's English `message`.
 */
export const LoginForm = ({ onAuthenticated }: LoginFormProps) => {
  const { t } = useTranslation();
  const { loginSchema } = useAuthSchemas();
  const describeError = useApiErrorMessage();
  const loginMutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    loginMutation.mutate(values, {
      onSuccess: onAuthenticated,
      onError: (error) => {
        for (const field of rejectedFields(error, FIELDS)) {
          setError(field, { type: 'server' });
        }
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert
        message={
          loginMutation.error === null ? undefined : describeError(loginMutation.error)
        }
      />

      <FormField
        label={t('auth.fields.email')}
        error={errors.email?.message}
        type="email"
        inputMode="email"
        autoComplete="username"
        autoFocus
        placeholder={t('auth.placeholders.email')}
        {...register('email')}
      />

      <FormField
        label={t('auth.fields.password')}
        error={errors.password?.message}
        type="password"
        autoComplete="current-password"
        labelAction={
          <Link
            to="/forgot-password"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t('auth.login.forgotPassword')}
          </Link>
        }
        {...register('password')}
      />

      <SubmitButton pending={loginMutation.isPending} className="mt-2 w-full">
        {t('auth.login.submit')}
      </SubmitButton>
    </form>
  );
};
