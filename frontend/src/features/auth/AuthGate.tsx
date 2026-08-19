import { useEffect, type ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';

import { SessionUnknownScreen } from './components/SessionUnknownScreen';
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
 * ## Three outcomes, not two
 *
 * The question has an answer this gate did not used to have a branch for. "Yes"
 * and "no" mount the router; **"I could not find out" must not**, because the
 * router's only way to express it is `/login?redirect=…`, which tells somebody
 * with a perfectly good refresh cookie that they are signed out and asks them to
 * type their password because a rate limiter counted to ten. That state gets its
 * own screen with a retry — see `SessionUnknownScreen` and `AuthStatus`.
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

  /*
   * The boot request failed for a reason that is not "the session is over", so
   * the router stays unmounted rather than being handed a `false`
   * `isAuthenticated` it would read as a signed-out visitor and answer with
   * `/login?redirect=…`. That redirect is the bug this branch exists to remove:
   * it is the correct response to being signed out and the wrong response to a
   * rate limiter, a deploy or a dropped connection, and from inside the guard
   * the two are indistinguishable.
   *
   * Holding the router back is the same technique — and the same argument — as
   * the `loading` branch above: `beforeLoad` runs once per navigation and is not
   * re-evaluated when something settles, so a guard must never be allowed to
   * decide on information that is about to change.
   */
  if (status === 'unknown') {
    return <SessionUnknownScreen />;
  }

  return children;
};
