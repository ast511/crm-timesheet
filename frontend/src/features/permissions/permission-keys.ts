import type { components } from '@/api/generated/openapi';

/**
 * The vocabulary of the permission system, derived from the generated contract.
 *
 * ## Why a template literal and not a list of fifty-five strings
 *
 * The backend has an exact union — `PermissionKey` in
 * `prisma/seeds/permissions.seed.ts`, built from the catalog it seeds — but
 * OpenAPI has no way to express it, so `EffectivePermissionsEntity.permissions`
 * arrives here as plain `string[]`. That leaves two ways to get a checked key.
 *
 * Copying the fifty-five keys into this file would be **re-declaring the
 * contract**, which `CLAUDE.md` forbids for exactly the reason it forbids
 * hand-written response types: the copy is right on the day it is written and
 * silently wrong afterwards. A permission added to the catalog would be
 * unusable until somebody remembered this file, and one renamed would keep
 * compiling against a key the API no longer knows.
 *
 * So the key is composed from the two enums the contract *does* publish. Both
 * are read off `PermissionEntity`, so renaming a resource in the backend is a
 * compile error in every screen that gates on it, the day the types are
 * regenerated.
 *
 * ## The cost, stated plainly
 *
 * The cross product is 12 × 7 = **84 keys; the catalog holds 55**. So
 * `'DASHBOARD.APPROVE'` type-checks and does not exist — `has()` simply answers
 * `false` for it, and the UI hides a control forever rather than failing loudly.
 *
 * That is the right trade here. The error this type is for is a *typo* —
 * `'TIMESHEETS.VIEW'`, `'REPORTS.READ'` — and it catches every one of those,
 * because both halves have to be real. What it cannot catch is a plausible pair
 * that was never seeded, and the backend catches that on the first real request:
 * a route gated on a key nobody holds answers `403`, and a `<Can>` on a
 * non-existent key hides a button whose absence is visible the moment anybody
 * looks at the screen.
 *
 * If a stricter type is ever wanted, the honest way to get one is to have the
 * backend publish the union — as an `enum` on the OpenAPI schema for
 * `permissions`, which would arrive here through `npm run gen:api` like
 * everything else. That is noted in the feature document rather than solved by
 * a list maintained by hand.
 */

/** The twelve resources the catalog is grouped by. */
export type PermissionResource = components['schemas']['PermissionEntity']['resource'];

/** The seven actions a resource can carry. */
export type PermissionAction = components['schemas']['PermissionEntity']['action'];

/**
 * `RESOURCE.ACTION` — the name the backend, the audit trail, a request body and
 * a `<Can permission="…">` all spell identically.
 */
export type PermissionKey = `${PermissionResource}.${PermissionAction}`;

/**
 * The shape of a key, for validating a string that came from outside the
 * application — a URL, in practice. It says nothing about whether the key
 * exists; it says the string is not something else entirely.
 */
const PERMISSION_KEY_PATTERN = /^[A-Z][A-Z_]*\.[A-Z][A-Z_]*$/;

/**
 * Narrows an untrusted string to a {@link PermissionKey}.
 *
 * Used on the one value that reaches this feature from a place anybody can
 * edit: the `?required=` on the not-authorized screen, which is rendered back
 * to the person who arrived with it. React escapes what it renders, so this is
 * not about injection — it is about not printing whatever a doctored link put
 * in the query string as though the application had said it.
 */
export const isPermissionKeyShaped = (value: unknown): value is PermissionKey =>
  typeof value === 'string' && PERMISSION_KEY_PATTERN.test(value);
