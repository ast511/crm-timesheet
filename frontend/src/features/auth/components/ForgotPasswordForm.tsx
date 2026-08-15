import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormField } from '@/components/form/FormField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

import { useForgotPasswordMutation } from '../auth-mutations';
import type { ForgotPasswordValues } from '../auth-schemas';
import { useAuthSchemas } from '../useAuthSchemas';

/**
 * One field, and one rule that shapes everything about it.
 *
 * **The confirmation must not depend on what happened.** The backend answers
 * the same status and the same fixed sentence whether the address belongs to an
 * active account, a pending one, a disabled one, or nobody — that is the
 * no-enumeration property, and a UI that rendered "check your inbox" for one
 * outcome and "we don't know that address" for another would hand it straight
 * back. So there is exactly one success branch here and it says the careful
 * thing: *if* an account exists for that address, a link has been sent.
 *
 * The sentence is our translation rather than the `message` the response
 * carries. The backend returns that string so no client invents a *different
 * claim*, and explicitly permits showing a translation of it — which is what a
 * Romanian-first application has to do.
 *
 * The form is replaced by the confirmation rather than sitting beneath it: a
 * submitted address is not something to resubmit, and the endpoint sends real
 * mail on the strict rate-limit tier.
 */
export const ForgotPasswordForm = () => {
  const { t } = useTranslation();
  const { forgotPasswordSchema } = useAuthSchemas();
  const describeError = useApiErrorMessage();
  const forgotPasswordMutation = useForgotPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit((values) => {
    forgotPasswordMutation.mutate(values.email);
  });

  if (forgotPasswordMutation.isSuccess) {
    return <FormAlert tone="success" message={t('auth.forgotPassword.sent')} />;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert
        message={
          forgotPasswordMutation.error === null
            ? undefined
            : describeError(forgotPasswordMutation.error)
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

      <SubmitButton pending={forgotPasswordMutation.isPending} className="mt-2 w-full">
        {t('auth.forgotPassword.submit')}
      </SubmitButton>
    </form>
  );
};
