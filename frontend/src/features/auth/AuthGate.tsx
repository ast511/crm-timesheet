import { useEffect, type ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';

import { ensureSessionHydrated } from './session-bootstrap';
import { useAuth } from './useAuth';

export interface AuthGateProps {
  children: ReactNode;
}

/**
 * Holds the application back until it knows whether anybody is signed in.
 *
 * ## Why nothing renders during the wait
 *
 * The router's guard reads the session from its context, and `beforeLoad` runs
 * once per navigation — it is not re-evaluated when a promise settles. Mounting
 * the router while the answer is still `loading` therefore means the guard
 * decides with the wrong information: a returning person with a perfectly good
 * refresh cookie is bounced to `/login`, and a fraction of a second later the
 * session arrives and nothing re-asks. Rendering the router only once the
 * question is answered removes that race rather than compensating for it.
 *
 * The cost is one round trip before the first paint, and it buys the opposite
 * of a flash of the login screen — which is the failure people actually notice.
 * A `Spinner` is the right thing to show for it: `CLAUDE.md` names "the initial
 * app boot" as the punctual wait a spinner exists for, and there is no known
 * shape here to skeleton.
 *
 * ## The effect
 *
 * `useEffect` rather than a TanStack Query hook, and this is the one place in
 * the application that is true. The session is not screen data: it is written
 * by an axios interceptor, read by the router's guard, and needed before any
 * component that could own a query exists. `ensureSessionHydrated` memoises the
 * promise, so StrictMode's double-invoked effect produces one request.
 */
export const AuthGate = ({ children }: AuthGateProps) => {
  const { status } = useAuth();

  useEffect(() => {
    void ensureSessionHydrated();
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="xl" className="text-muted-foreground" />
      </div>
    );
  }

  return children;
};
