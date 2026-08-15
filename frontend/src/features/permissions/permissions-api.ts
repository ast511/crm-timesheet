import { apiGet } from '@/api/client';
import type { components } from '@/api/generated/openapi';

/**
 * The one call this feature makes.
 *
 * `GET /api/v1/permissions/me/effective` is **deliberately not permission-
 * gated**, and the backend's own contract says it must never become so: gating
 * the endpoint whose entire purpose is to tell somebody what they may do would
 * answer `403` to every ordinary employee. It reports on the caller alone —
 * somebody else's set is `GET /users/:id/permissions`, and that one *is* gated
 * and belongs to the permission-management screens, not here.
 *
 * The set is already resolved: role baseline ∪ GRANT − REVOKE, with
 * `SUPERADMIN` expanded to every key. The frontend performs no part of that
 * computation, which is why there is no super-admin branch anywhere in this
 * feature.
 */

/** The answer: the keys, the role behind them, and the backend's own count. */
export type EffectivePermissions = components['schemas']['EffectivePermissionsEntity'];

/**
 * `skipPermissionResync` is set for the same family of reasons `auth-api.ts`
 * sets `skipAuthRefresh`: this request is the one the re-sync *makes*, so a
 * failure of it must not be read as a reason to re-sync. In practice an ungated
 * endpoint cannot answer `AUTHORIZATION_PERMISSION_DENIED` at all, which makes
 * the flag redundant today — it is set anyway, because "this endpoint cannot
 * currently return that code" is a fact about the backend that a change to the
 * backend could quietly revoke, and the failure it would produce is an
 * unbounded loop rather than an error message.
 *
 * `skipAuthRefresh` is **not** set: a `401` here is an expired access token and
 * exactly what the silent refresh exists for.
 */
export const fetchMyEffectivePermissions = (signal?: AbortSignal): Promise<EffectivePermissions> =>
  apiGet('/api/v1/permissions/me/effective', {
    signal,
    config: { skipPermissionResync: true },
  });
