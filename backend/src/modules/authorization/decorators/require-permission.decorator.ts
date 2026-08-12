import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** The metadata key both decorators below write and `PermissionsGuard` reads. */
export const REQUIRED_PERMISSIONS_KEY = 'authorization:requiredPermissions';

/** How a route with more than one required key is satisfied. */
export const PERMISSION_MODES = ['ALL', 'ANY'] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** What a gated route declares: the keys, and how they combine. */
export interface PermissionRequirement {
  readonly keys: readonly string[];
  readonly mode: PermissionMode;
}

/**
 * At least one key. A requirement of nothing is not a weaker gate, it is an
 * open route that looks gated — so it is a compile error rather than a
 * decorator that silently admits everybody.
 */
type PermissionKeys = [string, ...string[]];

/**
 * Declares which permission(s) a route requires, using the catalog keys Feature
 * 029 seeds — `'TIMESHEET.APPROVE'`, `'REPORTS.VIEW'`,
 * `'PERMISSIONS.CONFIGURE'`.
 *
 * ```ts
 * @Post(':id/approve')
 * @RequirePermission('TIMESHEET.APPROVE')
 * approve(...) { ... }
 * ```
 *
 * ## ALL, and why that is the default
 *
 * Several keys mean the caller must hold **every** one of them:
 * `@RequirePermission('PERMISSIONS.VIEW', 'PERMISSIONS.EDIT')` admits nobody
 * who is missing either. The alternative default was considered and rejected on
 * one property: the two readings differ only when a caller holds *some* of the
 * listed keys, and in that case `ALL` refuses while `ANY` admits. A decorator
 * whose meaning is ambiguous at a glance should fail closed, so the ambiguous
 * reading is the safe one and the permissive reading has to be asked for by
 * name — see {@link RequireAnyPermission}.
 *
 * Two decorators rather than an options object, and deliberately nothing more.
 * There is no `@RequirePermission({ any: [...], all: [...] })` and no expression
 * syntax: a route whose access rule needs boolean structure has an access rule
 * that belongs in its service, where it can be read, named and tested, rather
 * than compressed into a decorator argument.
 *
 * ## What it does not do
 *
 * It states a **resource permission**, never a row-level rule. `TIMESHEET.EDIT`
 * says somebody may edit a timesheet, not whose — the seed's own note on the
 * `USER` baseline makes the same point. Ownership, status and state rules stay
 * in the services that own them and run underneath this gate; see
 * `PermissionsGuard` for the layering.
 *
 * ## Placement
 *
 * Applied to a method it covers that route; applied to a controller class it
 * covers every route in it, and a method-level declaration replaces the class's
 * rather than adding to it — `getAllAndOverride`'s rule, the same one
 * `@Public()` and `@StrictRateLimit()` follow. Both decorators write one
 * metadata key, so `@RequirePermission()` and `@RequireAnyPermission()` on the
 * same handler is not a combination: the second one applied wins, which is why
 * a route should carry exactly one.
 *
 * **Never with `@Public()`.** That decorator says the route has no caller, and
 * an unidentified caller has no permissions to check. The combination is
 * refused at startup by `PublicRouteValidator` rather than at request time,
 * because it is a wiring mistake and a wiring mistake should stop a deployment
 * instead of producing a route that answers `401` to everybody who tries it.
 *
 * ## The key is a string, and what checks it
 *
 * The catalog's fifty-five keys exist as a union of literals — `PermissionKey`
 * in `prisma/seeds/permissions.seed.ts` — but the seeds are CLI-only tooling
 * that `tsconfig.build.json` excludes from the build, so `src/` cannot import
 * that type without pulling the seed into `dist/`. Copying the fifty-five
 * literals into `src/` would be the same catalog written twice, which is the
 * one thing this project will not do for a permission list. The check happens in
 * `authorization/catalog.spec.ts` instead: it reads the requirement off every
 * route in the application and asserts each key is one the seed actually
 * creates, so a typo is a failing test rather than a gate no grant can ever
 * satisfy.
 */
export const RequirePermission = (...keys: PermissionKeys) =>
  SetMetadata<string, PermissionRequirement>(REQUIRED_PERMISSIONS_KEY, {
    keys,
    mode: 'ALL',
  });

/**
 * Declares that a route requires **any one** of several permissions.
 *
 * The escape hatch for a route two different jobs reach for two different
 * reasons — not a general-purpose alternative to {@link RequirePermission},
 * which is the one to use unless a route genuinely has that shape. It is spelled
 * differently rather than passed as a flag so that the permissive reading is
 * visible in the route listing and in a diff, instead of hiding in an argument.
 *
 * No route in this feature uses it. It is written and tested because the
 * semantics had to be decided either way — "what do several keys mean" is a
 * question the first two-key route would otherwise answer by accident — and
 * because a documented `ANY` is what keeps somebody from expressing the same
 * idea as an expression engine later.
 */
export const RequireAnyPermission = (...keys: PermissionKeys) =>
  SetMetadata<string, PermissionRequirement>(REQUIRED_PERMISSIONS_KEY, {
    keys,
    mode: 'ANY',
  });

/**
 * What the route being handled requires, or `undefined` if it declares nothing.
 *
 * `undefined` is the answer for the overwhelming majority of this API's routes
 * and the guard reads it as "allow" — see `PermissionsGuard` for why gating is
 * opt-in rather than the default it is for authentication.
 *
 * A requirement carrying no keys is treated as no requirement. It cannot be
 * written through either decorator, whose signatures demand at least one; the
 * branch is here because this function's input is metadata rather than a call
 * site, and "somebody set this key by hand" should not produce a gate that
 * `every()` satisfies vacuously for everybody.
 *
 * Exported because the guard and the startup validator both read the same
 * declaration, and it lives beside the decorators that write it so one key has
 * one reader.
 */
export function readPermissionRequirement(
  reflector: Reflector,
  context: ExecutionContext,
): PermissionRequirement | undefined {
  const requirement = reflector.getAllAndOverride<
    PermissionRequirement | undefined
  >(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

  return requirement === undefined || requirement.keys.length === 0
    ? undefined
    : requirement;
}

/**
 * Whether a held permission set satisfies a requirement.
 *
 * The whole of the `ALL` / `ANY` semantics, in two lines and one place, so the
 * rule the decorators document is the rule the guard applies and the rule the
 * tests assert.
 */
export function isSatisfiedBy(
  { keys, mode }: PermissionRequirement,
  held: ReadonlySet<string>,
): boolean {
  return mode === 'ANY'
    ? keys.some((key) => held.has(key))
    : keys.every((key) => held.has(key));
}
