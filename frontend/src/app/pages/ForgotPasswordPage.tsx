import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AuthCard } from '@/features/auth/components/AuthCard';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';

/**
 * `/forgot-password` — one field, and a way back.
 *
 * No illustration: the narrow card is the right proportion for a single input,
 * and the split layout is the login screen's signature rather than a house
 * style to repeat.
 */
export const ForgotPasswordPage = () => {
  const { t } = useTranslation();

  return (
    <AuthCard
      title={t('auth.forgotPassword.title')}
      description={t('auth.forgotPassword.description')}
      footer={
        <Link to="/login" className="underline-offset-4 hover:text-foreground hover:underline">
          {t('auth.backToLogin')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
};
