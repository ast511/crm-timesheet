import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Database access layer.
 *
 * Marked `@Global` for the same reason `ConfigModule` is registered with
 * `isGlobal: true` in `app.module.ts`: it is cross-cutting infrastructure with
 * exactly one instance, and every future feature module would otherwise repeat
 * the same import. Dropping `@Global` and importing `PrismaModule` explicitly
 * per module is a one-line change if the dependency graph should be explicit.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
