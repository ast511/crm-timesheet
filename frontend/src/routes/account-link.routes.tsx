import { createRoute } from '@tanstack/react-router';

import { ActivateAccountPage } from '@/app/pages/ActivateAccountPage';
import { ForgotPasswordPage } from '@/app/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/app/pages/ResetPasswordPage';

import { publicRoute } from './public.route';

/**
 * The three public routes somebody reaches without a session: asking for a
 * reset link, following one, and following an invitation.
 *
 * They are in one file because they are one flow with one contract — the
 * `?token=` search parameter, validated identically — and splitting them would
 * put that shared shape somewhere neither of its users lives.
 *
 * **The two paths are not ours to choose.** `account-email.service.ts` builds
 * its links from `ACTIVATION_PATH = '/activate-account'` and
 * `RESET_PATH = '/reset-password'`, so these strings are a contract with every
 * email already delivered. Renaming one here breaks links that are sitting in
 * inboxes and cannot be reissued.
 */

export interface AccountTokenSearch {
  /** The secret from the emailed link. Empty when the link arrived truncated. */
  token: string;
}

/**
 * An absent or non-string token becomes `''` rather than a validation failure.
 *
 * Throwing here would render the router's error boundary — a technical page for
 * something that is not a technical problem: somebody's mail client wrapped a
 * long URL, and what they need is a sentence telling them to open the whole
 * link. The empty string carries that case to the screen, which handles it.
 */
const validateTokenSearch = (search: Record<string, unknown>): AccountTokenSearch => ({
  token: typeof search.token === 'string' ? search.token : '',
});

export const forgotPasswordRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

/*
 * Both token routes read their own search parameter and hand the page a prop,
 * inline — same reasoning as `login.route.tsx`.
 */
export const resetPasswordRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/reset-password',
  validateSearch: validateTokenSearch,
  component: () => <ResetPasswordPage token={resetPasswordRoute.useSearch().token} />,
});

export const activateAccountRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/activate-account',
  validateSearch: validateTokenSearch,
  component: () => <ActivateAccountPage token={activateAccountRoute.useSearch().token} />,
});
