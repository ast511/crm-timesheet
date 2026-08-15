import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useResetPasswordMutation } from '@/features/auth/auth-mutations';
import { SetPasswordScreen } from '@/features/auth/components/SetPasswordScreen';

export interface ResetPasswordPageProps {
  /** From `?token=`. Empty when the emailed link arrived truncated. */
  token: string;
}

/**
 * `/reset-password?token=…` — the target of the recovery email.
 *
 * The path is the backend's, not a choice made here: `account-email.service.ts`
 * builds the link as `${WEB_URL}/reset-password?token=…`, so renaming this route
 * would break every email already in somebody's inbox.
 *
 * Its recovery affordance is a link back to `/forgot-password`, because a reset
 * link is something a person can ask for again themselves — a dead one is an
 * inconvenience, not a dead end.
 */
export const ResetPasswordPage = ({ token }: ResetPasswordPageProps) => {
  const { t } = useTranslation();
  const resetPasswordMutation = useResetPasswordMutation();

  return (
    <SetPasswordScreen
      token={token}
      title={t('auth.resetPassword.title')}
      description={t('auth.resetPassword.description')}
      submitLabel={t('auth.resetPassword.submit')}
      successMessage={t('auth.resetPassword.success')}
      invalidLinkMessage={t('auth.resetPassword.invalidLink')}
      recovery={
        <Link
          to="/forgot-password"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          {t('auth.resetPassword.requestNew')}
        </Link>
      }
      state={resetPasswordMutation}
      onSubmit={(password) => {
        resetPasswordMutation.mutate({ token, newPassword: password });
      }}
    />
  );
};
