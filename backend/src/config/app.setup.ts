import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from './api.constants';
import { buildCorsOptions } from './cors.config';

/**
 * Applies every global concern to a Nest application instance.
 *
 * Bootstrap and the e2e suite both call this, so the tests exercise the exact
 * prefix, versioning, validation and CORS rules the server runs with instead
 * of a second copy that can drift.
 */
export function configureApp(app: INestApplication): void {
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

  app.enableCors(buildCorsOptions(app.get(ConfigService)));

  // Makes Nest listen for termination signals and run `onModuleDestroy` on
  // every provider. Without it, PrismaService never closes its connection pool
  // on Ctrl+C or on the SIGTERM a container runtime sends.
  app.enableShutdownHooks();
}
