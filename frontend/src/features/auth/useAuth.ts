import { useSyncExternalStore } from 'react';

import { getAuthState, subscribeToAuth, type AuthState } from './auth-store';

/**
 * The session, for components.
 *
 * ```tsx
 * const { user, isAuthenticated } = useAuth();
 * ```
 *
 * There is no provider to wrap anything in: the state lives in a module
 * (`auth-store.ts`) because an axios interceptor writes to it, and this hook is
 * the read side. A component can therefore call it anywhere without a
 * `<AuthProvider>` above it — including inside the router's own context, which
 * is where the route guard reads the same snapshot.
 *
 * `useSyncExternalStore` rather than state mirrored by an effect: the store is
 * the source, and copying it into React state would render twice on every
 * change and be briefly wrong in between.
 */
export const useAuth = (): AuthState =>
  useSyncExternalStore(subscribeToAuth, getAuthState, getAuthState);
