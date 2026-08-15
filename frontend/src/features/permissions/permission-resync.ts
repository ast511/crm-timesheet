import { toast } from 'sonner';

import type { ApiError } from '@/api/api-error';
import { setForbiddenHandler } from '@/api/authorization-seam';
import { queryClient } from '@/api/query-client';
import { fetchCurrentUser } from '@/features/auth/auth-api';
import { adoptUser, getAuthState } from '@/features/auth/auth-store';
import { i18n } from '@/i18n/config';

import type { EffectivePermissions } from './permissions-api';
import {
  invalidateEffectivePermissions,
  readCachedEffectivePermissions,
} from './permissions-query';

/**
 * Keeping the UI honest when somebody's access changes **while they are using
 * the application**.
 *
 * The case: an administrator is demoted to a plain user at 14:03, with their
 * tab open on the employees list. The backend enforces that immediately —
 * Feature 035's `PermissionsGuard` refuses their next call — so this is not a
 * security problem and no part of this file is a security control. It is a
 * *truthfulness* problem. Their sidebar still lists screens they cannot open,
 * their toolbar still offers buttons that will now fail, and the application is
 * telling them something about themselves that stopped being true.
 *
 * Two paths correct it, and they are complementary rather than redundant:
 *
 * - **Reactive, here.** A `403 AUTHORIZATION_PERMISSION_DENIED` is proof that
 *   the client's picture is stale — the request would not have been made if the
 *   menu had been right. So the refusal is treated as a notification, and the
 *   set and the account are re-read.
 * - **Proactive, in `permissions-query.ts`.** `refetchOnWindowFocus` corrects
 *   the menu when somebody returns to the tab, which is the moment *before*
 *   they act. That path costs no failed request at all, and it is the one that
 *   handles the common case; this one handles the person who was already
 *   looking at the screen when it happened.
 *
 * ## What it re-reads, and why it is both
 *
 * The permission set, obviously. **And `GET /auth/me`**, because a role and a
 * permission set are two answers that the same administrative edit changes at
 * once, and only one of them lives in this feature. `useAuth().user.role` is
 * read by the header, by whatever workspace options a role implies, and by any
 * screen that says "Administrator" next to somebody's name; leaving it saying
 * `ADMIN` for a person the backend now treats as `USER` would fix the menu and
 * leave the identity wrong.
 */

/**
 * The one code that means "your permissions are not what you think".
 *
 * `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` — the other `403` this API produces —
 * is deliberately excluded, and the backend's own note on the code is the
 * reason: it means the route is closed to the caller's *role* and no permission
 * exists that would open it. There is nothing to re-sync, nothing an
 * administrator could grant, and refetching a set that has not changed would
 * produce a "your access changed" notice for somebody whose access did not.
 *
 * Anything else answering `403` — a proxy, a `404`-shaped refusal from
 * something outside this API — has no `errorCode` and is ignored for the same
 * reason.
 */
const STALE_PERMISSIONS_ERROR_CODE = 'AUTHORIZATION_PERMISSION_DENIED';

/**
 * Whether two answers describe the same access.
 *
 * Compared by content rather than by object identity. Structural sharing does
 * make an unchanged refetch keep its identity, and relying on that here would
 * be correct today and silently wrong the moment somebody turns it off — for a
 * comparison whose failure mode is telling every user their permissions changed
 * every time they are refused anything.
 *
 * The keys arrive in catalog order, which is stable, so a positional comparison
 * is enough and there is no set to build.
 */
const describesSameAccess = (
  before: EffectivePermissions | undefined,
  after: EffectivePermissions | undefined,
): boolean =>
  before !== undefined &&
  after !== undefined &&
  before.role === after.role &&
  before.permissions.length === after.permissions.length &&
  before.permissions.every((key, index) => key === after.permissions[index]);

/**
 * In flight, shared.
 *
 * A screen that fires five requests against a resource somebody has just lost
 * gets five `403`s at once. Without this they would produce five
 * `GET /auth/me` and five refetches, and — because the toast fires on a
 * *change* observed by each of them — potentially five identical notices
 * stacked on top of each other. It is the same argument the session refresh
 * makes for its own lock, minus the part where the credential is single-use;
 * here the cost is noise and wasted requests rather than a revoked session.
 */
let inFlight: Promise<void> | null = null;

const performResync = async (): Promise<void> => {
  const { user } = getAuthState();

  if (user === null) return;

  const before = readCachedEffectivePermissions(queryClient, user.id);

  /**
   * `allSettled`, so one failing does not abandon the other. They are
   * independent reads of two things that changed together, and a `500` on the
   * account read is no reason to leave the menu wrong as well.
   *
   * Both carry `skipPermissionResync`, so a `403` from either cannot re-enter
   * this function — the single-flight lock alone would not prevent that,
   * because it releases before the recursive call would be made.
   */
  const [refreshedUser] = await Promise.allSettled([
    fetchCurrentUser({ skipPermissionResync: true }),
    invalidateEffectivePermissions(queryClient),
  ]);

  if (refreshedUser.status === 'fulfilled') {
    /**
     * `adoptUser` rather than a new session: the access token is untouched and
     * still valid. What changed is what the account behind it is allowed to be.
     */
    adoptUser(refreshedUser.value);
  }

  const after = readCachedEffectivePermissions(queryClient, user.id);

  /**
   * The notice is only shown when something actually moved.
   *
   * A `403` does not prove a change — it also happens when a screen offers a
   * button it never should have, or when a link is followed by somebody who
   * never had the permission. Announcing "your permissions have changed" to
   * them would be the application inventing an event, and it is the kind of
   * inaccuracy people remember. The refused request still surfaces its own
   * translated error through the caller's own handling; this toast is
   * specifically the explanation for *why the screen is about to rearrange
   * itself underneath you*, and it should appear exactly when that happens.
   */
  if (describesSameAccess(before, after)) return;

  toast.info(i18n.t('permissions.accessChanged'));
};

/**
 * The `403` handler.
 *
 * Returns `void` and is never awaited — see `authorization-seam.ts`. The
 * promise is kept only to share it, and its rejection is swallowed deliberately
 * rather than by accident: this runs in response to an error that has already
 * been reported to the person who caused it, and a second failure here has no
 * one to tell. Leaving it unhandled would surface as an unhandled rejection in
 * the console for a path whose entire job is tidying up after another failure.
 */
const handleForbidden = (error: ApiError): void => {
  if (error.errorCode !== STALE_PERMISSIONS_ERROR_CODE) return;
  if (!getAuthState().isAuthenticated) return;

  inFlight ??= performResync()
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
};

/**
 * Registered at module scope, for the reason `session-refresh.ts` gives for
 * doing the same: the seam has to be filled before the request that needs it,
 * and an effect runs after the first requests of the page have already been
 * made. `AppProviders` imports this module for that ordering.
 */
setForbiddenHandler(handleForbidden);
