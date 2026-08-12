import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import {
  PermissionRequirement,
  REQUIRED_PERMISSIONS_KEY,
} from './decorators/require-permission.decorator';

/** What a deployment carrying the contradiction is stopped with. */
export const CONTRADICTORY_ROUTE_MESSAGE =
  '@RequirePermission() cannot be combined with @Public(): a public route has no authenticated caller, so there is no permission set to check';

/**
 * Refuses to start an application in which a route is both `@Public()` and
 * permission-gated.
 *
 * The two decorators contradict each other outright. `@Public()` says the route
 * has no caller; `@RequirePermission()` asks what the caller may do. There is no
 * sensible resolution — admitting everybody would make the gate decorative, and
 * refusing everybody would make the route unusable — so the combination is not
 * given a meaning, it is rejected.
 *
 * **At startup rather than per request**, and that is the point of the class.
 * `PermissionsGuard` would answer such a route with the `401` that
 * `resolveCurrentUser` produces for a request carrying no identity, which is a
 * safe failure and a useless diagnosis: a public endpoint that answers "you are
 * not authenticated" to everybody looks like a broken client, and whoever meets
 * it first will go looking for the token they are not supposed to need. Failing
 * the boot names the controller and the method, so the mistake is found by the
 * person who made it, in the deploy that made it.
 *
 * It is the same instinct as `TokenService` reading its signing keys in the
 * constructor rather than on first use: a misconfiguration should stop a
 * container, not wait to surprise a user.
 *
 * ## How it sees the routes
 *
 * Through `DiscoveryService`, which walks the modules Nest has already
 * instantiated, and `MetadataScanner`, which lists a controller's methods.
 * `onModuleInit` runs after every module is constructed, so by the time this
 * executes the container holds every controller in the application — including
 * ones in modules this one does not import and knows nothing about. That is
 * what makes the check total rather than a check of the routes somebody
 * remembered to register.
 *
 * Handler metadata overrides class metadata here exactly as
 * `getAllAndOverride` resolves it in the guard, so this validator judges the
 * routes the way the guard will read them. A `@Public()` controller with one
 * `@RequirePermission()` method is the contradiction; a `@Public()` controller
 * whose class also carries a requirement is the same contradiction on every one
 * of its routes.
 */
@Injectable()
export class PublicRouteValidator implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    const offenders = this.findContradictions();

    if (offenders.length > 0) {
      throw new Error(
        `${CONTRADICTORY_ROUTE_MESSAGE}. Offending routes: ${offenders.join(', ')}`,
      );
    }
  }

  /**
   * Every `Controller.method` that declares both, as names a developer can
   * search for.
   *
   * All of them rather than the first: somebody who applied the pair once has
   * usually applied it several times, and a boot that fails once per fix is a
   * boot that gets fixed by guessing.
   */
  private findContradictions(): string[] {
    const offenders: string[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;

      // A controller registered with `useValue` has no class to read metadata
      // from, and one that failed to instantiate has no prototype to scan.
      // Neither can carry a decorator, so neither can carry the contradiction.
      if (instance == null || metatype == null) {
        continue;
      }

      const prototype = Object.getPrototypeOf(instance) as object;
      const controller = metatype.name;

      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[method];

        if (
          typeof handler === 'function' &&
          this.declaresBoth(handler, metatype)
        ) {
          offenders.push(`${controller}.${method}`);
        }
      }
    }

    return offenders;
  }

  /**
   * Whether the route, read as the guard reads it, is public *and* gated.
   *
   * Both parameters are typed as the bare `Function` that `Reflector` takes as
   * a metadata target: a handler pulled off a prototype and a controller class
   * are exactly that, and narrowing them would mean casting at the call site
   * instead.
   */
  private declaresBoth(handler: Function, controller: Function): boolean {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        controller,
      ]) === true;

    return (
      isPublic &&
      this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
        REQUIRED_PERMISSIONS_KEY,
        [handler, controller],
      ) !== undefined
    );
  }
}
