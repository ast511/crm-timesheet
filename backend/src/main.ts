import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { API_BASE_PATH } from './config/api.constants';
import { configureApp } from './config/app.setup';
import { SWAGGER_DOCS_ROUTE } from './config/swagger.config';
import { setupSwagger } from './config/swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Every global concern (prefix, versioning, validation, CORS, shutdown
  // hooks) lives in `configureApp`, so tests can boot an identically
  // configured application.
  configureApp(app);

  // The API's own documentation, generated from the application `configureApp`
  // has just finished configuring — which is why it is called here and in this
  // order. It reads the global prefix and the versioning to produce the real
  // paths, and it is env-gated: off in production unless a deployment says
  // otherwise. See `swagger.setup.ts`.
  const docsEnabled = setupSwagger(app);

  // Already validated and coerced to a number by `validateEnvironment`, so
  // there is no fallback to apply here.
  const port = app.get(ConfigService).getOrThrow<number>('PORT');

  await app.listen(port);

  Logger.log(
    `Backend is listening on http://localhost:${port}${API_BASE_PATH}`,
    'Bootstrap',
  );

  if (docsEnabled) {
    Logger.log(
      `API documentation on http://localhost:${port}${SWAGGER_DOCS_ROUTE}`,
      'Bootstrap',
    );
  }
}

void bootstrap();
