import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { API_BASE_PATH } from './config/api.constants';
import { configureApp } from './config/app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Every global concern (prefix, versioning, validation, CORS, shutdown
  // hooks) lives in `configureApp`, so tests can boot an identically
  // configured application.
  configureApp(app);

  // Already validated and coerced to a number by `validateEnvironment`, so
  // there is no fallback to apply here.
  const port = app.get(ConfigService).getOrThrow<number>('PORT');

  await app.listen(port);

  Logger.log(
    `Backend is listening on http://localhost:${port}${API_BASE_PATH}`,
    'Bootstrap',
  );
}

void bootstrap();
