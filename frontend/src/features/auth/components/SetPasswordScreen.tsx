import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { hasErrorCode } from '@/api/api-error';
import { FormAlert } from '@/components/form/FormAlert';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

import { AuthCard } from './AuthCard';
import { SetPasswordForm } from './SetPasswordForm';

/** Just enough of a TanStack mutation for this screen. Any of them will do. */
export interface SubmissionState {
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
}

export interface SetPasswordScreenProps {
  /** From `?token=` in the emailed link. Empty means the link was truncated. */
  token: string;
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  /** This screen's own wording for `ACCOUNT_TOKEN_INVALID`. */
  invalidLinkMessage: string;
  /** What to offer when the link is dead — only reset has a self-service path. */
  recovery?: ReactNode;
  state: SubmissionState;
  onSubmit: (password: string) => void;
}

/**
 * Resetting a forgotten password and activating a new account, as one screen.
 *
 * They are the same three states in the same order, and writing them twice
 * would be writing the third one twice:
 *
 * 1. **No token.** The link was truncated on its way through a mail client —
 *    the field is empty because `validateSearch` defaults it, not because
 *    anything failed. There is no form to show; asking for a password that
 *    cannot be submitted would be a dead end with a button on it.
 * 2. **The form**, plus whatever the last attempt said.
 * 3. **Done.** A confirmation and a way to sign in. Neither endpoint returns a
 *    session — the backend refuses to log somebody in as a side effect of a
 *    link, because a message forwarded to the wrong mailbox would then hand
 *    over an account rather than a password prompt — so the honest end of both
 *    flows is the login screen.
 *
 * `ACCOUNT_TOKEN_INVALID` is the one code this branches on rather than merely
 * translating, because a dead link needs an *action* and the action differs:
 * somebody resetting a password can request another link themselves, somebody
 * activating an account has to ask whoever invited them. Every other failure —
 * `VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`, a network drop — is translated by
 * code through `useApiErrorMessage` and shown above the form, which is still
 * there to resubmit.
 */
export const SetPasswordScreen = ({
  token,
  title,
  description,
  submitLabel,
  successMessage,
  invalidLinkMessage,
  recovery,
  state,
  onSubmit,
}: SetPasswordScreenProps) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();

  const backToLogin = (
    <Link to="/login" className="underline-offset-4 hover:text-foreground hover:underline">
      {t('auth.backToLogin')}
    </Link>
  );

  if (state.isSuccess) {
    return (
      <AuthCard
        title={title}
        description={description}
        footer={
          <Link
            to="/login"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {t('auth.goToLogin')}
          </Link>
        }
      >
        <FormAlert tone="success" message={successMessage} />
      </AuthCard>
    );
  }

  if (token === '') {
    return (
      <AuthCard title={title} description={description} footer={recovery ?? backToLogin}>
        <FormAlert message={t('auth.missingToken')} />
      </AuthCard>
    );
  }

  const linkIsDead = hasErrorCode(state.error, 'ACCOUNT_TOKEN_INVALID');

  const errorMessage =
    state.error === null || state.error === undefined
      ? undefined
      : linkIsDead
        ? invalidLinkMessage
        : describeError(state.error);

  return (
    <AuthCard
      title={title}
      description={description}
      footer={linkIsDead ? (recovery ?? backToLogin) : backToLogin}
    >
      <SetPasswordForm
        submitLabel={submitLabel}
        pending={state.isPending}
        errorMessage={errorMessage}
        onSubmit={onSubmit}
      />
    </AuthCard>
  );
};
