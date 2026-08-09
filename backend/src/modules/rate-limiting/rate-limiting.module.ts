import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';

import { isStrictlyRateLimited } from './decorators/strict-rate-limit.decorator';
import { loadRateLimitConfig } from './rate-limiting.config';
import {
  DEFAULT_THROTTLER_NAME,
  STRICT_THROTTLER_NAME,
} from './rate-limiting.constants';
import { ApiThrottlerGuard } from './rate-limiting.guard';

/**
 * Rate limiting: how fast anybody may ask, proved rather than assumed.
 *
 * Cross-cutting plumbing rather than a resource, like Error Code
 * Standardization (Feature 033) — it owns no table, exposes no endpoint and
 * changes no behaviour of any module, and it applies to all of them. It closes
 * the gap Feature 032 recorded as its highest-priority follow-up: `/auth/login`
 * and `/auth/refresh` are unauthenticated and each does real work per request,
 * and until now the request *rate* against them was unbounded.
 *
 * ## What is imported, and what is not
 *
 * `ThrottlerModule.forRootAsync`, because both tiers are read from validated
 * configuration and `ConfigService` is only available through the injector.
 * That is also why the limits are not `@Throttle()` decorators on the two auth
 * handlers, which is the shape the library documents first: a decorator's
 * arguments are evaluated when the class is *defined*, which happens while
 * `app.module.ts`'s imports are being resolved — before `ConfigModule.forRoot()`
 * has read a single variable. Any number written there would be a literal in the
 * source that no deployment could change, which is exactly what this project
 * means by a magic number.
 *
 * `ConfigModule` is global, so `ConfigService` is injectable without being
 * imported, and `Reflector` is supplied by Nest core. Nothing else is imported
 * at all: this module reads no table, calls no service and depends on no
 * business module — including `AuthModule`, whose two routes it protects. It
 * knows them only through a decorator they carry, which is what keeps the
 * dependency pointing the harmless way round.
 *
 * ## The dependency
 *
 * One new package, `@nestjs/throttler`, with **no runtime dependencies of its
 * own**. It is here for the part that is easy to write and hard to write
 * correctly: a sliding window whose counter does not reset on every request, a
 * per-key store that expires its own entries, and the `X-RateLimit-*` headers.
 * The same call Feature 032 made in taking `@nestjs/jwt` for verification while
 * writing the header parsing by hand — and this module writes by hand the two
 * parts that are *this application's* decisions rather than the library's: what
 * a client is keyed on, and what a refusal looks like.
 *
 * ## Storage: in-memory, and the limit of that
 *
 * The default store is a `Map` in the process, which is correct for one backend
 * instance and is what this deployment runs. **With more than one instance the
 * counters are per-instance and the effective limit multiplies by the instance
 * count** — three replicas behind a load balancer mean an attacker gets three
 * times the allowance, and which one they get depends on where the balancer
 * sends them. Nothing here detects that; it is a property of the topology.
 *
 * The fix, when the application is scaled horizontally, is a shared store behind
 * the same `ThrottlerStorage` interface — the Redis adapter is the usual choice
 * — supplied through the `storage` option below. It is deliberately not built
 * now: it would add a Redis dependency, a connection to configure and a new
 * failure mode (what does the limiter do when the store is unreachable?) to an
 * application that runs as a single instance today. Recorded in
 * `FEATURES/034-rate-limiting.md` as the documented next step, consistent with
 * how this project defers scale concerns rather than guessing at them.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, Reflector],
      useFactory: (
        configService: ConfigService,
        reflector: Reflector,
      ): ThrottlerModuleOptions => {
        const limits = loadRateLimitConfig(configService);

        return {
          throttlers: [
            // The baseline. Every route, including the `@Public()` ones —
            // public means "no credential required", never "unlimited", and
            // the routes nobody has to authenticate for are the ones most
            // worth bounding.
            {
              name: DEFAULT_THROTTLER_NAME,
              limit: limits.defaultLimit,
              ttl: limits.defaultTtlMs,
            },
            // The strict tier, counted *in addition to* the baseline on the
            // routes that ask for it. `skipIf` is what confines it: the guard
            // evaluates both tiers on every request, and this one steps aside
            // for any route not carrying `@StrictRateLimit()` without touching
            // the store. The alternative the library offers — `@SkipThrottle`
            // — would have meant decorating every other controller in the
            // application to opt *out*, which is a denylist, and a denylist
            // fails open the day somebody forgets one.
            {
              name: STRICT_THROTTLER_NAME,
              limit: limits.authLimit,
              ttl: limits.authTtlMs,
              skipIf: (context) => !isStrictlyRateLimited(reflector, context),
            },
          ],
        };
      },
    }),
  ],
  providers: [ApiThrottlerGuard],
  exports: [ApiThrottlerGuard],
})
export class RateLimitingModule {}
