import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/** Fallback used when PORT is absent or not a valid number. */
const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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

  // Makes Nest listen for termination signals and run `onModuleDestroy` on
  // every provider. Without it, PrismaService never closes its connection pool
  // on Ctrl+C or on the SIGTERM a container runtime sends.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = Number(configService.get<string>('PORT')) || DEFAULT_PORT;

  await app.listen(port);

  Logger.log(`Backend is listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
