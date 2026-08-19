import { PlugZapIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { retrySessionHydration } from '../session-bootstrap';

/**
 * What the application shows when the boot request could not find out whether
 * anybody is signed in.
 *
 * ## It is deliberately not the login screen
 *
 * A login form here would be a statement — *you are signed out* — and the whole
 * reason this state exists is that the statement would be false: the refresh
 * cookie is still in the jar and the server still honours it. Somebody typing
 * their password into that form would be recovering from a rate limiter or a
 * deploy by re-authenticating, which is exactly the support ticket
 * `session-refresh.ts` argues against creating.
 *
 * So it says what happened and offers to ask again, and the retry usually
 * succeeds: every failure that lands here is by definition one that could pass
 * on its own.
 *
 * ## No error code is rendered, and that is a choice
 *
 * `useApiErrorMessage` is the rule everywhere else and would have worked here —
 * `RATE_LIMIT_EXCEEDED` has a translation. It is not used because the error
 * available at this point is `/auth/me`'s `401`, not the refresh's `429`: the
 * interceptor rejects with the original failure once a retry is declined. The
 * honest sentence is the one this screen shows — the connection to the server
 * did not complete — rather than a precise-sounding message about the wrong
 * request.
 *
 * ## The spinner is local
 *
 * `retrySessionHydration` puts the store back to `loading`, so `AuthGate` swaps
 * this screen for its own boot spinner the moment the retry starts, and this
 * component unmounts. The local `pending` state covers the render between the
 * click and that swap, and keeps a second click from starting a second request
 * in it.
 */
export const SessionUnknownScreen = () => {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const retry = (): void => {
    setPending(true);
    void retrySessionHydration();
  };

  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center"
    >
      <PlugZapIcon aria-hidden="true" className="size-8 text-muted-foreground" />

      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{t('auth.sessionUnknown.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.sessionUnknown.description')}</p>
      </div>

      <Button variant="outline" onClick={retry} disabled={pending} aria-busy={pending}>
        {pending && <Spinner size="sm" />}
        {t('actions.retry')}
      </Button>
    </div>
  );
};
