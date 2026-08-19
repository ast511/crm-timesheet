import { useTranslation } from 'react-i18next';

import { useActivateAccountMutation } from '@/features/auth/auth-mutations';
import { SetPasswordScreen } from '@/features/auth/components/SetPasswordScreen';
import { usePageMeta } from '@/hooks/usePageMeta';

export interface ActivateAccountPageProps {
  /** From `?token=`. Empty when the emailed link arrived truncated. */
  token: string;
}

/**
 * `/activate-account?token=…` — where an invitation email lands.
 *
 * The path matches `ACTIVATION_PATH` in the backend's `account-email.service.ts`
 * exactly, for the same reason the reset route does: the links are already
 * written into messages this application cannot edit.
 *
 * It offers **no self-service recovery**, and that is the honest answer rather
 * than a missing feature. There is no endpoint for "send me another invitation"
 * — issuing one is an administrator's action, because deciding that an account
 * should exist is not something the person being invited can do for themselves.
 * So the message says to ask HR, and the footer is the ordinary link to
 * sign-in for anybody who followed an activation link they had already used.
 */
export const ActivateAccountPage = ({ token }: ActivateAccountPageProps) => {
  const { t } = useTranslation();

  const activateAccountMutation = useActivateAccountMutation();

  usePageMeta({
    title: t('pages.activateAccount.title'),
    description: t('pages.activateAccount.description'),
  });

  return (
    <SetPasswordScreen
      token={token}
      title={t('auth.activate.title')}
      description={t('auth.activate.description')}
      submitLabel={t('auth.activate.submit')}
      successMessage={t('auth.activate.success')}
      invalidLinkMessage={t('auth.activate.invalidLink')}
      state={activateAccountMutation}
      onSubmit={(password) => {
        activateAccountMutation.mutate({ token, password });
      }}
    />
  );
};
