import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { NotificationSocketIoAdapter } from '../modules/notification-delivery/websocket/notification-socket-io.adapter';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from './api.constants';
import { buildCorsOptions } from './cors.config';
import { buildHelmetOptions } from './helmet.config';
import { applyTrustProxy } from './trust-proxy.config';

/**
 * Applies every global concern to a Nest application instance.
 *
 * Bootstrap and the e2e suite both call this, so the tests exercise the exact
 * prefix, versioning, validation, security-header and CORS rules the server
 * runs with instead of a second copy that can drift.
 */
export function configureApp(app: INestApplication): void {
  // Security response headers, and **first**, because ordering is the only
  // thing that decides which responses carry them. Helmet writes its headers
  // when the middleware runs, so registering it ahead of everything else means
  // they are already on the response object by the time anything can answer:
  // a CORS preflight that ends in `enableCors`, an unmatched route's 404, a
  // `ValidationPipe` rejection, anything `AllExceptionsFilter` renders. A
  // header set only on the successful path would be missing from exactly the
  // responses an attacker is producing.
  //
  // It adds headers and nothing else — no body is touched, no status code
  // changes, and the Feature 033 envelope is byte-for-byte what it was. The
  // options themselves live in `helmet.config.ts`, next to `cors.config.ts`,
  // because they are this deployment's decisions rather than this function's.
  app.use(helmet(buildHelmetOptions(app.get(ConfigService))));

  app.setGlobalPrefix(API_PREFIX);

  // URI versioning appends `/v1` after the global prefix, so every controller
  // is served under `/api/v1` without declaring anything. A future controller
  // moves on with `@Controller({ version: '2' })`, while everything else keeps
  // answering on v1 — no route rewrite, no second bootstrap path.
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: API_VERSION_PREFIX,
    defaultVersion: API_DEFAULT_VERSION,
  });

  // Applied globally so every future DTO is validated without per-controller
  // wiring. `whitelist` strips unknown properties, `forbidNonWhitelisted`
  // rejects them outright, `transform` produces real DTO instances.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // The two halves of the response contract: the interceptor wraps every
  // successful body, the filter renders every failure. Both are stateless and
  // dependency-free, so they are instantiated here instead of being declared as
  // APP_INTERCEPTOR / APP_FILTER providers — the wiring stays in this single
  // function, next to the ValidationPipe whose errors the filter formats.
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // How far to believe `X-Forwarded-For`, which decides what `request.ip`
  // resolves to — and therefore who the rate limiter counts a request against
  // and whose address is recorded beside an issued refresh token. Applied here
  // rather than in `main.ts` so a spec booting through this function resolves
  // addresses exactly as the server does; the deployment failure modes, both of
  // which are serious, are on `parseTrustProxy`.
  applyTrustProxy(app, app.get(ConfigService));

  app.enableCors(buildCorsOptions(app.get(ConfigService)));

  // The same allowlist for the real-time side. Nest already uses `IoAdapter`;
  // this subclass exists only because a `@WebSocketGateway({ cors })` option is
  // evaluated when the class is decorated — before `.env` has been read — so the
  // environment can only be applied here. Registered inside `configureApp` so
  // the socket layer is configured by the one function that configures
  // everything else, and so a test booting through it gets the same server.
  app.useWebSocketAdapter(new NotificationSocketIoAdapter(app));

  // Makes Nest listen for termination signals and run `onModuleDestroy` on
  // every provider. Without it, PrismaService never closes its connection pool
  // on Ctrl+C or on the SIGTERM a container runtime sends.
  app.enableShutdownHooks();
}
