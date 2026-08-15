import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AuthCard } from '@/features/auth/components/AuthCard';
import { AuthIllustration } from '@/features/auth/components/AuthIllustration';
import { LoginForm } from '@/features/auth/components/LoginForm';

export interface LoginPageProps {
  /**
   * Where signing in leads, from `?redirect=` — **already sanitised** by the
   * route's `validateSearch`, so this is a path inside this application or
   * nothing at all.
   */
  redirectTo?: string;
}

/**
 * `/login` — the split card.
 *
 * The page owns exactly one decision the form should not: **where signing in
 * leads**. That is `?redirect=`, the location the route guard recorded when it
 * turned somebody away, already checked by `toInternalPath` to be a path inside
 * this application. With nothing recorded it is `/app`.
 *
 * `replace: true` keeps the login screen out of the history, so pressing back
 * from the dashboard goes wherever the person came from rather than to a form
 * they have already completed — which, for anybody now signed in, would bounce
 * them straight forward again.
 *
 * The destination arrives as a **prop**, not from `useSearch`: the route owns
 * reading and sanitising its own search parameters, and a page that took them
 * itself would have to name the route it belongs to — which, since the public
 * screens are grouped under a pathless layout route, is the id `/public/login`
 * rather than the URL anybody recognises.
 */
export const LoginPage = ({ redirectTo }: LoginPageProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Two calls rather than one with a conditional argument: `to` and `href` are
  // different overloads, and a union of the two makes the router infer a
  // destination type that fits neither.
  const goToApplication = () => {
    if (redirectTo === undefined) {
      void navigate({ to: '/app', replace: true });

      return;
    }

    void navigate({ href: redirectTo, replace: true });
  };

  return (
    <AuthCard
      title={t('auth.login.title')}
      description={t('auth.login.description')}
      illustration={<AuthIllustration />}
    >
      <LoginForm onAuthenticated={goToApplication} />
    </AuthCard>
  );
};
