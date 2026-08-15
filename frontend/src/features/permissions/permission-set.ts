import type { EffectivePermissions } from './permissions-api';
import type { PermissionKey } from './permission-keys';

/**
 * The effective permission set, as a value object.
 *
 * Plain functions closing over a `Set`, not a class and not a React hook, for
 * one reason: **the route guard and the button gate must answer identically.**
 * A `beforeLoad` is not a component and cannot call a hook, so if the semantics
 * lived in a hook the router would need its own copy of them — and two copies
 * of "does ALL mean every key or at least one" is how a screen ends up
 * reachable by somebody whose menu does not show it. Everything that decides
 * whether a permission is held goes through {@link satisfies} in this file.
 *
 * It is immutable and its identity is stable per fetch, which is what lets
 * `AppRouter` compare snapshots by reference to decide whether the router needs
 * re-evaluating.
 */

/**
 * What a route, a button or a section requires.
 *
 * The three fields are **ANDed with each other** and each is independently
 * meaningful, so a requirement can say "holds `REPORTS.PAGE_ACCESS`, and at
 * least one of view or export" without a second combinator:
 *
 * ```ts
 * { permission: 'REPORTS.PAGE_ACCESS', anyOf: ['REPORTS.VIEW', 'REPORTS.EXPORT'] }
 * ```
 *
 * ## The empty cases, which are the ones that bite
 *
 * - **A requirement with no fields is satisfied.** An item with no permission
 *   requirement is always allowed — that is the rule for every screen and
 *   control that is simply available to anybody signed in, and it means
 *   `<Can>` with nothing to check renders its children rather than swallowing
 *   them.
 * - **An empty or omitted list is not a constraint**, so `anyOf: []` is
 *   satisfied. This is deliberately *not* the mathematical reading of "any of
 *   nothing", and the reason is where empty arrays come from in practice: a
 *   list built by filtering or mapping. Under the strict reading a filter that
 *   happened to match nothing would hide the control silently and look like a
 *   permission problem. Under this reading it degrades to "unconstrained",
 *   which is visible and therefore fixable.
 *
 * `allOf: []` is satisfied under both readings, so only `anyOf` needed a
 * decision.
 */
export interface PermissionRequirement {
  /** A single key that must be held. */
  permission?: PermissionKey;
  /** At least one of these must be held. Empty means "no constraint". */
  anyOf?: readonly PermissionKey[];
  /** Every one of these must be held. */
  allOf?: readonly PermissionKey[];
}

export interface PermissionSet {
  /** The account the set was computed for, or `null` when nothing is loaded. */
  readonly userId: string | null;
  /**
   * The role behind it, straight from the same response.
   *
   * Carried here so a screen that needs the role and the permissions gets both
   * from one source that changed at one moment. `useAuth().user.role` is the
   * same value by a different route; they are re-read together by the re-sync,
   * so they cannot disagree for longer than one request.
   */
  readonly role: EffectivePermissions['role'] | null;
  /** The granted keys, in catalog order, exactly as the backend sent them. */
  readonly keys: readonly string[];
  /** How many. The backend's own count, not a measurement of the array. */
  readonly size: number;

  /** Whether this exact key is held. */
  has: (key: PermissionKey) => boolean;
  /** Whether **every** listed key is held. Vacuously true for an empty list. */
  hasAll: (keys: readonly PermissionKey[]) => boolean;
  /** Whether **at least one** is held. `false` for an empty list — see below. */
  hasAny: (keys: readonly PermissionKey[]) => boolean;
  /** Whether a {@link PermissionRequirement} is met, empty cases included. */
  satisfies: (requirement: PermissionRequirement) => boolean;
}

/**
 * Builds a set from the endpoint's answer.
 *
 * A `Set` rather than `Array.includes` because a sidebar of twenty items
 * checking against fifty-five keys is a thousand string comparisons per render
 * otherwise, and the backend's own documentation for this endpoint describes
 * exactly this: "a flat array of keys a client turns into a `Set` once and asks
 * `has('TIMESHEET.CREATE')` of thereafter".
 *
 * **A super-admin needs no special case here, and must not get one.** The
 * backend already resolved `SUPERADMIN` to every key before answering, so the
 * array simply contains all fifty-five. A `role === 'SUPERADMIN' ? true` branch
 * in the UI would be a second authorization rule living on the client, and the
 * first place the two would disagree is a permission added to the catalog after
 * this line was written.
 */
interface PermissionSetIdentity {
  userId: string | null;
  role: EffectivePermissions['role'] | null;
  size: number;
}

const createPermissionSet = (
  keys: readonly string[],
  { userId, role, size }: PermissionSetIdentity,
): PermissionSet => {
  const held = new Set(keys);

  const has = (key: PermissionKey): boolean => held.has(key);

  return {
    userId,
    role,
    keys,
    size,
    has,
    hasAll: (required) => required.every(has),
    hasAny: (required) => required.some(has),
    satisfies: ({ permission, anyOf, allOf }) =>
      (permission === undefined || has(permission)) &&
      (allOf === undefined || allOf.every(has)) &&
      (anyOf === undefined || anyOf.length === 0 || anyOf.some(has)),
  };
};

export const toPermissionSet = (effective: EffectivePermissions): PermissionSet =>
  createPermissionSet(effective.permissions, {
    userId: effective.userId,
    role: effective.role,
    size: effective.total,
  });

/**
 * The set for "nothing is known yet" and for "nobody is signed in".
 *
 * One constant for both, because they gate identically — an unloaded set grants
 * nothing, which is the safe direction for a UI to be wrong in while a request
 * is in flight. The states are still *distinguishable* where it matters:
 * `usePermissions` reports `isLoading` beside the set, so a screen can show a
 * skeleton instead of an empty menu, and the route guard never sees this value
 * at all because it awaits the fetch (see `permission-route-guard.ts`).
 *
 * It is a module constant so its identity is stable, which keeps the
 * snapshot comparison in `AppRouter` from firing on every render.
 */
export const EMPTY_PERMISSION_SET: PermissionSet = createPermissionSet([], {
  userId: null,
  role: null,
  size: 0,
});
